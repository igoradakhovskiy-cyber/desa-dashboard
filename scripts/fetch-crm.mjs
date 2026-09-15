#!/usr/bin/env node
/**
 * Desa Harmonis 2 dashboard — CRM layer from Google Sheets.
 *
 * Runs AFTER fetch-meta.mjs: reads .data/latest.json, pulls TWO tabs of the CRM
 * export, joins both onto the Meta data by UTM, and writes the `crm` block back
 * into the same file.
 *
 *   client_data        every lead the CRM ever created — lead counts, current
 *                      status, geo. The top of the funnel.
 *   История статусов   qualified leads only, with one date column per funnel
 *                      stage (05.Qualified … 13.Contract Payment Received).
 *                      Quals and everything deeper than a qual come from here.
 *
 * Both tabs join the same way, because every ad carries
 *   utm_source=facebook&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
 * so `UTM Campaign` is the campaign name verbatim and `UTM Content` is the ad name.
 *
 * The two tabs are independent LAYERS with independent health. Whichever one
 * breaks is frozen on its last good version while the other keeps updating: a
 * filter left on the sales-funnel tab must not take the lead numbers down with
 * it, and a broken client_data must not hide the funnel.
 *
 * The sheet is readable by link, so this is a plain unauthenticated fetch of the
 * gviz CSV export — no OAuth, no service account, no API key. If the sheet is ever
 * made private this script fails loudly and the fallback is a service account +
 * Sheets API with the JSON key in a GitHub Secret.
 *
 * No npm deps — Node 18+ global fetch only.
 */

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isoFromCrm, ruFromIso } from './countries.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_FILE = path.join(ROOT, '.data', 'latest.json')

// ---------------------------------------------------------------- config ----
const SHEET_ID = process.env.SHEET_ID || '1ipjwK0P-jGOy8KQ0_J58I8F8e7wRZL2OiZLnLsoA5g0'
const SHEET_TAB = process.env.SHEET_TAB || 'client_data'
const HIST_TAB = process.env.HIST_TAB || 'История статусов'
/** A gid survives a tab rename, the name does not — so the gid is tried first. */
const HIST_GID = process.env.HIST_GID || '443728855'
const QUAL_VALUE = (process.env.QUAL_VALUE || 'qualified').toLowerCase()
const VERIFY = process.argv.includes('--verify')
/** Local runs abort on a bad sheet; CI keeps the last good layer and deploys anyway. */
const STRICT = process.argv.includes('--strict')
/** Live dashboard, used to recover the previously deployed CRM layer as a baseline. */
const DASHBOARD_URL =
  process.env.DASHBOARD_URL || 'https://igoradakhovskiy-cyber.github.io/desa-dashboard/'
/**
 * A filter left on the sheet drops `rows_total` off a cliff — 3118 → 33 on
 * 27.07.2026, which killed the whole deploy for two days. Anything past this
 * much shrinkage is breakage, never organic: rows are only ever appended.
 */
const ROWS_DROP_LIMIT = 0.4
/**
 * Past this share of unparsable dates the date column itself has changed format
 * (someone reformatted the column, or the locale flipped). Without this the rows
 * would just quietly vanish into `bad_date` and the funnel would look empty.
 */
const BAD_DATE_LIMIT = 0.3

/**
 * client_data is addressed BY INDEX, not by header name, on purpose: the tab has
 * two different columns both titled "Квалификация" — F (index 5, values
 * ""/"Qualified") and Z (index 25, values ""/"1"), a different definition.
 * A name lookup would silently grab the wrong one.
 */
const COL = {
  date: 1, // B  Дата создания        DD.MM.YYYY
  qual: 5, // F  Квалификация         "" | "Qualified"   ← cross-check only, see below
  pipeline: 4, // E  Воронка
  status: 6, // G  Статус
  country: 7, // H  Страна
  campaign: 14, // O  UTM Campaign       = {{campaign.name}}
  ad: 15, // P  UTM Content          = {{ad.name}}
}

/** Header cells that must match exactly, or the tab/layout changed under us. */
const EXPECTED_HEADER = {
  1: 'Дата создания',
  5: 'Квалификация',
  6: 'Статус',
  7: 'Страна',
  14: 'UTM Campaign',
  15: 'UTM Content',
}

/**
 * "История статусов" is addressed BY HEADER NAME, unlike client_data: every
 * non-empty header on that tab is unique, so a name lookup is unambiguous — and
 * the tab is maintained by hand, where inserting a column is an ordinary Tuesday.
 * Index addressing would turn that into silent data corruption.
 */
const HIST_FIELDS = {
  date: 'Создана', // DD.MM.YYYY — lead creation date, the cohort key
  status: 'Текущий статус',
  country: 'Страна',
  campaign: 'UTM Campaign',
  ad: 'UTM Content',
  lost: 'Lost / Closed', // terminal, not a funnel stage
}

/**
 * A funnel stage is any "NN.Name" header to the right of UTM Content, taken in
 * sheet order. Deliberately open-ended: when sales adds a deeper stage to the
 * pipeline, it reaches the dashboard on the next run without a code change.
 */
const STAGE_RE = /^\d{2}\.\s*\S/
/** Absence of any of these is not "a column was added", it is "the tab moved". */
const STAGES_REQUIRED = [
  '05.Qualified',
  '06.Meeting Set',
  '07.Online Meeting',
  '13.Contract Payment Received',
]

