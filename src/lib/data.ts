import type {
  Ad,
  AdSet,
  Campaign,
  CreativeGroup,
  CrmDaily,
  CrmGeoRow,
  CrmLostRow,
  CrmStageDef,
  CrmStageRow,
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

// ------------------------------------------------------------ placements ----

export interface PlacementAgg {
  key: string
  platform: string
  position: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  leads: number
  cpl: number
  /** Modelled, not measured — see placementTable(). null when there is no CRM layer. */
  qual_est: number | null
  cpql_est: number | null
  spend_share: number
}

export interface PlacementTable {
  rows: PlacementAgg[]
  /** Quals the CRM has but no placement could claim — kept visible so totals reconcile. */
  qual_unattributed: number
  qual_total: number
  estimated: boolean
}

/**
 * Spend / leads / CPL per placement, plus a MODELLED qualified-lead split.
 *
 * The CRM export carries no placement field — a lead row knows its campaign and
 * ad, never whether it came from Reels or Stories. So quals are distributed down
 * each ad's own placement lead split: an ad with 10 quals whose leads were 70%
 * Reels contributes 7 to Reels. This is an estimate and the UI must label it so.
 *
 * It holds up because the split is computed per ad rather than globally — ads
 * differ wildly in placement mix, and averaging across them is what would make
 * the number meaningless. Quals on ads with no Meta leads in the window cannot be
 * placed at all and are reported separately instead of being silently spread.
 */
export function placementTable(
  ds: Dataset,
  idx: Index,
  f: Filters,
  crmRows?: CrmDaily[] | null,
): PlacementTable {
  const dict = ds.placements || []
  const rows = ds.placement_daily || []
  if (!dict.length || !rows.length) {
    return { rows: [], qual_unattributed: 0, qual_total: 0, estimated: false }
  }

  const agg = new Map<number, { spend: number; impressions: number; clicks: number; leads: number }>()
  // ad name -> placement index -> leads, for the qual split
  const adSplit = new Map<string, Map<number, number>>()
  const adLeadTotal = new Map<string, number>()

  for (const [date, adId, pi, spend, impressions, clicks, leads] of rows) {
    if (date < f.from || date > f.to) continue
    const ad = idx.adById.get(adId)
    if (f.lang !== 'all' && (!ad || ad.lang !== f.lang)) continue

    const a = agg.get(pi) || { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    a.spend += spend
    a.impressions += impressions
    a.clicks += clicks
    a.leads += leads
    agg.set(pi, a)

    if (ad && leads) {
      let m = adSplit.get(ad.name)
      if (!m) {
        m = new Map()
        adSplit.set(ad.name, m)
      }
      m.set(pi, (m.get(pi) || 0) + leads)
      adLeadTotal.set(ad.name, (adLeadTotal.get(ad.name) || 0) + leads)
    }
  }

  // ---- modelled qual split ----
  const qualByPlacement = new Map<number, number>()
  let qualTotal = 0
  let qualUnattributed = 0
  const hasCrm = !!crmRows
  if (crmRows) {
    for (const [adName, bucket] of crmByAd(crmRows)) {
      if (!bucket.qual) continue
      const split = adSplit.get(adName)
      const total = adLeadTotal.get(adName) || 0
      if (!split || !total) continue // no Meta leads to spread across — counted below
      for (const [pi, leads] of split) {
        qualByPlacement.set(pi, (qualByPlacement.get(pi) || 0) + (bucket.qual * leads) / total)
      }
    }
    // Measured against the raw CRM total, not the crmByAd sum: quals on rows whose ad
    // no longer exists never reach crmByAd at all, and they are just as unplaceable.
    const placed = [...qualByPlacement.values()].reduce((s, v) => s + v, 0)
    qualTotal = crmRows.reduce((s, r) => s + r.qual, 0)
    qualUnattributed = Math.max(0, qualTotal - placed)
  }

  const totalSpend = [...agg.values()].reduce((s, a) => s + a.spend, 0)

  const out: PlacementAgg[] = [...agg.entries()]
    .map(([pi, a]) => {
      const p = dict[pi] || { platform: 'unknown', position: 'unknown' }
      const qual = hasCrm ? qualByPlacement.get(pi) || 0 : null
      return {
        key: `${p.platform}|${p.position}`,
        platform: p.platform,
        position: p.position,
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0,
        leads: a.leads,
        cpl: a.leads ? a.spend / a.leads : 0,
        qual_est: qual,
        cpql_est: qual && qual >= 0.5 ? a.spend / qual : null,
        spend_share: totalSpend ? (a.spend / totalSpend) * 100 : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend)

  return {
    rows: out,
    qual_unattributed: qualUnattributed,
    qual_total: qualTotal,
    estimated: hasCrm,
  }
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

// ----------------------------------------------------------- sales funnel ---

/**
 * Which date a funnel event is filed under.
 *
 * `lead` — the day the lead was created. Pairs the event with the spend that
 * bought it, so cost per stage is honest cohort economics; the trade-off is that
 * recent days always look understated, because their leads have not had time to
 * travel down the funnel yet.
 *
 * `event` — the day the stage was actually reached. Shows what the sales team did
 * this week, but divides this period's spend by events belonging to leads bought
 * in other periods.
 */
export type DateBasis = 'lead' | 'event'

const stageDate = (r: CrmStageRow | CrmLostRow, basis: DateBasis) =>
  basis === 'lead' ? r.lead_date : r.event_date

function stageInScope(r: CrmStageRow | CrmLostRow, idx: Index, f: Filters, basis: DateBasis) {
  return inScope({ date: stageDate(r, basis), campaign_id: r.campaign_id }, idx, f)
}

/** stage key -> leads that reached it or deeper, for the current filter. */
function stageTotals(ds: Dataset, idx: Index, f: Filters, basis: DateBasis) {
  const m = new Map<string, number>()
  for (const r of ds.crm?.stages || []) {
    if (!stageInScope(r, idx, f, basis)) continue
    m.set(r.stage, (m.get(r.stage) || 0) + r.n)
  }
  return m
}

export interface StageRow {
  stage: string
  label: string
  depth: number
  n: number
  /** % of qualified leads that got this far. */
  share: number
  /** % of the previous stage that got this far — where the funnel actually leaks. */
  conv: number | null
  /** spend / n. null when nothing reached this stage. */
  cost: number | null
}

/**
 * The cumulative funnel from qualified downwards, with the cost of each stage.
 *
 * `spend` is passed in rather than recomputed: the caller already has the Meta
 * total for exactly this filter, and computing it twice invites the two numbers
 * to drift apart.
 */
export function stageFunnel(
  ds: Dataset,
  idx: Index,
  f: Filters,
  basis: DateBasis,
  spend: number,
  label: (key: string) => string,
): StageRow[] {
  return stageRowsFor(stageTotals(ds, idx, f, basis), ds.crm?.stage_defs, spend, label)
}

/**
 * The same funnel shape for one slice — a creative, a campaign — from a bucket
 * that `stagesByAd`/`stagesByCampaign` already produced, against that slice's own
 * spend. Keeps the modal's ladder identical in meaning to the dashboard's.
 */
export function stageRowsFor(
  bucket: Map<string, number> | undefined,
  defs: CrmStageDef[] | undefined,
  spend: number,
  label: (key: string) => string,
): StageRow[] {
  if (!defs?.length) return []
  const qual = bucket?.get(defs[0].key) || 0
  let prev: number | null = null
  return defs.map((def) => {
    const n = bucket?.get(def.key) || 0
    const row: StageRow = {
      stage: def.key,
      label: label(def.key),
      depth: def.depth,
      n,
      share: qual ? (n / qual) * 100 : 0,
      conv: prev === null ? null : prev ? (n / prev) * 100 : 0,
      cost: n ? spend / n : null,
    }
    prev = n
    return row
  })
}

/** Stages with at least one lead in the current filter — nothing else is worth a column. */
export function activeStages(ds: Dataset, idx: Index, f: Filters, basis: DateBasis): CrmStageDef[] {
  if (!ds.crm?.stage_defs?.length) return []
  const totals = stageTotals(ds, idx, f, basis)
  return ds.crm.stage_defs.filter((d) => (totals.get(d.key) || 0) > 0)
}

/** Stages deeper than qualified that have data — the ones worth their own KPI tile. */
export const deepStages = (ds: Dataset, idx: Index, f: Filters, basis: DateBasis) =>
  activeStages(ds, idx, f, basis).filter((d) => d.depth > 0)

/** Leads lost for good in the current filter (column «Lost / Closed»). */
export function lostTotal(ds: Dataset, idx: Index, f: Filters, basis: DateBasis) {
  let n = 0
  for (const r of ds.crm?.lost || []) if (stageInScope(r, idx, f, basis)) n += r.n
  return n
}

/** key -> (stage -> n), bucketed by campaign or by creative. */
function stagesGroupedBy(
  ds: Dataset,
  idx: Index,
  f: Filters,
  basis: DateBasis,
  keyFn: (r: CrmStageRow) => string | null,
) {
  const m = new Map<string, Map<string, number>>()
  for (const r of ds.crm?.stages || []) {
    if (!stageInScope(r, idx, f, basis)) continue
    const k = keyFn(r)
    if (k === null) continue
    let b = m.get(k)
    if (!b) {
      b = new Map()
      m.set(k, b)
    }
    b.set(r.stage, (b.get(r.stage) || 0) + r.n)
  }
  return m
}

/** campaign_id -> stage -> n */
export const stagesByCampaign = (ds: Dataset, idx: Index, f: Filters, basis: DateBasis) =>
  stagesGroupedBy(ds, idx, f, basis, (r) => r.campaign_id)

/** ad name (creative key) -> stage -> n */
export const stagesByAd = (ds: Dataset, idx: Index, f: Filters, basis: DateBasis) =>
  stagesGroupedBy(ds, idx, f, basis, (r) => r.ad_key)

/** `campaign_id|ad name` -> stage -> n, for the campaign drill-down. */
export const stagesByCampaignAd = (ds: Dataset, idx: Index, f: Filters, basis: DateBasis) =>
  stagesGroupedBy(ds, idx, f, basis, (r) => (r.ad_key ? `${r.campaign_id}|${r.ad_key}` : null))

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
