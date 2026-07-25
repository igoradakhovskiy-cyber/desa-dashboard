#!/usr/bin/env node
/**
 * Desa Harmonis 2 dashboard — Meta Marketing API data pipeline.
 *
 * Pulls campaigns / ad sets / ads + daily ad-level insights + creative media
 * (poster, video_id, reel permalink, ad-preview iframe) straight from the ad
 * account, downloads posters locally (self-host so they never break), and
 * writes one clean public/data/latest.json that the static dashboard reads.
 *
 * No npm deps — Node 18+ global fetch only.
 *
 * Auth: reads META_ACCESS_TOKEN from the environment (CI secret) or, locally,
 * from ~/.config/claude-meta/token.env. The token is a non-expiring system-user
 * token, so the scheduled rebuild keeps working without manual renewal.
 */

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CREATIVES_DIR = path.join(ROOT, 'public', 'creatives')
// plaintext lands OUTSIDE public/ so it never ships; encrypt-data.mjs turns it into public/data/latest.enc
const OUT_FILE = path.join(ROOT, '.data', 'latest.json')

// ---------------------------------------------------------------- config ----
const ACCOUNT_ID = process.env.META_ACCOUNT_ID || 'act_1113679997274561' // W_RES
const API_VERSION = process.env.META_API_VERSION || 'v21.0'
const PROJECT = process.env.PROJECT_NAME || 'Desa Harmonis 2'
// DESA2 campaigns (400–406) launched 16.06.2026; older flights in this account
// (Desa_inv, HunterMob) are a different offer/geo and would only add noise.
const MIN_DATE = process.env.MIN_DATE || '2026-06-16'
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 120)
// all four lead action_types report identically on this account (707 over 90d),
// so 'lead' is safe and matches Ads Manager
const PRIMARY_LEAD_TYPE = process.env.LEAD_TYPE || 'lead'
const PLAN = {
  budget: Number(process.env.PLAN_BUDGET || 7000),
  leads: Number(process.env.PLAN_LEADS || 350),
  cpl: Number(process.env.PLAN_CPL || 20),
  qual: Number(process.env.PLAN_QUAL || 35),
  cpql: Number(process.env.PLAN_CPQL || 200),
}
const PREVIEW_FORMAT = process.env.PREVIEW_FORMAT || 'INSTAGRAM_STORY'

// ------------------------------------------------------------- token load ---
async function loadToken() {
  if (process.env.META_ACCESS_TOKEN) return process.env.META_ACCESS_TOKEN
  const envPath = path.join(os.homedir(), '.config', 'claude-meta', 'token.env')
  if (existsSync(envPath)) {
    const txt = await fs.readFile(envPath, 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*META_ACCESS_TOKEN\s*=\s*(.+?)\s*$/)
      if (m) return m[1]
    }
  }
  throw new Error('META_ACCESS_TOKEN not found (env or ~/.config/claude-meta/token.env)')
}

// ------------------------------------------------------------- utilities ----
const BASE = `https://graph.facebook.com/${API_VERSION}`
let TOKEN = ''
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