// ------------------------------------------------------------- utilities ----
/** RFC4180-ish CSV parser: handles quoted fields, escaped quotes and embedded newlines. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const cell = (row, i) => (i === undefined || i < 0 || row[i] === undefined ? '' : String(row[i]).trim())
/** Join keys are compared case-insensitively — Meta sometimes lowercases macro output. */
const norm = (s) => String(s || '').trim().toLowerCase()

/**
 * The CRM writes "—" into a UTM cell when the lead did not come from an ad at all
 * (WhatsApp, direct, a referral). Without this it reads as a campaign name, misses
 * the lookup and lands in `unknown_campaign` — i.e. organic leads get reported as
 * "an old flight we excluded", and they drag down the join-rate that is supposed
 * to detect a genuinely broken join.
 */
const PLACEHOLDER = new Set(['—', '–', '-', '', 'n/a', 'null', 'undefined'])
const utm = (s) => (PLACEHOLDER.has(norm(s)) ? '' : String(s).trim())

/**
 * An unsubstituted macro, in either dialect: Meta's own `{{campaign.name}}` and
 * the single-brace `{utm_campaign}` that a broken link template leaves behind.
 */
const MACRO_RE = /\{+[^}]*\}+/

/** "25.06.2025" -> "2025-06-25"; returns null on anything else. */
function toIso(ddmmyyyy) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(ddmmyyyy).trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** "1 строка / 3 строки / 33 строки / 3118 строк" — these strings go straight into the UI. */
function plural(n, one, few, many) {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 14) return `${n} ${many}`
  const m10 = n % 10
  if (m10 === 1) return `${n} ${one}`
  if (m10 >= 2 && m10 <= 4) return `${n} ${few}`
  return `${n} ${many}`
}
const rowsRu = (n) => plural(n, 'строку', 'строки', 'строк')

function makeUnmatched() {
  return {
    macro: 0, // {{campaign.name}} / {{ad.name}} — Meta never substituted the macro
    unknown_campaign: 0, // campaign not in the dashboard window (older flights)
    unknown_ad: 0, // campaign matched but the ad no longer exists in the account
    no_utm: 0,
    bad_date: 0,
    out_of_window: 0,
    examples: {},
  }
}

/**
 * The CRM's country label → the key the geo table joins on.
 *
 * Meta reports ISO codes, the CRM writes English CLDR names, so everything is
 * keyed by ISO. A label that resolves to nothing keeps its raw text as its own
 * key: it then shows up as a country with no spend at the bottom of the table,
 * which is visible, instead of being dropped, which is not. `unknown` collects
 * those labels so the run can say so out loud.
 */
function geoKey(raw, unknown) {
  const name = String(raw || '').trim()
  if (!name || name === '—') return null
  const iso = isoFromCrm(name)
  if (iso) return iso
  unknown.add(name)
  return name
}

const noteExample = (unmatched, bucket, value) => {
  const arr = (unmatched.examples[bucket] ||= [])
  if (value && arr.length < 5 && !arr.includes(value)) arr.push(value)
}

// ------------------------------------------------------------- fetching -----
/**
 * One tab as parsed CSV rows, addressed by gid first and by name second.
 *
 * A gid survives someone renaming the tab; a name survives someone deleting and
 * recreating it. Neither is trustworthy on its own — gviz answers HTTP 200 and
 * serves the FIRST tab for a wrong name AND for a wrong gid — so `validate` runs
 * on each candidate and a failure moves on to the next addressing mode. That
 * check, not the URL, is what proves we are on the right tab.
 *
 * `validate` returns whatever the caller needs from the header (resolved column
 * indices, say) and throws when the header is not the expected one.
 */
