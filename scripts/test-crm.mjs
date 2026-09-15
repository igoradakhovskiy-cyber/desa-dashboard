#!/usr/bin/env node
/**
 * Offline tests for the CRM pipeline's robustness guarantees.
 *
 * These exist because "работа внутри таблицы не должна ломать дашборд" is a
 * promise, and a promise nobody exercises is a wish. Every case here is something
 * a human actually does to a Google Sheet: sorts it, inserts a column, appends a
 * funnel stage, leaves a filter on, reformats the dates, types a note where a date
 * belongs. None of them may silently change a number.
 *
 * No network, no npm deps — pure functions from fetch-crm.mjs against fixtures.
 *   node scripts/test-crm.mjs
 */

import {
  diagnose,
  mergeLayers,
  parseCsv,
  readStageLayer,
  resolveHistColumns,
  splitLayers,
} from './fetch-crm.mjs'

// ---------------------------------------------------------------- harness ---
let failed = 0
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`  ${ok ? '✔' : '✖'} ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
function throws(label, fn) {
  try {
    fn()
    failed++
    console.log(`  ✖ ${label}: не упало, хотя должно было`)
  } catch {
    console.log(`  ✔ ${label}`)
  }
}

// --------------------------------------------------------------- fixtures ---
const HEADER = [
  'ID сделки', 'Ответственный', 'Создана', 'Текущий статус', 'Откат', 'Страна', 'Источник',
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content',
  '05.Qualified', '06.Meeting Set', '07.Online Meeting', '08.Zoom with Founder',
  '09.on-site Visit', '10.Booking', '11.Due diligence', '12.Contract signed',
  '13.Contract Payment Received', 'SUCCESS', 'Lost / Closed',
]

/** A row as {column name: value}; anything unset is blank. */
const row = (o) => HEADER.map((h) => o[h] ?? '')

const csv = (header, rows) =>
  [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')

const MIN = '2026-06-01'
const MAX = '2026-06-30'
const LOOKUPS = {
  campByName: new Map([['camp a', { id: 'c1', name: 'Camp A' }]]),
  adNameByNorm: new Map([['ad1', 'Ad1']]),
}

const base = {
  'Создана': '10.06.2026', 'Страна': 'Serbia', 'UTM Campaign': 'Camp A', 'UTM Content': 'Ad1',
}

/** Four quals: one plain, one with a meeting, one that SKIPPED the meeting rung, one organic. */
const ROWS = [
  row({ ...base, '05.Qualified': '10.06.2026' }),
  row({ ...base, '05.Qualified': '10.06.2026', '06.Meeting Set': '12.06.2026' }),
  // no 06 date, but a 07 date — the case the cumulative rule exists for
  row({ ...base, '05.Qualified': '11.06.2026', '07.Online Meeting': '15.06.2026' }),
  row({ ...base, 'UTM Campaign': '—', 'UTM Content': '—', '05.Qualified': '10.06.2026' }),
]

const read = (header, rows) => {
  const parsed = parseCsv(csv(header, rows))
  const hist = resolveHistColumns(parsed[0])
  return readStageLayer(parsed.slice(1), hist, LOOKUPS, MIN, MAX)
}
const totals = (layer) => {
  const m = {}
  for (const r of layer.stages) m[r.stage] = (m[r.stage] || 0) + r.n
  return m
}

// ------------------------------------------------------------------ tests ---
console.log('\n── базовая раскладка ──')
{
  const l = read(HEADER, ROWS)
  const t = totals(l)
  check('квалов сматчено (органика не в счёт)', l.qual_total, 3)
  check('органика ушла в no_utm', l.unmatched.no_utm, 1)
  check('05.Qualified', t['05.Qualified'], 3)
  // 1 стоит дата в 06 + 1 перескочивший сразу в 07 = 2
  check('06.Meeting Set засчитан кумулятивно', t['06.Meeting Set'], 2)
  check('07.Online Meeting', t['07.Online Meeting'], 1)
  check('пустой этап не попал в stages', t['09.on-site Visit'], undefined)
  check('все 9 этапов объявлены', l.stage_defs.length, 9)
}

console.log('\n── строки отсортировали ──')
{
  const a = totals(read(HEADER, ROWS))
  const b = totals(read(HEADER, [...ROWS].reverse()))
  check('порядок строк ничего не меняет', b, a)
}

console.log('\n── вставили колонку в середину ──')
{
  const at = HEADER.indexOf('UTM Campaign')
  const hdr = [...HEADER.slice(0, at), 'Комментарий менеджера', ...HEADER.slice(at)]
  const rows = ROWS.map((r) => [...r.slice(0, at), 'какая-то заметка', ...r.slice(at)])
  const before = totals(read(HEADER, ROWS))
  const after = read(hdr, rows)
  check('цифры не поехали', totals(after), before)
  check('квалы на месте', after.qual_total, 3)
}

console.log('\n── добавили новый этап в конец воронки ──')
{
  const at = HEADER.indexOf('SUCCESS')
  const hdr = [...HEADER.slice(0, at), '14.Keys Handed Over', ...HEADER.slice(at)]
  const rows = ROWS.map((r, i) => {
    const v = [...r.slice(0, at), i === 1 ? '20.06.2026' : '', ...r.slice(at)]
    return v
  })
  const l = read(hdr, rows)
  const t = totals(l)
  check('этап подхватился сам', l.stage_defs.map((d) => d.key).includes('14.Keys Handed Over'), true)
  check('и он последний по глубине', l.stage_defs.at(-1).key, '14.Keys Handed Over')
  check('дошедший до него засчитан', t['14.Keys Handed Over'], 1)
  // и он же теперь считается дошедшим до всех этапов выше
  check('и во все этапы выше тоже', t['12.Contract signed'], 1)
}

console.log('\n── в ячейке этапа текст вместо даты ──')
{
  const rows = ROWS.map((r) => [...r])
  rows[1][HEADER.indexOf('07.Online Meeting')] = 'перенесли на след. неделю'
  const l = read(HEADER, rows)
  const t = totals(l)
  check('замечено и посчитано', l.unmatched.bad_stage_date, 1)
  check('этап не засчитан', t['07.Online Meeting'], 1)
  check('сделка осталась на предыдущем этапе', t['06.Meeting Set'], 2)
  check('и из квалов не пропала', l.qual_total, 3)
}

console.log('\n── удалили обязательную колонку ──')
{
  const at = HEADER.indexOf('Создана')
  throws('падаем на отсутствии «Создана»', () =>
    resolveHistColumns(parseCsv(csv([...HEADER.slice(0, at), ...HEADER.slice(at + 1)], []))[0], false),
  )
  const s = HEADER.indexOf('06.Meeting Set')
  throws('падаем на отсутствии обязательного этапа', () =>
    resolveHistColumns(parseCsv(csv([...HEADER.slice(0, s), ...HEADER.slice(s + 1)], []))[0], false),
  )
}

console.log('\n── на листе оставили фильтр ──')
{
  const p = diagnose({
    tab: 'История статусов', baseline: { rows_total: 484 },
    rowsTotal: 30, inWindow: 2, badDate: 0, rate: 100,
  })
  check('диагноз', p?.reason, 'source_truncated')
  check('подсказка про фильтр', /фильтр/.test(p?.hint || ''), true)
}

console.log('\n── переформатировали колонку с датой ──')
{
  const p = diagnose({
    tab: 'История статусов', baseline: { rows_total: 484 },
    rowsTotal: 484, inWindow: 5, badDate: 300, rate: 100,
  })
  check('диагноз', p?.reason, 'date_format_broken')
}

console.log('\n── здоровый лист ──')
{
  const p = diagnose({
    tab: 'История статусов', baseline: { rows_total: 480 },
    rowsTotal: 484, inWindow: 31, badDate: 0, rate: 92.6,
  })
  check('проблем нет', p, null)
}

console.log('\n── квал есть, а лида в client_data ещё нет ──')
{
  const baseLayer = {
    fetched_at: 'x', rows_total: 1, rows_in_window: 1, rows_matched: 1,
    unmatched: {}, daily: [{ date: '2026-06-10', campaign_id: 'c1', ad_key: 'Ad1', leads: 1 }],
    status: [], geo: [],
  }
  const stgLayer = {
    fetched_at: 'y', rows_total: 2, rows_in_window: 2, rows_matched: 2, unmatched: {}, qual_total: 2,
    daily: [
      { date: '2026-06-10', campaign_id: 'c1', ad_key: 'Ad1', qual: 1 },
      { date: '2026-06-11', campaign_id: 'c1', ad_key: 'Ad1', qual: 1 }, // нет пары в client_data
    ],
    geo: [], stages: [], stage_defs: [], lost: [],
  }
  const m = mergeLayers(baseLayer, stgLayer)
  check('квал не потерян', m.daily.reduce((s, r) => s + r.qual, 0), 2)
  check('и отмечен как опередивший', m.hist_unmatched.qual_only_in_history, 1)
  check('лиды не задвоились', m.daily.reduce((s, r) => s + r.leads, 0), 1)
}

console.log('\n── разбор задеплоенного блока на слои (путь заморозки) ──')
{
  // Это самая незаметная часть механики: чтобы заморозить один лист и оставить
  // второй живым, опубликованный crm-блок надо уметь разобрать обратно на слои.
  // Если разбор теряет поле, авария на одном листе тихо испортит второй.
  const baseL = {
    fetched_at: 'B', rows_total: 3, rows_in_window: 2, rows_matched: 2, unmatched: { no_utm: 1 },
    daily: [
      { date: '2026-06-10', campaign_id: 'c1', ad_key: 'Ad1', leads: 5 },
      { date: '2026-06-11', campaign_id: 'c1', ad_key: null, leads: 2 },
    ],
    status: [{ date: '2026-06-10', campaign_id: 'c1', status: '04.Replied', n: 3 }],
    geo: [{ date: '2026-06-10', campaign_id: 'c1', country: 'RS', leads: 5 }],
  }
  const stgL = {
    fetched_at: 'S', rows_total: 9, rows_in_window: 4, rows_matched: 3, unmatched: { macro: 1 },
    qual_total: 3,
    daily: [{ date: '2026-06-10', campaign_id: 'c1', ad_key: 'Ad1', qual: 3 }],
    geo: [{ date: '2026-06-10', campaign_id: 'c1', country: 'RS', qual: 3 }],
    stage_defs: [{ key: '05.Qualified', depth: 0 }, { key: '06.Meeting Set', depth: 1 }],
    stages: [
      { stage: '05.Qualified', lead_date: '2026-06-10', event_date: '2026-06-10', campaign_id: 'c1', ad_key: 'Ad1', n: 3 },
      { stage: '06.Meeting Set', lead_date: '2026-06-10', event_date: '2026-06-14', campaign_id: 'c1', ad_key: 'Ad1', n: 1 },
    ],
    lost: [{ lead_date: '2026-06-10', event_date: '2026-06-20', campaign_id: 'c1', ad_key: 'Ad1', n: 1 }],
  }

  const published = mergeLayers(baseL, stgL)
  const round = mergeLayers(...Object.values(splitLayers(published)))
  const strip = (c) => ({ ...c, fetched_at: null, hist_fetched_at: null })
  check('слои разбираются и собираются обратно без потерь', strip(round), strip(published))
  check('время слоя client_data сохранилось', splitLayers(published).base.fetched_at, 'B')
  check('время слоя этапов сохранилось', splitLayers(published).stg.fetched_at, 'S')

  // Заморозка одного слоя: свежие лиды + старые квалы.
  const freshBase = { ...baseL, fetched_at: 'B2', daily: [{ date: '2026-06-10', campaign_id: 'c1', ad_key: 'Ad1', leads: 9 }] }
  const frozen = mergeLayers(freshBase, splitLayers(published).stg)
  check('лиды свежие', frozen.daily.reduce((s, r) => s + r.leads, 0), 9)
  check('квалы из замороженного слоя', frozen.qual_total, 3)
  check('воронка из замороженного слоя', frozen.stages.length, 2)

  // Датасет, опубликованный до появления слоя этапов: замораживать нечего.
  const legacy = { ...published, stages: undefined }
  check('старый датасет без этапов не притворяется слоем', splitLayers(legacy).stg, null)

  // Блок, опубликованный до перехода географии на ISO, несёт английские названия.
  // Если разбор оставит их как есть, замороженный слой перестанет сходиться с
  // расходом из Meta и страна уедет вниз, в список «рекламу там не показывали».
  const preIso = {
    ...published,
    geo: [{ date: '2026-06-10', campaign_id: 'c1', country: 'Serbia', leads: 5, qual: 3 }],
  }
  const migrated = splitLayers(preIso)
  check('старые английские названия стран переводятся в ISO', migrated.base.geo[0].country, 'RS')
  check('и в слое этапов тоже', migrated.stg.geo[0].country, 'RS')
  check('ISO-код повторный разбор не портит', splitLayers(published).base.geo[0].country, 'RS')
}

console.log(failed ? `\n✖ провалено проверок: ${failed}\n` : '\n✔ все проверки прошли\n')
process.exit(failed ? 1 : 0)
