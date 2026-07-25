import type {
  Ad,
  AdSet,
  Campaign,
  CreativeGroup,
  CrmDaily,
  CrmGeoRow,
  CrmStatusRow,
  DailyRow,
  Dataset,
  Lang,
  Metrics,
} from '../types'
import { LANGS } from '../types'

export interface Index {
  adById: Map<string, Ad>
  campById: Map<string, Campaign>
  adsetById: Map<string, AdSet>
  creativeByKey: Map<string, CreativeGroup>
}

export function buildIndex(ds: Dataset): Index {
  return {
    adById: new Map(ds.ads.map((a) => [a.id, a])),
    campById: new Map(ds.campaigns.map((c) => [c.id, c])),
    adsetById: new Map(ds.adsets.map((s) => [s.id, s])),
    creativeByKey: new Map(ds.creatives.map((g) => [g.key, g])),
  }
}

export const EMPTY_METRICS: Metrics = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  cpl: 0,
  cpm: 0,
  cpc: 0,
  ctr: 0,
  crm_leads: null,
  qual_leads: null,
  cpql: null,
  qual_rate: null,
}

/**
 * Meta metrics for `rows`, plus the CRM layer when `crmRows` is supplied.
 * Pass the CRM slice matching the SAME filter, otherwise CPQL is meaningless.
 */
export function aggregate(rows: DailyRow[], crmRows?: CrmDaily[] | null): Metrics {
  let spend = 0,
    impressions = 0,
    clicks = 0,
    leads = 0
  for (const r of rows) {
    spend += r.spend
    impressions += r.impressions
    clicks += r.clicks
    leads += r.leads
  }
  let crm_leads: number | null = null
  let qual_leads: number | null = null
  if (crmRows) {
    crm_leads = 0
    qual_leads = 0
    for (const c of crmRows) {
      crm_leads += c.leads
      qual_leads += c.qual
    }
  }
  return {
    spend,
    impressions,
    clicks,
    leads,
    cpl: leads ? spend / leads : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
    cpc: clicks ? spend / clicks : 0,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    crm_leads,
    qual_leads,
    cpql: qual_leads ? spend / qual_leads : qual_leads === 0 ? 0 : null,
    qual_rate: crm_leads ? ((qual_leads || 0) / crm_leads) * 100 : crm_leads === 0 ? 0 : null,
  }
}

export interface Filters {
  from: string
  to: string
  lang: 'all' | Lang
}

export function filterRows(ds: Dataset, idx: Index, f: Filters): DailyRow[] {
  return ds.daily.filter((r) => {
    if (r.date < f.from || r.date > f.to) return false
    if (f.lang !== 'all') {
      const ad = idx.adById.get(r.ad_id)
      if (!ad || ad.lang !== f.lang) return false
    }
    return true
  })
}

export function groupBy(rows: DailyRow[], keyFn: (r: DailyRow) => string | undefined) {
  const m = new Map<string, DailyRow[]>()
  for (const r of rows) {
    const k = keyFn(r)
    if (k === undefined) continue
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

export interface DaySeriesPoint extends Metrics {
  date: string
}

export function dailySeries(rows: DailyRow[], crmRows?: CrmDaily[] | null): DaySeriesPoint[] {
  const byDate = groupBy(rows, (r) => r.date)
  const crmByDate = new Map<string, CrmDaily[]>()
  for (const c of crmRows || []) {
    const arr = crmByDate.get(c.date)
    if (arr) arr.push(c)
    else crmByDate.set(c.date, [c])
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, rs]) => ({
      date,
      ...aggregate(rs, crmRows ? crmByDate.get(date) || [] : null),
    }))
}

// ---- date helpers on YYYY-MM-DD strings (UTC-safe) ----
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function maxDate(a: string, b: string) {
  return a > b ? a : b
}
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
}

export interface Preset {
  key: string
  label: string
  from: string
  to: string
}

/** Presets are relative to the latest data date, not wall-clock today. */
export function buildPresets(dateMin: string, dateMax: string): Preset[] {
  const to = dateMax
  const clamp = (from: string) => maxDate(from, dateMin)
  const monthStart = to.slice(0, 8) + '01'
  return [
    { key: '7', label: '7 дней', from: clamp(addDays(to, -6)), to },
    { key: '14', label: '14 дней', from: clamp(addDays(to, -13)), to },
    { key: '30', label: '30 дней', from: clamp(addDays(to, -29)), to },
    { key: 'month', label: 'Этот месяц', from: clamp(monthStart), to },
    { key: 'all', label: 'Всё время', from: dateMin, to },
  ]
}