async function fetchTab({ tab, gid, validate }) {
  const attempts = []
  if (gid) attempts.push({ label: `gid ${gid}`, qs: `gid=${encodeURIComponent(gid)}` })
  attempts.push({ label: `tab "${tab}"`, qs: `sheet=${encodeURIComponent(tab)}` })

  let lastErr = null
  for (const [i, a] of attempts.entries()) {
    const last = i === attempts.length - 1
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&${a.qs}`
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) {
      lastErr = new Error(
        `sheet fetch failed for ${a.label}: HTTP ${res.status}. ` +
          'If link sharing was turned off, switch to a service account + Sheets API.',
      )
      continue
    }
    const rows = parseCsv(await res.text()).filter((r) => r.some((c) => String(c).trim() !== ''))
    if (!rows.length) {
      lastErr = new Error(`sheet returned no rows for ${a.label}`)
      continue
    }
    try {
      // Only the last attempt is allowed to print its complaint: an earlier one
      // failing is a recovery, not an incident, and logging it as an error is how
      // people end up chasing the wrong problem.
      const meta = validate(rows[0], last)
      return { rows, via: a.label, meta }
    } catch (e) {
      lastErr = e
      if (!last) console.warn(`  ⤷ ${a.label} отдал не ту вкладку, пробую следующий способ`)
    }
  }
  throw lastErr
}

// ---------------------------------------------------- header verification ----
/** client_data: fixed indices, exact match, no tolerance. */
function verifyBaseHeader(hdr, loud = true) {
  const bad = Object.entries(EXPECTED_HEADER).filter(([i, name]) => cell(hdr, Number(i)) !== name)
  if (!bad.length) return null
  if (loud) {
    console.error(`✖ unexpected header on "${SHEET_TAB}" — wrong tab, or the layout changed.`)
    console.error(`  got: ${hdr.slice(0, 17).map((h, i) => `${i}:${h}`).join(' | ')}`)
    for (const [i, name] of bad) {
      console.error(`  col ${i}: expected "${name}", got "${cell(hdr, Number(i))}"`)
    }
  }
  throw new Error(`CRM header validation failed for "${SHEET_TAB}"`)
}

/**
 * История статусов: resolve every column by its header text, and discover the
 * funnel stages from the header row itself.
 *
 * Throws with the missing names spelled out — a header that moved is a human
 * problem with a human fix, and "col 11 expected X" would send whoever reads the
 * log counting columns.
 */
export function resolveHistColumns(hdr, loud = true) {
  const at = (name) => hdr.findIndex((c) => String(c).trim() === name)
  const col = {}
  const missing = []
  for (const [field, name] of Object.entries(HIST_FIELDS)) {
    const i = at(name)
    if (i < 0) missing.push(`колонка "${name}"`)
    col[field] = i
  }
  if (missing.length) {
    if (loud) {
      console.error(`✖ "${HIST_TAB}": не найдено — ${missing.join(', ')}`)
      console.error(`  got: ${hdr.map((h, i) => `${i}:${h}`).filter((s) => !s.endsWith(':')).join(' | ')}`)
    }
    throw new Error(`CRM header validation failed for "${HIST_TAB}"`)
  }

  const stages = []
  hdr.forEach((c, i) => {
    const key = String(c).trim()
    if (i > col.ad && STAGE_RE.test(key)) stages.push({ key, col: i })
  })
  const absent = STAGES_REQUIRED.filter((k) => !stages.some((s) => s.key === k))
  if (absent.length) {
    if (loud) {
      console.error(`✖ "${HIST_TAB}": нет обязательных этапов — ${absent.join(', ')}`)
      console.error(`  найдены этапы: ${stages.map((s) => s.key).join(' | ') || '(ни одного)'}`)
    }
    throw new Error(`CRM header validation failed for "${HIST_TAB}"`)
  }
  return { col, stages }
}

// ------------------------------------------------------------- baseline -----
/**
 * Last successfully deployed CRM layer, read back out of the live dashboard's own
 * encrypted blob.
 *
 * The alternative — committing a baseline file from CI — needs `contents: write`
 * and pushes a commit every three hours. The deployed artefact is already the
 * authoritative "last good state", costs no permissions, and self-heals: once a
 * healthy run deploys, the next run's baseline is that healthy run.
 *
 * Returns null whenever anything at all goes wrong. A missing baseline must
 * degrade to "no drop check", never to a failed build.
 */
async function loadDeployedBaseline() {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) return null
  try {
    const res = await fetch(new URL('data/latest.enc', DASHBOARD_URL))
    if (!res.ok) return null
    const blob = await res.json()
    const key = crypto.pbkdf2Sync(password, Buffer.from(blob.salt, 'base64'), blob.iter, 32, 'sha256')
    const ct = Buffer.from(blob.ct, 'base64')
    const dec = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'))
    // encrypt-data.mjs appends the 16-byte GCM tag to the ciphertext
    dec.setAuthTag(ct.subarray(ct.length - 16))
    const plain = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()])
    const prev = JSON.parse(plain.toString('utf8'))
    return prev.crm || null
  } catch {
    return null
  }
}

/**
 * Take a published `crm` block apart into the two layers that produced it.
 *
 * This is what makes per-source freezing possible: the block on the dashboard is
 * merged (one `daily` array carrying both leads and quals), but a freeze has to
 * restore exactly one half of it. Splitting on read costs nothing and avoids
 * shipping both the layers and the merge to the browser.
 */
export function splitLayers(crm) {
  if (!crm) return { base: null, stg: null }
  const daily = crm.daily || []
  // A baseline published before geography was keyed by ISO carries the CRM's raw
  // English labels. Re-keying on read means a frozen layer still joins onto Meta
  // spend instead of showing up as a country nobody advertised in.
  const geo = (crm.geo || []).map((r) => ({ ...r, country: isoFromCrm(r.country) || r.country }))
  const base = {
    fetched_at: crm.fetched_at,
    rows_total: crm.rows_total,
    rows_in_window: crm.rows_in_window,
    rows_matched: crm.rows_matched,
    unmatched: crm.unmatched || makeUnmatched(),
    daily: daily
      .filter((r) => r.leads)
      .map(({ date, campaign_id, ad_key, leads }) => ({ date, campaign_id, ad_key, leads })),
    status: crm.status || [],
    geo: geo
      .filter((r) => r.leads)
      .map(({ date, campaign_id, country, leads }) => ({ date, campaign_id, country, leads })),
  }
  // Datasets published before the stage layer existed have no `stages` at all —
  // there is nothing to freeze onto, and the caller must treat that as "no baseline".
  const stg = crm.stages
    ? {
        fetched_at: crm.hist_fetched_at || crm.fetched_at,
        rows_total: crm.hist_rows_total,
        rows_in_window: crm.hist_rows_in_window,
        rows_matched: crm.hist_rows_matched,
        unmatched: crm.hist_unmatched || makeUnmatched(),
        qual_total: crm.qual_total,
        daily: daily
          .filter((r) => r.qual)
          .map(({ date, campaign_id, ad_key, qual }) => ({ date, campaign_id, ad_key, qual })),
        geo: geo
          .filter((r) => r.qual)
          .map(({ date, campaign_id, country, qual }) => ({ date, campaign_id, country, qual })),
        stages: crm.stages,
        stage_defs: crm.stage_defs || [],
        lost: crm.lost || [],
      }
    : null
  return { base, stg }
}

// ------------------------------------------------------------ diagnosis -----
/**
 * Names the failure instead of just detecting one. Returns null when healthy.
 *
 * The distinction that matters: a *truncated source* (rows vanished, but the ones
 * left still join fine) and a *broken join* (rows are there, they stopped
 * matching) look identical to a plain match-rate floor, and have opposite fixes.
 */
export function diagnose({ tab, baseline, rowsTotal, inWindow, badDate, rate }) {
  const prev = baseline && baseline.rows_total
  if (prev && rowsTotal < prev * (1 - ROWS_DROP_LIMIT)) {
    const lost = prev - rowsTotal
    return {
      reason: 'source_truncated',
      message:
        `Лист "${tab}" отдал ${rowsRu(rowsTotal)} вместо ${prev} — пропало ${lost} ` +
        `(−${(((prev - rowsTotal) / prev) * 100).toFixed(0)}%). Строки в эту выгрузку только добавляются, ` +
        'так что это не естественная убыль.',
      hint:
        `Почти наверняка на вкладке "${tab}" оставлен фильтр: экспорт Google Sheets отдаёт ` +
        'только видимые строки. Снимите фильтр (Данные → Отключить фильтр) и нажмите «Обновить данные».',
    }
  }
  if (rowsTotal && badDate / rowsTotal > BAD_DATE_LIMIT) {
    return {
      reason: 'date_format_broken',
      message:
        `На листе "${tab}" не читается дата у ${rowsRu(badDate)} из ${rowsTotal} ` +
        `(${((badDate / rowsTotal) * 100).toFixed(0)}%).`,
      hint:
        'Дашборд ждёт формат ДД.ММ.ГГГГ. Похоже, колонку с датой переформатировали или ' +
        'сменили локаль таблицы: выделите её и верните формат «Дата» вида 25.06.2026.',
    }
  }
  if (!inWindow) {
    return {
      reason: 'no_rows_in_window',
      message: `В окне дашборда нет ни одной строки с листа "${tab}" (всего на листе ${rowsRu(rowsTotal)}).`,
      hint: `Проверьте фильтр на вкладке "${tab}", формат дат в колонке с датой создания и MIN_DATE.`,
    }
  }
  if (rate < 50) {
    return {
      reason: 'join_broken',
      message: `Склейка листа "${tab}" с Meta ${rate.toFixed(1)}% — ниже порога 50%.`,
      hint:
        'Строки на месте, но не сходятся по UTM. Проверьте, что в объявлениях остались ' +
        'utm_campaign={{campaign.name}} и utm_content={{ad.name}}.',
    }
  }
  return null
}

function healthFor({ tab, problem, frozen, rowsTotal, baseline, rate }) {
  return {
    ok: !problem,
    stale: !!frozen,
    reason: problem ? problem.reason : 'ok',
    message: problem ? problem.message : null,
    hint: problem ? problem.hint : null,
    tab,
    checked_at: new Date().toISOString(),
    frozen_at: frozen ? frozen.fetched_at : null,
    rows_total: rowsTotal,
    baseline_rows_total: baseline ? baseline.rows_total ?? null : null,
    match_rate: Number(rate.toFixed(1)),
  }
}

// ------------------------------------------------------------ join logic ----
/**
 * The UTM join, identical for both tabs. Returns the matched campaign and the
 * canonical ad name, or null plus the bucket the row fell into.
 */
function joinRow({ iso, rawCamp, rawAd, lookups, unmatched, MIN, MAX }) {
  if (!iso) {
    unmatched.bad_date++
    return null
  }
  if (iso < MIN || iso > MAX) {
    unmatched.out_of_window++
    return null
  }
  if (!rawCamp && !rawAd) {
    unmatched.no_utm++
    return { inWindow: true, camp: null }
  }
  if (MACRO_RE.test(rawCamp) || MACRO_RE.test(rawAd)) {
    unmatched.macro++
    noteExample(unmatched, 'macro', rawCamp || rawAd)
    return { inWindow: true, camp: null }
  }
  const camp = lookups.campByName.get(norm(rawCamp))
  if (!camp) {
    // Older flights (Desa_inv, HunterMob) still produce late leads. They are
    // excluded on purpose: their spend is outside the window, so counting their
    // quals would make CPQL wrong. They surface in the diagnostics chip instead.
    unmatched.unknown_campaign++
    noteExample(unmatched, 'unknown_campaign', rawCamp)
    return { inWindow: true, camp: null }
  }
  const adKey = lookups.adNameByNorm.get(norm(rawAd)) || null
  if (!adKey) {
    unmatched.unknown_ad++
    noteExample(unmatched, 'unknown_ad', rawAd)
    // still counted at campaign level — only the creative gallery misses it
  }
  return { inWindow: true, camp, adKey }
}

// ------------------------------------------------- layer: client_data -------
/** Every lead the CRM created: counts, current status, geo. The top of the funnel. */
export function readBaseLayer(body, lookups, MIN, MAX) {
  const unmatched = makeUnmatched()
  const daily = new Map() // `${date}|${campaign_id}|${ad_key}` -> leads
  const status = new Map() // `${date}|${campaign_id}|${status}` -> n
  const geo = new Map() // `${date}|${campaign_id}|${iso}` -> leads
  const unknownGeo = new Set()
  let inWindow = 0
  let matched = 0
  let legacyQual = 0 // column F, kept as a cross-check against the funnel tab

  for (const r of body) {
    const iso = toIso(cell(r, COL.date))
    const j = joinRow({
      iso,
      rawCamp: utm(cell(r, COL.campaign)),
      rawAd: utm(cell(r, COL.ad)),
      lookups,
      unmatched,
      MIN,
      MAX,
    })
    if (!j) continue
    inWindow++
    if (!j.camp) continue

    matched++
    if (cell(r, COL.qual).toLowerCase() === QUAL_VALUE) legacyQual++
    const k = `${iso}|${j.camp.id}|${j.adKey || ''}`
    daily.set(k, (daily.get(k) || 0) + 1)

    // campaign_id rides along so the UI can filter these blocks by language too
    const st = cell(r, COL.status)
    if (st) {
      const sk = `${iso}|${j.camp.id}|${st}`
      status.set(sk, (status.get(sk) || 0) + 1)
    }

    const country = geoKey(cell(r, COL.country), unknownGeo)
    if (country) {
      const gk = `${iso}|${j.camp.id}|${country}`
      geo.set(gk, (geo.get(gk) || 0) + 1)
    }
  }

  return {
    fetched_at: new Date().toISOString(),
    rows_total: body.length,
    rows_in_window: inWindow,
    rows_matched: matched,
    legacy_qual: legacyQual,
    unmatched,
    daily: [...daily.entries()].map(([k, leads]) => {
      const [date, campaign_id, ad_key] = k.split('|')
      return { date, campaign_id, ad_key: ad_key || null, leads }
    }),
    status: [...status.entries()].map(([k, n]) => {
      const [date, campaign_id, name] = k.split('|')
      return { date, campaign_id, status: name, n }
    }),
    geo: [...geo.entries()].map(([k, leads]) => {
      const [date, campaign_id, country] = k.split('|')
      return { date, campaign_id, country, leads }
    }),
    unknown_geo: [...unknownGeo],
  }
}

// -------------------------------------------- layer: История статусов -------
/**
 * Qualified leads and the funnel below them.
 *
 * Two things about this tab drive the whole shape of the output:
 *
 * 1. Every row IS a qual. The 05.Qualified date is missing on ~7% of rows that
 *    clearly progressed further, so qualification is read off the row's presence,
 *    never off a cell.
 *
 * 2. The funnel is not monotone. 52 rows carry a 07.Online Meeting date with no
 *    06.Meeting Set date — sales skips a rung and back-fills it never. So a stage
 *    counts a lead when that stage OR ANY DEEPER ONE has a date. That makes the
 *    ladder monotone by construction, and means "8 meetings set" never reads as
 *    less than the 10 leads that demonstrably got a meeting.
 *
 * Each reached stage carries two dates so the UI can switch between them: the
 * lead's creation date (cohort — pairs with the spend that bought the lead) and
 * the event date (when the stage was actually reached).
 */
export function readStageLayer(body, hist, lookups, MIN, MAX) {
  const { col, stages } = hist
  const unmatched = makeUnmatched()
  unmatched.qual_only_in_history = 0 // filled during the merge
  unmatched.bad_stage_date = 0

  const daily = new Map() // `${lead_date}|${campaign_id}|${ad_key}` -> qual
  const geo = new Map() // `${lead_date}|${campaign_id}|${iso}` -> qual
  const unknownGeo = new Set()
  const stageAgg = new Map() // `${stage}|${lead}|${event}|${campaign}|${ad}` -> n
  const lostAgg = new Map() // `${lead}|${event}|${campaign}|${ad}` -> n
  let inWindow = 0
  let matched = 0

  for (const r of body) {
    const iso = toIso(cell(r, col.date))
    const j = joinRow({
      iso,
      rawCamp: utm(cell(r, col.campaign)),
      rawAd: utm(cell(r, col.ad)),
      lookups,
      unmatched,
      MIN,
      MAX,
    })
    if (!j) continue
    inWindow++
    if (!j.camp) continue

    matched++
    const adKey = j.adKey || ''
    const dk = `${iso}|${j.camp.id}|${adKey}`
    daily.set(dk, (daily.get(dk) || 0) + 1)

    const country = geoKey(cell(r, col.country), unknownGeo)
    if (country) {
      const gk = `${iso}|${j.camp.id}|${country}`
      geo.set(gk, (geo.get(gk) || 0) + 1)
    }

    // ---- stage depth ----
    const dates = stages.map((s) => {
      const raw = cell(r, s.col)
      if (!raw) return null
      const d = toIso(raw)
      if (!d) unmatched.bad_stage_date++ // text in a date cell: not a reached stage
      return d
    })
    // Walk backwards so each stage inherits "reached" and the earliest date from
    // everything deeper than it — that is the whole cumulative rule, in one pass.
    let deepestDate = null
    const reached = new Array(stages.length).fill(false)
    const eventAt = new Array(stages.length).fill(null)
    for (let i = stages.length - 1; i >= 0; i--) {
      if (dates[i] && (!deepestDate || dates[i] < deepestDate)) deepestDate = dates[i]
      reached[i] = !!dates[i] || (i + 1 < stages.length && reached[i + 1])
      eventAt[i] = deepestDate
    }
    // The row is a qual by definition, even when nobody stamped the qual column.
    reached[0] = true
    if (!eventAt[0]) eventAt[0] = iso

    for (let i = 0; i < stages.length; i++) {
      if (!reached[i]) continue
      const k = `${stages[i].key}|${iso}|${eventAt[i]}|${j.camp.id}|${adKey}`
      stageAgg.set(k, (stageAgg.get(k) || 0) + 1)
    }

    const lostRaw = cell(r, col.lost)
    if (lostRaw) {
      const lostIso = toIso(lostRaw) || iso
      const lk = `${iso}|${lostIso}|${j.camp.id}|${adKey}`
      lostAgg.set(lk, (lostAgg.get(lk) || 0) + 1)
    }
  }

  const unpackStage = ([k, n]) => {
    const [stage, lead_date, event_date, campaign_id, ad_key] = k.split('|')
    return { stage, lead_date, event_date, campaign_id, ad_key: ad_key || null, n }
  }

  return {
    fetched_at: new Date().toISOString(),
    rows_total: body.length,
    rows_in_window: inWindow,
    rows_matched: matched,
    qual_total: matched,
    unmatched,
    daily: [...daily.entries()].map(([k, qual]) => {
      const [date, campaign_id, ad_key] = k.split('|')
      return { date, campaign_id, ad_key: ad_key || null, qual }
    }),
    geo: [...geo.entries()].map(([k, qual]) => {
      const [date, campaign_id, country] = k.split('|')
      return { date, campaign_id, country, qual }
    }),
    unknown_geo: [...unknownGeo],
    stage_defs: stages.map((s, i) => ({ key: s.key, depth: i })),
    stages: [...stageAgg.entries()].map(unpackStage).sort((a, b) => (a.lead_date < b.lead_date ? -1 : 1)),
    lost: [...lostAgg.entries()]
      .map(([k, n]) => {
        const [lead_date, event_date, campaign_id, ad_key] = k.split('|')
        return { lead_date, event_date, campaign_id, ad_key: ad_key || null, n }
      })
      .sort((a, b) => (a.lead_date < b.lead_date ? -1 : 1)),
  }
}

// ---------------------------------------------------------------- merge -----
/**
 * One `crm` block out of the two layers, with the shape the UI already reads:
 * `daily[]` and `geo[]` keep carrying both `leads` and `qual`, so every existing
 * component picks up the new qual source without a single change.
 */
export function mergeLayers(base, stg) {
  const daily = new Map()
  const geo = new Map()
  const put = (map, key, field, n, init) => {
    const v = map.get(key) || init()
    v[field] += n
    map.set(key, v)
  }
  const dailyInit = () => ({ leads: 0, qual: 0 })

  for (const r of base.daily) {
    put(daily, `${r.date}|${r.campaign_id}|${r.ad_key || ''}`, 'leads', r.leads, dailyInit)
  }
  for (const r of base.geo) {
    put(geo, `${r.date}|${r.campaign_id}|${r.country}`, 'leads', r.leads, dailyInit)
  }

  let qualOnly = 0
  for (const r of stg?.daily || []) {
    const k = `${r.date}|${r.campaign_id}|${r.ad_key || ''}`
    // A qual with no matching client_data bucket: the funnel tab already knows
    // about a lead the lead tab has not caught up with. Counted, never dropped —
    // otherwise the qual would silently disappear from every breakdown.
    if (!daily.has(k)) qualOnly += r.qual
    put(daily, k, 'qual', r.qual, dailyInit)
  }
  for (const r of stg?.geo || []) {
    put(geo, `${r.date}|${r.campaign_id}|${r.country}`, 'qual', r.qual, dailyInit)
  }

  const histUnmatched = { ...(stg?.unmatched || makeUnmatched()), qual_only_in_history: qualOnly }

  return {
    source: 'google_sheets',
    sheet_id: SHEET_ID,
    tab: SHEET_TAB,
    hist_tab: HIST_TAB,
    fetched_at: base.fetched_at,
    hist_fetched_at: stg?.fetched_at || null,
    rows_total: base.rows_total,
    rows_in_window: base.rows_in_window,
    rows_matched: base.rows_matched,
    unmatched: base.unmatched,
    hist_rows_total: stg?.rows_total ?? 0,
    hist_rows_in_window: stg?.rows_in_window ?? 0,
    hist_rows_matched: stg?.rows_matched ?? 0,
    hist_unmatched: histUnmatched,
    qual_total: stg?.qual_total ?? 0,
    daily: [...daily.entries()]
      .map(([k, v]) => {
        const [date, campaign_id, ad_key] = k.split('|')
        return { date, campaign_id, ad_key: ad_key || null, leads: v.leads, qual: v.qual }
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    status: base.status.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    geo: [...geo.entries()]
      .map(([k, v]) => {
        const [date, campaign_id, country] = k.split('|')
        return { date, campaign_id, country, leads: v.leads, qual: v.qual }
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    stage_defs: stg?.stage_defs || [],
    stages: stg?.stages || [],
    lost: stg?.lost || [],
  }
}

// ------------------------------------------------------------------- main ---
async function main() {
  if (!existsSync(DATA_FILE)) {
    throw new Error('.data/latest.json not found — run fetch-meta.mjs first')
  }
  const ds = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'))
  const baseline = await loadDeployedBaseline()
  const prev = splitLayers(baseline)
  if (baseline) {
    console.log(
      `▶ Baseline from live dashboard: ${baseline.rows_total} rows on "${SHEET_TAB}", ` +
        `${prev.stg ? `${prev.stg.rows_total} on "${HIST_TAB}"` : 'no stage layer'} (${baseline.fetched_at})`,
    )
  } else {
    console.log('▶ No baseline available (first run, or dashboard unreachable) — drop check skipped')
  }

  console.log(`▶ CRM sheet ${SHEET_ID} · tabs "${SHEET_TAB}" + "${HIST_TAB}"`)

  const MIN = ds.date_min
  const MAX = ds.date_max
  const lookups = {
    campByName: new Map(ds.campaigns.map((c) => [norm(c.name), c])),
    adNameByNorm: new Map(), // normalised ad name -> canonical ad name (creative key)
  }
  for (const a of ds.ads) {
    if (!lookups.adNameByNorm.has(norm(a.name))) lookups.adNameByNorm.set(norm(a.name), a.name)
  }

  // ---- layer 1: client_data --------------------------------------------------
  const baseFetch = await fetchTab({ tab: SHEET_TAB, validate: verifyBaseHeader })
  const baseBody = baseFetch.rows.slice(1)
  console.log(`  "${SHEET_TAB}" via ${baseFetch.via}: ${baseBody.length} data rows`)
  const base = readBaseLayer(baseBody, lookups, MIN, MAX)

  // ---- layer 2: История статусов ---------------------------------------------
  const histFetch = await fetchTab({ tab: HIST_TAB, gid: HIST_GID, validate: resolveHistColumns })
  const hist = histFetch.meta
  const histBody = histFetch.rows.slice(1)
  console.log(
    `  "${HIST_TAB}" via ${histFetch.via}: ${histBody.length} data rows · ` +
      `этапы: ${hist.stages.map((s) => s.key).join(' → ')}`,
  )
  const stg = readStageLayer(histBody, hist, lookups, MIN, MAX)

  // ---- health, per source ----------------------------------------------------
  const metaLeads = ds.daily.reduce((s, r) => s + r.leads, 0)
  const metaSpend = ds.daily.reduce((s, r) => s + r.spend, 0)
  // client_data is measured against Meta leads: the tab is supposed to contain
  // every lead Meta reports, so anything else means rows stopped matching.
  const baseRate = metaLeads ? (base.rows_matched / metaLeads) * 100 : 0
  // The funnel tab holds only quals, so the same ratio would be meaningless.
  // What it can prove is that rows CARRYING a UTM still join — organic quals
  // (WhatsApp, direct) are legitimately unjoinable and must not look like breakage.
  const histJoinable = stg.rows_in_window - stg.unmatched.no_utm
  const histRate = histJoinable > 0 ? (stg.rows_matched / histJoinable) * 100 : 0

  const baseProblem = diagnose({
    tab: SHEET_TAB,
    baseline: prev.base,
    rowsTotal: base.rows_total,
    inWindow: base.rows_in_window,
    badDate: base.unmatched.bad_date,
    rate: baseRate,
  })
  const stgProblem = diagnose({
    tab: HIST_TAB,
    baseline: prev.stg,
    rowsTotal: stg.rows_total,
    inWindow: stg.rows_in_window,
    badDate: stg.unmatched.bad_date,
    rate: histRate,
  })

  if (STRICT && (baseProblem || stgProblem)) {
    throw new Error((baseProblem || stgProblem).message)
  }

  // Freeze only the broken half. The other one keeps deploying fresh — that is
  // the entire point of splitting the layers.
  const useBase = baseProblem && prev.base ? prev.base : base
  const useStg = stgProblem && prev.stg ? prev.stg : stg
  const baseFrozen = useBase !== base ? prev.base : null
  const stgFrozen = useStg !== stg ? prev.stg : null

  for (const [problem, frozen, tab] of [
    [baseProblem, baseFrozen, SHEET_TAB],
    [stgProblem, stgFrozen, HIST_TAB],
  ]) {
    if (!problem) continue
    console.error(`\n⚠ ${problem.message}`)
    if (frozen) {
      console.error(`  → слой "${tab}" заморожен на версии ${frozen.fetched_at}, деплой продолжается.`)
    } else {
      console.error(`  → замораживать не на что; публикуем с предупреждением на дашборде.`)
    }
  }

  const crm = mergeLayers(useBase, useStg)
  crm.health_sources = {
    client_data: healthFor({
      tab: SHEET_TAB,
      problem: baseProblem,
      frozen: baseFrozen,
      rowsTotal: base.rows_total,
      baseline: prev.base,
      rate: baseRate,
    }),
    stages: healthFor({
      tab: HIST_TAB,
      problem: stgProblem,
      frozen: stgFrozen,
      rowsTotal: stg.rows_total,
      baseline: prev.stg,
      rate: histRate,
    }),
  }
  // The banner reads a single `health`; a broken source wins over a healthy one so
  // the dashboard never looks fine while half of it is frozen.
  crm.health = crm.health_sources.client_data.ok ? crm.health_sources.stages : crm.health_sources.client_data
  ds.crm = crm

  // Meta only named the countries it delivered to. The CRM knows a few more —
  // someone clicked while abroad — and those rows would otherwise render as a
  // bare ISO code.
  ds.country_names = { ...(ds.country_names || {}) }
  for (const r of crm.geo) if (!ds.country_names[r.country]) ds.country_names[r.country] = ruFromIso(r.country)

  const unknownGeo = [...new Set([...(useBase.unknown_geo || []), ...(useStg?.unknown_geo || [])])]
  if (unknownGeo.length) {
    console.warn(
      `⚠ ${unknownGeo.length} \u043d\u0435\u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u043d\u043d\u044b\u0445 \u0441\u0442\u0440\u0430\u043d\u044b \u0432 CRM (\u043f\u043e\u043a\u0430\u0437\u0430\u043d\u044b \u043a\u0430\u043a \u0435\u0441\u0442\u044c, \u0431\u0435\u0437 \u0440\u0430\u0441\u0445\u043e\u0434\u0430): ${unknownGeo.join(', ')}`,
    )
  }

  // ---- cross-check -----------------------------------------------------------
  const stageTotals = new Map()
  for (const r of crm.stages) stageTotals.set(r.stage, (stageTotals.get(r.stage) || 0) + r.n)
  console.log('\n──── CRM cross-check ────')
  console.log(`  window            ${MIN} → ${MAX}`)
  console.log(`  ${SHEET_TAB}: ${base.rows_in_window} in window, ${base.rows_matched} matched ` +
    `(${baseRate.toFixed(1)}% of ${metaLeads} Meta leads)`)
  console.log(`  ${HIST_TAB}: ${stg.rows_in_window} in window, ${stg.rows_matched} matched ` +
    `(${histRate.toFixed(1)}% of ${histJoinable} с UTM)`)
  console.log(`  qualified         ${crm.qual_total}  ·  колонка F на "${SHEET_TAB}" даёт ${base.legacy_qual}`)
  if (crm.hist_unmatched.qual_only_in_history) {
    console.log(`  quals без строки в "${SHEET_TAB}": ${crm.hist_unmatched.qual_only_in_history}`)
  }
  console.log('  ── воронка (дошло до этапа или глубже) ──')
  for (const def of crm.stage_defs) {
    const n = stageTotals.get(def.key) || 0
    const cost = n ? `$${(metaSpend / n).toFixed(2)}` : '—'
    console.log(`    ${def.key.padEnd(30)} ${String(n).padStart(4)}   ${cost}`)
  }
  const lostN = crm.lost.reduce((s, r) => s + r.n, 0)
  console.log(`    ${'Lost / Closed'.padEnd(30)} ${String(lostN).padStart(4)}`)
  console.log(
    `  unmatched         "${SHEET_TAB}": macro ${base.unmatched.macro} · unknown campaign ` +
      `${base.unmatched.unknown_campaign} · unknown ad ${base.unmatched.unknown_ad} · no utm ${base.unmatched.no_utm}`,
  )
  console.log(
    `                    "${HIST_TAB}": macro ${stg.unmatched.macro} · unknown campaign ` +
      `${stg.unmatched.unknown_campaign} · unknown ad ${stg.unmatched.unknown_ad} · no utm ${stg.unmatched.no_utm} · ` +
      `битых дат этапов ${stg.unmatched.bad_stage_date}`,
  )

  await fs.writeFile(DATA_FILE, JSON.stringify(ds, null, 2))
  console.log(
    `\n✔ Wrote crm block into ${path.relative(ROOT, DATA_FILE)} ` +
      `(client_data: ${crm.health_sources.client_data.reason}, ${HIST_TAB}: ${crm.health_sources.stages.reason})`,
  )
  if (baseProblem || stgProblem) return

  // ---- frozen expectations (opt-in, --verify) --------------------------------
  // Not run in CI: the sheets grow daily, so these numbers drift by design.
  // They exist to prove the join and the cumulative rule on the snapshot they
  // were built against. Re-freeze them deliberately, never to "make it pass".
  if (VERIFY) {
    const byCamp = new Map()
    const byAd = new Map()
    for (const r of crm.daily) {
      bumpN(byCamp, r.campaign_id, r.leads, r.qual)
      if (r.ad_key) bumpN(byAd, r.ad_key, r.leads, r.qual)
    }
    const c403 = ds.campaigns.find((c) => c.name.startsWith('403_EN_WW_DESA2'))
    const qualSum = [...byCamp.values()].reduce((s, v) => s + v.qual, 0)
    const stageOf = (k) => stageTotals.get(k) || 0
    const expect = [
      ['rows in window (client_data)', base.rows_in_window, 288],
      ['rows in window (история)', stg.rows_in_window, 31],
      ['qualified (matched)', crm.qual_total, 25],
      ['quals summed over campaigns', qualSum, 25],
      ['unknown campaign rows (client_data)', base.unmatched.unknown_campaign, 3],
      // Organic quals ("—" in the UTM cells) must stay in `no_utm`. If they drift
      // back into `unknown_campaign`, the join-rate guard starts reading normal
      // WhatsApp traffic as a broken join.
      ['organic quals (no utm)', stg.unmatched.no_utm, 4],
      ['unknown campaign rows (история)', stg.unmatched.unknown_campaign, 1],
      ['05.Qualified reached', stageOf('05.Qualified'), 25],
      // 8 rows carry a 06.Meeting Set date; 2 more jumped straight to 07 and are
      // counted here too. This gap IS the cumulative rule — if it closes, the rule
      // silently reverted to per-column counting.
      ['06.Meeting Set reached', stageOf('06.Meeting Set'), 10],
      ['07.Online Meeting reached', stageOf('07.Online Meeting'), 7],
      ['403 qualified', byCamp.get(c403?.id)?.qual, 14],
    ]
    console.log('\n──── --verify against the 29.07.2026 Meta window ────')
    let failed = 0
    for (const [label, got, want] of expect) {
      const ok = got === want
      if (!ok) failed++
      console.log(`  ${ok ? '✔' : '✖'} ${label}: got ${got}, expected ${want}`)
    }
    // The one invariant that must hold on ANY snapshot, not just the frozen one.
    for (let i = 1; i < crm.stage_defs.length; i++) {
      const a = stageOf(crm.stage_defs[i - 1].key)
      const b = stageOf(crm.stage_defs[i].key)
      if (b > a) {
        failed++
        console.log(`  ✖ воронка не убывает: ${crm.stage_defs[i].key} (${b}) > ${crm.stage_defs[i - 1].key} (${a})`)
      }
    }
    if (failed) throw new Error(`${failed} frozen expectation(s) failed`)
    console.log('  all frozen expectations hold')
  }
}

function bumpN(map, key, leads, qual) {
  let v = map.get(key)
  if (!v) {
    v = { leads: 0, qual: 0 }
    map.set(key, v)
  }
  v.leads += leads
  v.qual += qual
}

// Only when run as a script: scripts/test-crm.mjs imports the pure pieces above
// to exercise them against fixtures, and must not trigger a live fetch by doing so.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('✖ CRM pipeline failed:', e.message)
    process.exit(1)
  })
}
