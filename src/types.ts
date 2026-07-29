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

/** Rows the UTM join could not attribute — surfaced, never silently dropped. */
export interface CrmUnmatched {
  macro: number // Meta never substituted {{campaign.name}} / {{ad.name}}
  unknown_campaign: number // older flight, outside the dashboard window
  unknown_ad: number // campaign matched, ad no longer in the account
  no_utm: number
  bad_date: number
  out_of_window: number
  examples: Record<string, string[]>
}

/**
 * Whether the CRM layer on screen can be trusted. `stale` means the sheet was
 * unusable on the last run and these numbers are the last good ones, frozen —
 * the Meta side around them is still live.
 */
export interface CrmHealth {
  ok: boolean
  stale: boolean
  reason: 'ok' | 'source_truncated' | 'join_broken' | 'no_rows_in_window'
  message: string | null
  hint: string | null
  checked_at: string
  frozen_at: string | null
  rows_total: number
  baseline_rows_total: number | null
  match_rate: number
}

export interface Crm {
  source: string
  sheet_id: string
  tab: string
  fetched_at: string
  rows_total: number
  rows_in_window: number
  rows_matched: number
  qual_total: number
  daily: CrmDaily[]
  status: CrmStatusRow[]
  geo: CrmGeoRow[]
  unmatched: CrmUnmatched
  health?: CrmHealth // absent on datasets built before the health check existed
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
