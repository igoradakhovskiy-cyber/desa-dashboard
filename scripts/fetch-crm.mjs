#!/usr/bin/env node
/**
 * Desa Harmonis 2 dashboard — CRM layer from Google Sheets.
 *
 * Runs AFTER fetch-meta.mjs: reads .data/latest.json, pulls the CRM export from
 * the `client_data` tab of the Google Sheet, joins it onto the Meta data by UTM,
 * and writes the `crm` block back into the same file.
 *
 * The join works because every ad carries
 *   utm_source=facebook&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
 * so `UTM Campaign` is the campaign name verbatim and `UTM Content` is the ad name.
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
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_FILE = path.join(ROOT, '.data', 'latest.json')

// ---------------------------------------------------------------- config ----
const SHEET_ID = process.env.SHEET_ID || '1ipjwK0P-jGOy8KQ0_J58I8F8e7wRZL2OiZLnLsoA5g0'
const SHEET_TAB = process.env.SHEET_TAB || 'client_data'
const QUAL_VALUE = (process.env.QUAL_VALUE || 'qualified').toLowerCase()
const VERIFY = process.argv.includes('--verify')

/**
 * Columns are addressed BY INDEX, not by header name, on purpose: the sheet has
 * two different columns both titled "Квалификация" — F (index 5, values
 * ""/"Qualified") and Z (index 25, values ""/"1", a different definition.
 * A name lookup would silently grab the wrong one.
 */
