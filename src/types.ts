export type Lang = 'ru' | 'en' | 'de'

export const LANGS: Lang[] = ['en', 'de', 'ru']

export interface Account {
  id: string
  name: string
  currency: string
  timezone?: string
}

export interface Campaign {
  id: string
  name: string
  status: string
  objective: string
  lang: Lang
  daily_budget: number | null
}

export interface AdSet {
  id: string
  name: string
  campaign_id: string
  status: string
}

export interface CreativeMedia {
  poster: string | null // relative path under public/, e.g. "creatives/vid_123.jpg"
  poster_w: number | null
  poster_h: number | null
  video_id: string | null
  permalink: string | null // reel / post permalink (fallback for playback)
  preview_url: string | null // Meta ad-preview iframe src (may expire between refreshes)
}

export interface Ad {
  id: string
  name: string
  adset_id: string
  campaign_id: string
  status: string
  lang: Lang
  creative: CreativeMedia
}

export interface DailyRow {
  ad_id: string
  date: string // YYYY-MM-DD
  spend: number
  impressions: number
  clicks: number // link clicks (matches "Link Clicks")
  leads: number // primary lead metric (locked action_type)
  leads_lead: number // breakdown for cross-check / switching definition
  leads_pixel: number
  leads_onsite: number
}

export interface CreativeGroup {
  key: string // ad name = creative concept, e.g. "003_closed_resort"
  lang: Lang
  poster: string | null
  poster_w: number | null
  poster_h: number | null
  video_id: string | null
  permalink: string | null
  preview_url: string | null
  ad_ids: string[]
  campaign_ids: string[]
}

/** One CRM day × campaign × creative bucket. `ad_key` is the ad name (creative key). */
export interface CrmDaily {
  date: string
  campaign_id: string
  ad_key: string | null // null when the ad no longer exists in the account
  leads: number
  qual: number
}

export interface CrmStatusRow {
  date: string
  campaign_id: string
  status: string // e.g. "05.Qualified"
  n: number
}

export interface CrmGeoRow {
  date: string
  campaign_id: string
  country: string
  leads: number
  qual: number
}

/** One funnel stage, in the order the columns appear on the «История статусов» tab. */
export interface CrmStageDef {
  key: string // e.g. "06.Meeting Set"
  depth: number // 0 = qualified; larger is deeper down the funnel
}

/**
 * Qualified leads that reached `stage` OR ANY DEEPER ONE.
 *
 * Cumulative on purpose: sales routinely stamps a later stage without back-filling
 * the one before it, so counting each column on its own produces a funnel that
 * grows downwards. Every row therefore appears once per stage it got past.
 *
 * Two dates, because they answer different questions and the UI switches between
 * them: `lead_date` pairs the event with the spend that bought the lead (cohort),
 * `event_date` is when the stage was actually reached.
 */
export interface CrmStageRow {
  stage: string
  lead_date: string
  event_date: string
  campaign_id: string
  ad_key: string | null
  n: number
}

/** Terminal loss (column «Lost / Closed») — not a stage, never part of the ladder. */
export interface CrmLostRow {
  lead_date: string
  event_date: string
  campaign_id: string
  ad_key: string | null
  n: number
}

/** Rows the UTM join could not attribute — surfaced, never silently dropped. */
export interface CrmUnmatched {
  macro: number // Meta never substituted {{campaign.name}} / {{ad.name}}
  unknown_campaign: number // older flight, outside the dashboard window
  unknown_ad: number // campaign matched, ad no longer in the account
  no_utm: number // organic: WhatsApp, direct, referral — "—" in the UTM cells
  bad_date: number
  out_of_window: number
  examples: Record<string, string[]>
  /** Stage layer only: a qual whose lead has no row on the client_data tab yet. */
  qual_only_in_history?: number
  /** Stage layer only: text where a stage date was expected. */
  bad_stage_date?: number
}

/**
 * Whether a CRM source on screen can be trusted. `stale` means that tab was
 * unusable on the last run and these numbers are the last good ones, frozen —
 * the Meta side, and the other tab, are still live.
 */
export interface CrmHealth {
  ok: boolean
  stale: boolean
  reason:
    | 'ok'
    | 'source_truncated'
    | 'join_broken'
    | 'no_rows_in_window'
    | 'date_format_broken'
  message: string | null
  hint: string | null
  tab: string // which tab this verdict is about
  checked_at: string
  frozen_at: string | null
  rows_total: number
  baseline_rows_total: number | null
  match_rate: number
}

export interface Crm {
  source: string
  sheet_id: string
  /** «client_data» — every lead. Drives `daily.leads`, `status`, `geo.leads`. */
  tab: string
  /** «История статусов» — quals only. Drives `daily.qual`, `geo.qual`, `stages`. */
  hist_tab: string
  fetched_at: string
  hist_fetched_at: string | null
  rows_total: number
  rows_in_window: number
  rows_matched: number
  unmatched: CrmUnmatched
  hist_rows_total: number
  hist_rows_in_window: number
  hist_rows_matched: number
  hist_unmatched: CrmUnmatched
  qual_total: number
  daily: CrmDaily[]
  status: CrmStatusRow[]
  geo: CrmGeoRow[]
  stage_defs: CrmStageDef[]
  stages: CrmStageRow[]
  lost: CrmLostRow[]
  /** Worst of the two sources — what the banner shows. */
  health?: CrmHealth // absent on datasets built before the health check existed
  health_sources?: { client_data: CrmHealth; stages: CrmHealth }
}

export interface Dataset {
  generated_at: string
  lead_type: string // which action_type is used as the primary "leads"
  account: Account
  project: string
  plan: { budget: number; leads: number; cpl: number; qual: number; cpql: number }
  date_min: string
  date_max: string
  campaigns: Campaign[]
  adsets: AdSet[]
  ads: Ad[]
  creatives: CreativeGroup[]
  daily: DailyRow[]
  /** Dictionary for `placement_daily`; index into this array is the placement id. */
  placements?: Placement[]
  /**
   * [date, ad_id, placement_index, spend, impressions, clicks, leads]
   *
   * Positional on purpose — the object form is 2.5× the bytes, and this ships to
   * the browser on every load. Same grain as `daily` plus the placement, so the
   * existing date/language filters apply unchanged.
   */
  placement_daily?: PlacementRow[]
  crm?: Crm // absent if the CRM step was skipped
}

export interface Placement {
  platform: string // facebook | instagram | audience_network | threads | messenger
  position: string // feed | instagram_reels | instagram_stories | an_classic …
}

export type PlacementRow = [string, string, number, number, number, number, number]

/** Aggregated metric bucket used throughout the UI. */
export interface Metrics {
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  cpm: number
  cpc: number
  ctr: number
  // CRM layer — null only when the dataset has no crm block at all
  crm_leads: number | null // leads the CRM actually recorded (≠ Meta leads)
  qual_leads: number | null
  cpql: number | null // spend / qualified leads
  qual_rate: number | null // qualified / crm_leads, %
}