/** Language breakdown (EN / DE / RU) for the current filtered rows. */
export function splitByLang(rows: DailyRow[], idx: Index, crmRows?: CrmDaily[] | null) {
  const byLang = groupBy(rows, (r) => idx.adById.get(r.ad_id)?.lang)
  const crmByLang = new Map<string, CrmDaily[]>()
  for (const c of crmRows || []) {
    const lang = idx.campById.get(c.campaign_id)?.lang
    if (!lang) continue
    const arr = crmByLang.get(lang)
    if (arr) arr.push(c)
    else crmByLang.set(lang, [c])
  }
  const out: { lang: Lang; metrics: Metrics }[] = []
  for (const lang of LANGS) {
    const rs = byLang.get(lang)
    if (rs && rs.length) {
      out.push({ lang, metrics: aggregate(rs, crmRows ? crmByLang.get(lang) || [] : null) })
    }
  }
  return out
}

// ------------------------------------------------------------- CRM layer ----

/** CRM rows for the current filter. Language comes from the row's campaign. */
export function filterCrm(ds: Dataset, idx: Index, f: Filters): CrmDaily[] | null {
  if (!ds.crm) return null
  return ds.crm.daily.filter((r) => {
    if (r.date < f.from || r.date > f.to) return false
    if (f.lang !== 'all' && idx.campById.get(r.campaign_id)?.lang !== f.lang) return false
    return true
  })
}

export interface CrmBucket {
  leads: number
  qual: number
}

function bucketBy(rows: CrmDaily[] | null, keyFn: (r: CrmDaily) => string | null) {
  const m = new Map<string, CrmBucket>()
  for (const r of rows || []) {
    const k = keyFn(r)
    if (k === null) continue
    const b = m.get(k) || { leads: 0, qual: 0 }
    b.leads += r.leads
    b.qual += r.qual
    m.set(k, b)
  }
  return m
}

/** campaign_id -> {leads, qual} */
export const crmByCampaign = (rows: CrmDaily[] | null) => bucketBy(rows, (r) => r.campaign_id)
/** ad name (creative key) -> {leads, qual} */
export const crmByAd = (rows: CrmDaily[] | null) => bucketBy(rows, (r) => r.ad_key)

/** True when a CRM row belongs to the current date range and language filter. */
function inScope(r: { date: string; campaign_id: string }, idx: Index, f: Filters) {
  if (r.date < f.from || r.date > f.to) return false
  if (f.lang !== 'all' && idx.campById.get(r.campaign_id)?.lang !== f.lang) return false
  return true
}

/** Sales-pipeline ladder for the current filter, ordered by STATUS_ORDER. */
export function statusLadder(
  ds: Dataset,
  idx: Index,
  f: Filters,
  order: string[],
): { status: string; n: number }[] {
  if (!ds.crm) return []
  const totals = new Map<string, number>()
  for (const r of ds.crm.status as CrmStatusRow[]) {
    if (!inScope(r, idx, f)) continue
    totals.set(r.status, (totals.get(r.status) || 0) + r.n)
  }
  const known = order.filter((s) => totals.has(s)).map((s) => ({ status: s, n: totals.get(s)! }))
  const rest = [...totals.entries()]
    .filter(([s]) => !order.includes(s))
    .map(([status, n]) => ({ status, n }))
    .sort((a, b) => b.n - a.n)
  return [...known, ...rest]
}

/** Country breakdown for the current filter, richest first. */
export function geoTable(ds: Dataset, idx: Index, f: Filters) {
  if (!ds.crm) return []
  const m = new Map<string, CrmBucket>()
  for (const r of ds.crm.geo as CrmGeoRow[]) {
    if (!inScope(r, idx, f)) continue
    const b = m.get(r.country) || { leads: 0, qual: 0 }
    b.leads += r.leads
    b.qual += r.qual
    m.set(r.country, b)
  }
  return [...m.entries()]
    .map(([country, b]) => ({ country, ...b, rate: b.leads ? (b.qual / b.leads) * 100 : 0 }))
    .sort((a, b) => b.qual - a.qual || b.leads - a.leads)
}