const COL = {
  date: 1, // B  Дата создания        DD.MM.YYYY
  qual: 5, // F  Квалификация         "" | "Qualified"   ← the one we want
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

// ------------------------------------------------------------- utilities ----
/** RFC4180-ish CSV parser: handles quoted fields, escaped quotes and embedded newlines. */
function parseCsv(text) {
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

const cell = (row, i) => (row[i] === undefined ? '' : String(row[i]).trim())
/** Join keys are compared case-insensitively — Meta sometimes lowercases macro output. */
const norm = (s) => String(s || '').trim().toLowerCase()

/** "25.06.2025" -> "2025-06-25"; returns null on anything else. */
function toIso(ddmmyyyy) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(ddmmyyyy).trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function bump(map, key, qual) {
  let v = map.get(key)
  if (!v) {
    v = { leads: 0, qual: 0 }
    map.set(key, v)
  }
  v.leads++
  if (qual) v.qual++
}

// ------------------------------------------------------------------- main ---
async function main() {
  if (!existsSync(DATA_FILE)) {
    throw new Error('.data/latest.json not found — run fetch-meta.mjs first')
  }
  const ds = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'))

  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`
  console.log(`▶ CRM sheet ${SHEET_ID} · tab "${SHEET_TAB}"`)

  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(
      `sheet fetch failed: HTTP ${res.status}. ` +
        'If link sharing was turned off, switch to a service account + Sheets API.',
    )
  }
  const csv = await res.text()
  const rows = parseCsv(csv).filter((r) => r.some((c) => String(c).trim() !== ''))
  if (!rows.length) throw new Error('sheet returned no rows')

  // ---- header validation ----------------------------------------------------
  // Critical: gviz does NOT 404 on a wrong tab name — it silently serves the FIRST
  // tab instead. Without this check the pipeline would happily encrypt garbage.
  const hdr = rows[0]
  const bad = Object.entries(EXPECTED_HEADER).filter(([i, name]) => cell(hdr, Number(i)) !== name)
  if (bad.length) {
    console.error('✖ unexpected header — wrong tab, or the sheet layout changed.')
    console.error(`  got: ${hdr.slice(0, 17).map((h, i) => `${i}:${h}`).join(' | ')}`)
    for (const [i, name] of bad) {
      console.error(`  col ${i}: expected "${name}", got "${cell(hdr, Number(i))}"`)
    }
    throw new Error('CRM header validation failed')
  }
  const body = rows.slice(1)
  console.log(`  ${body.length} data rows`)

  // ---- lookups from the Meta side -------------------------------------------
  const campByName = new Map(ds.campaigns.map((c) => [norm(c.name), c]))
  const adNameByNorm = new Map() // normalised ad name -> canonical ad name (creative key)
  for (const a of ds.ads) if (!adNameByNorm.has(norm(a.name))) adNameByNorm.set(norm(a.name), a.name)

  const MIN = ds.date_min
  const MAX = ds.date_max

  // ---- aggregate -------------------------------------------------------------
  const daily = new Map() // `${date}|${campaign_id}|${ad_key}` -> {leads,qual}
  const status = new Map() // `${date}|${status}` -> n
  const geo = new Map() // `${date}|${country}` -> {leads,qual}
  const unmatched = {
    macro: 0, // {{campaign.name}} / {{ad.name}} — Meta never substituted the macro
    unknown_campaign: 0, // campaign not in the dashboard window (older flights)
    unknown_ad: 0, // campaign matched but the ad no longer exists in the account
    no_utm: 0,
    bad_date: 0,
    out_of_window: 0,
    examples: {},
  }
  const noteExample = (bucket, value) => {
    const arr = (unmatched.examples[bucket] ||= [])
    if (value && arr.length < 5 && !arr.includes(value)) arr.push(value)
  }

  let inWindow = 0
  let matched = 0
  let qualTotal = 0

  for (const r of body) {
    const iso = toIso(cell(r, COL.date))
    if (!iso) {
      unmatched.bad_date++
      continue
    }
    if (iso < MIN || iso > MAX) {
      unmatched.out_of_window++
      continue
    }
    inWindow++

    const rawCamp = cell(r, COL.campaign)
    const rawAd = cell(r, COL.ad)
    const isQual = cell(r, COL.qual).toLowerCase() === QUAL_VALUE

    if (!rawCamp && !rawAd) {
      unmatched.no_utm++
      continue
    }
    if (rawCamp.includes('{{') || rawAd.includes('{{')) {
      unmatched.macro++
      noteExample('macro', rawCamp || rawAd)
      continue
    }

    const camp = campByName.get(norm(rawCamp))
    if (!camp) {
      // Older flights (Desa_inv, HunterMob) still produce late leads. They are
      // excluded on purpose: their spend is outside the window, so counting their
      // quals would make CPQL wrong. They surface in the diagnostics chip instead.
      unmatched.unknown_campaign++
      noteExample('unknown_campaign', rawCamp)
      continue
    }

    const adKey = adNameByNorm.get(norm(rawAd)) || null
    if (!adKey) {
      unmatched.unknown_ad++
      noteExample('unknown_ad', rawAd)
      // still counted at campaign level — only the creative gallery misses it
    }

    matched++
    if (isQual) qualTotal++
    bump(daily, `${iso}|${camp.id}|${adKey || ''}`, isQual)

    // campaign_id rides along so the UI can filter these blocks by language too
    const st = cell(r, COL.status)
    if (st) {
      const k = `${iso}|${camp.id}|${st}`
      status.set(k, (status.get(k) || 0) + 1)
    }

    const country = cell(r, COL.country)
    if (country && country !== '—') bump(geo, `${iso}|${camp.id}|${country}`, isQual)
  }

  const crm = {
    source: 'google_sheets',
    sheet_id: SHEET_ID,
    tab: SHEET_TAB,
    fetched_at: new Date().toISOString(),
    rows_total: body.length,
    rows_in_window: inWindow,
    rows_matched: matched,
    qual_total: qualTotal,
    daily: [...daily.entries()]
      .map(([k, v]) => {
        const [date, campaign_id, ad_key] = k.split('|')
        return { date, campaign_id, ad_key: ad_key || null, leads: v.leads, qual: v.qual }
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    status: [...status.entries()]
      .map(([k, n]) => {
        const [date, campaign_id, name] = k.split('|')
        return { date, campaign_id, status: name, n }
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    geo: [...geo.entries()]
      .map(([k, v]) => {
        const [date, campaign_id, country] = k.split('|')
        return { date, campaign_id, country, leads: v.leads, qual: v.qual }
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    unmatched,
  }

  ds.crm = crm
  await fs.writeFile(DATA_FILE, JSON.stringify(ds, null, 2))
  console.log(`✔ Wrote crm block into ${path.relative(ROOT, DATA_FILE)}`)

  // ---- cross-check -----------------------------------------------------------
  const metaLeads = ds.daily.reduce((s, r) => s + r.leads, 0)
  const metaSpend = ds.daily.reduce((s, r) => s + r.spend, 0)
  const rate = metaLeads ? (matched / metaLeads) * 100 : 0
  console.log('\n──── CRM cross-check ────')
  console.log(`  window            ${MIN} → ${MAX}`)
  console.log(`  rows in window    ${inWindow}`)
  console.log(`  matched to Meta   ${matched}  (${rate.toFixed(1)}% of ${metaLeads} Meta leads)`)
  console.log(`  qualified         ${qualTotal}  (${matched ? ((qualTotal / matched) * 100).toFixed(1) : 0}% of matched)`)
  console.log(`  CPQL              $${qualTotal ? (metaSpend / qualTotal).toFixed(2) : '—'}`)
  console.log(
    `  unmatched         macro ${unmatched.macro} · unknown campaign ${unmatched.unknown_campaign} · ` +
      `unknown ad ${unmatched.unknown_ad} · no utm ${unmatched.no_utm}`,
  )

  // Structural guards — these signal real breakage, not normal day-to-day drift.
  if (!inWindow) throw new Error('no CRM rows inside the dashboard window — check MIN_DATE / tab')
  if (rate < 50) {
    throw new Error(`CRM match rate ${rate.toFixed(1)}% is below the 50% floor — UTM join likely broken`)
  }

  // ---- frozen expectations (opt-in, --verify) --------------------------------
  // Not run in CI: the sheet grows daily, so these numbers drift by design.
  // They exist to prove the join on the snapshot it was built against.
  if (VERIFY) {
    const byCamp = new Map()
    const byAd = new Map()
    for (const r of crm.daily) {
      bumpN(byCamp, r.campaign_id, r.leads, r.qual)
      if (r.ad_key) bumpN(byAd, r.ad_key, r.leads, r.qual)
    }
    const c403 = ds.campaigns.find((c) => c.name.startsWith('403_EN_WW_DESA2'))
    const expect = [
      ['rows in window', inWindow, 251],
      // 21 rows in the window carry "Qualified", but one belongs to the old
      // 034_ENG_WW_Desa_inv flight whose spend is outside the window — excluded
      // on purpose so CPQL stays honest. Hence 20 matched, 1 unknown_campaign.
      ['qualified (matched)', qualTotal, 20],
      ['unknown campaign rows', unmatched.unknown_campaign, 3],
      ['unresolved macro rows', unmatched.macro, 1],
      ['403 leads', byCamp.get(c403?.id)?.leads, 113],
      ['403 qualified', byCamp.get(c403?.id)?.qual, 11],
      ['002_own_one_of_them leads', byAd.get('002_own_one_of_them')?.leads, 109],
      ['002_own_one_of_them qualified', byAd.get('002_own_one_of_them')?.qual, 10],
    ]
    console.log('\n──── --verify against the 25.07.2026 snapshot ────')
    let failed = 0
    for (const [label, got, want] of expect) {
      const ok = got === want
      if (!ok) failed++
      console.log(`  ${ok ? '✔' : '✖'} ${label}: got ${got}, expected ${want}`)
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

main().catch((e) => {
  console.error('✖ CRM pipeline failed:', e.message)
  process.exit(1)
})