async function graph(pathOrUrl, params = {}, attempt = 1) {
  let url
  if (pathOrUrl.startsWith('http')) {
    url = new URL(pathOrUrl)
  } else {
    url = new URL(`${BASE}/${pathOrUrl}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  url.searchParams.set('access_token', TOKEN)
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.error) {
      const e = json.error
      // transient: rate limit / temporary — back off and retry
      const transient = [1, 2, 4, 17, 341, 613].includes(e.code) || res.status >= 500
      if (transient && attempt <= 4) {
        await sleep(1500 * attempt)
        return graph(pathOrUrl, params, attempt + 1)
      }
      throw new Error(`Graph error ${e.code}/${e.error_subcode || ''}: ${e.message}`)
    }
    return json
  } catch (err) {
    if (attempt <= 4) {
      await sleep(1200 * attempt)
      return graph(pathOrUrl, params, attempt + 1)
    }
    throw err
  }
}

/** Follow paging.next until exhausted, collecting .data. */
async function graphAll(pathStr, params = {}) {
  const out = []
  let json = await graph(pathStr, { ...params, limit: params.limit || 200 })
  out.push(...(json.data || []))
  let guard = 0
  while (json.paging && json.paging.next && guard < 50) {
    json = await graph(json.paging.next)
    out.push(...(json.data || []))
    guard++
  }
  return out
}

/** Bounded-concurrency map. */
async function pMap(items, fn, concurrency = 5) {
  const ret = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      try {
        ret[idx] = await fn(items[idx], idx)
      } catch (err) {
        ret[idx] = null
        console.warn(`  ! item ${idx} failed: ${err.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return ret
}

/**
 * Returns 'en' | 'de' | 'ru' from a name token, or null when there is none.
 * Campaign names are `<num>_<LANG>_<GEO>_…`, e.g. "405_DE_EU_DESA2_AQ_[CPL]_ABO_16.07.2026",
 * so the second underscore-token is checked first; the substring scan is the fallback
 * for older names that don't follow the convention.
 */
const LANGS = { EN: 'en', ENG: 'en', DE: 'de', GER: 'de', RU: 'ru' }

function langToken(name = '') {
  const parts = String(name).toUpperCase().split('_')
  if (parts.length > 1 && LANGS[parts[1]]) return LANGS[parts[1]]
  for (const [tok, lang] of Object.entries(LANGS)) {
    if (parts.includes(tok)) return lang
  }
  return null
}

function parseLeads(actions = []) {
  const b = { lead: 0, pixel: 0, onsite: 0 }
  for (const a of actions) {
    const v = Number(a.value) || 0
    if (a.action_type === 'lead') b.lead += v
    else if (a.action_type === 'offsite_conversion.fb_pixel_lead') b.pixel += v
    else if (a.action_type === 'onsite_web_lead') b.onsite += v
  }
  return b
}

// --------------------------------------------------------- creative media ---
const posterCache = new Map() // videoId/imageHash -> relative path

/** Read intrinsic JPEG dimensions from the SOF marker; null when unparseable. */
function jpegSize(buf) {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

/** Downloads once and self-hosts, so posters never break when Meta CDN URLs expire. */
async function downloadPoster(url, fileBase) {
  const rel = `creatives/${fileBase}.jpg`
  const abs = path.join(CREATIVES_DIR, `${fileBase}.jpg`)
  try {
    if (existsSync(abs)) {
      return { poster: rel, ...(jpegSize(await fs.readFile(abs)) || { w: null, h: null }) }
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(abs, buf)
    return { poster: rel, ...(jpegSize(buf) || { w: null, h: null }) }
  } catch (err) {
    console.warn(`  ! poster download failed (${fileBase}): ${err.message}`)
    return null
  }
}

/**
 * Video-node route: richest source (dimensions + permalink), but it needs page-level
 * access. On accounts where the app lacks it the node returns error #10, so this
 * degrades to null instead of throwing and losing the whole ad.
 */
async function resolveVideoPoster(videoId) {
  if (posterCache.has(videoId)) return posterCache.get(videoId)
  let info = null
  try {
    const v = await graph(videoId, {
      fields: 'permalink_url,picture,thumbnails{uri,is_preferred,height,width}',
    })
    const thumbs = (v.thumbnails && v.thumbnails.data) || []
    let best = thumbs.find((t) => t.is_preferred) || thumbs[0]
    // prefer the largest available thumbnail
    for (const t of thumbs) if ((t.height || 0) > (best?.height || 0)) best = t
    const posterUrl = best?.uri || v.picture || null
    const dl = posterUrl ? await downloadPoster(posterUrl, `vid_${videoId}`) : null
    info = {
      poster: dl?.poster || null,
      poster_w: best?.width || dl?.w || null,
      poster_h: best?.height || dl?.h || null,
      permalink: v.permalink_url ? `https://www.facebook.com${v.permalink_url}` : null,
    }
  } catch (err) {
    videoNodeBlocked++
    info = null
  }
  posterCache.set(videoId, info)
  return info
}
let videoNodeBlocked = 0

async function resolvePreview(adId) {
  try {
    const json = await graph(`${adId}/previews`, { ad_format: PREVIEW_FORMAT })
    const body = json.data && json.data[0] && json.data[0].body
    if (!body) return null
    const m = body.match(/src="([^"]+)"/)
    return m ? m[1].replace(/&amp;/g, '&') : null
  } catch {
    return null
  }
}

/**
 * Poster resolution, best source first:
 *  1. object_story_spec.video_data.image_url — the creative's own poster, full size
 *     (1080×1920) and readable with plain ads permissions. Works everywhere.
 *  2. the video node — adds a permalink, but needs page access (error #10 without it).
 *  3. creative.thumbnail_url — always present but only a 64×64 crop; last resort.
 */
async function resolveCreative(ad) {
  const cr = ad.creative || {}
  const vd = (cr.object_story_spec && cr.object_story_spec.video_data) || {}
  const media = {
    poster: null,
    poster_w: null,
    poster_h: null,
    video_id: cr.video_id || null,
    permalink: cr.instagram_permalink_url || null,
    preview_url: null,
  }

  if (vd.image_url) {
    const dl = await downloadPoster(vd.image_url, `cr_${vd.image_hash || ad.id}`)
    if (dl) {
      media.poster = dl.poster
      media.poster_w = dl.w
      media.poster_h = dl.h
    }
  }
  if (!media.poster && cr.video_id) {
    const v = await resolveVideoPoster(cr.video_id)
    if (v) {
      media.poster = v.poster
      media.poster_w = v.poster_w
      media.poster_h = v.poster_h
      if (!media.permalink) media.permalink = v.permalink
    }
  }
  if (!media.poster && (cr.image_url || cr.thumbnail_url)) {
    const dl = await downloadPoster(cr.image_url || cr.thumbnail_url, `ad_${ad.id}`)
    if (dl) {
      media.poster = dl.poster
      media.poster_w = dl.w
      media.poster_h = dl.h
    }
  }
  media.preview_url = await resolvePreview(ad.id)
  return media
}

// ------------------------------------------------------------------- main ---
async function main() {
  TOKEN = await loadToken()
  await fs.mkdir(CREATIVES_DIR, { recursive: true })
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })

  const until = new Date()
  const sinceD = new Date(until.getTime() - LOOKBACK_DAYS * 86400000)
  const since = ymd(sinceD) < MIN_DATE ? MIN_DATE : ymd(sinceD)
  const timeRange = JSON.stringify({ since, until: ymd(until) })
  console.log(`▶ Account ${ACCOUNT_ID} · window ${since} → ${ymd(until)}`)

  // account meta
  const acct = await graph(ACCOUNT_ID, { fields: 'name,currency,timezone_name' })

  // daily ad-level insights first — tells us which ads were actually active
  console.log('▶ Fetching daily insights…')
  const insRows = await graphAll(`${ACCOUNT_ID}/insights`, {
    level: 'ad',
    fields: 'ad_id,adset_id,campaign_id,spend,impressions,inline_link_clicks,clicks,actions',
    time_range: timeRange,
    time_increment: '1',
    limit: 500,
  })
  const daily = insRows.map((r) => {
    const b = parseLeads(r.actions)
    const primary = b[PRIMARY_LEAD_TYPE === 'lead' ? 'lead' : PRIMARY_LEAD_TYPE === 'offsite_conversion.fb_pixel_lead' ? 'pixel' : 'onsite']
    return {
      ad_id: r.ad_id,
      date: r.date_start,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.inline_link_clicks) || 0,
      leads: primary || 0,
      leads_lead: b.lead,
      leads_pixel: b.pixel,
      leads_onsite: b.onsite,
    }
  })
  const activeAdIds = new Set(daily.map((r) => r.ad_id))
  console.log(`  ${daily.length} daily rows · ${activeAdIds.size} active ads`)

  // structure
  console.log('▶ Fetching campaigns / ad sets / ads…')
  const [allCampaigns, allAdsets, allAds] = await Promise.all([
    graphAll(`${ACCOUNT_ID}/campaigns`, { fields: 'name,status,objective,daily_budget', limit: 500 }),
    graphAll(`${ACCOUNT_ID}/adsets`, { fields: 'name,status,campaign_id', limit: 500 }),
    graphAll(`${ACCOUNT_ID}/ads`, {
      fields:
        'name,status,adset_id,campaign_id,creative{id,object_type,image_url,thumbnail_url,video_id,' +
        'instagram_permalink_url,object_story_spec{video_data{image_url,image_hash}}}',
      limit: 500,
    }),
  ])

  const ads0 = allAds.filter((a) => activeAdIds.has(a.id))
  const usedCampaignIds = new Set(ads0.map((a) => a.campaign_id))
  const usedAdsetIds = new Set(ads0.map((a) => a.adset_id))

  const campaigns = allCampaigns
    .filter((c) => usedCampaignIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      lang: langToken(c.name) || 'en',
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    }))
  const adsets = allAdsets
    .filter((s) => usedAdsetIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, campaign_id: s.campaign_id, status: s.status }))

  // creative media (only for active ads) — bounded concurrency
  console.log(`▶ Resolving creatives + posters for ${ads0.length} ads…`)
  const ads = []
  await pMap(
    ads0,
    async (a) => {
      const campaign = campaigns.find((c) => c.id === a.campaign_id)
      // media is cosmetic — an ad that fails to resolve one must still keep its metrics
      let media
      try {
        media = await resolveCreative(a)
      } catch (err) {
        console.warn(`  ! creative unresolved (${a.name}): ${err.message}`)
        media = {
          poster: null,
          poster_w: null,
          poster_h: null,
          video_id: (a.creative && a.creative.video_id) || null,
          permalink: null,
          preview_url: null,
        }
      }
      ads.push({
        id: a.id,
        name: a.name,
        adset_id: a.adset_id,
        campaign_id: a.campaign_id,
        status: a.status,
        lang: langToken(a.name) || (campaign ? campaign.lang : 'en'),
        creative: media,
      })
    },
    5,
  )

  // creative groups keyed by ad name (the creative concept)
  const groups = new Map()
  for (const a of ads) {
    let g = groups.get(a.name)
    if (!g) {
      g = {
        key: a.name,
        lang: a.lang,
        poster: a.creative.poster,
        poster_w: a.creative.poster_w,
        poster_h: a.creative.poster_h,
        video_id: a.creative.video_id,
        permalink: a.creative.permalink,
        preview_url: a.creative.preview_url,
        ad_ids: [],
        campaign_ids: [],
      }
      groups.set(a.name, g)
    }
    g.ad_ids.push(a.id)
    if (!g.campaign_ids.includes(a.campaign_id)) g.campaign_ids.push(a.campaign_id)
    if (!g.poster && a.creative.poster) {
      g.poster = a.creative.poster
      g.poster_w = a.creative.poster_w
      g.poster_h = a.creative.poster_h
    }
    if (!g.preview_url && a.creative.preview_url) g.preview_url = a.creative.preview_url
    if (!g.permalink && a.creative.permalink) g.permalink = a.creative.permalink
  }

  const dates = daily.map((r) => r.date).sort()
  const dataset = {
    generated_at: new Date().toISOString(),
    lead_type: PRIMARY_LEAD_TYPE,
    account: {
      id: ACCOUNT_ID,
      name: acct.name || '',
      currency: acct.currency || 'USD',
      timezone: acct.timezone_name || '',
    },
    project: PROJECT,
    plan: PLAN,
    date_min: dates[0] || since,
    date_max: dates[dates.length - 1] || ymd(until),
    campaigns,
    adsets,
    ads,
    creatives: [...groups.values()],
    daily,
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(dataset, null, 2))
  console.log(`✔ Wrote ${path.relative(ROOT, OUT_FILE)}`)

  // ---- cross-check summary (helps lock the lead action_type) ----
  const tot = daily.reduce(
    (o, r) => {
      o.spend += r.spend
      o.impr += r.impressions
      o.clicks += r.clicks
      o.lead += r.leads_lead
      o.pixel += r.leads_pixel
      o.onsite += r.leads_onsite
      return o
    },
    { spend: 0, impr: 0, clicks: 0, lead: 0, pixel: 0, onsite: 0 },
  )
  console.log('\n──── cross-check (whole window) ────')
  console.log(`  spend        $${tot.spend.toFixed(2)}`)
  console.log(`  impressions  ${tot.impr}`)
  console.log(`  link clicks  ${tot.clicks}`)
  console.log(`  leads[lead]         ${tot.lead}`)
  console.log(`  leads[fb_pixel_lead] ${tot.pixel}`)
  console.log(`  leads[onsite_web]    ${tot.onsite}`)
  console.log(`  campaigns ${campaigns.length} · adsets ${adsets.length} · ads ${ads.length} · creatives ${groups.size}`)
  const withPoster = ads.filter((a) => a.creative.poster).length
  const withPreview = ads.filter((a) => a.creative.preview_url).length
  console.log(`  posters ${withPoster}/${ads.length} · previews ${withPreview}/${ads.length}`)
  if (videoNodeBlocked) {
    console.log(
      `  note: ${videoNodeBlocked} video node(s) unreadable (app lacks page access) — ` +
        'posters came from the creative instead, permalinks unavailable',
    )
  }
}

main().catch((e) => {
  console.error('✖ pipeline failed:', e)
  process.exit(1)
})
