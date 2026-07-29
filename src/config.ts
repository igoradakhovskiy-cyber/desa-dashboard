// Presentation-side constants (data-side config lives in scripts/fetch-meta.mjs).

// Colors mirror src/index.css @theme — Recharts needs literal strings.
export const COLORS = {
  en: '#4a92e0',
  de: '#d8b878',
  ru: '#e2683c',
  gold: '#d8b878',
  qual: '#46c08a',
  pos: '#46c08a',
  neg: '#e2683c',
  warn: '#e6b450',
  ink: '#e8ebf2',
  mute: '#9aa3b7',
  dim: '#6b7488',
  grid: '#232c3d',
  // metric series
  spend: '#7c86ff',
  leads: '#46c08a',
  cpl: '#d8b878',
  ctr: '#4a92e0',
  impressions: '#5a6b8c',
}

export const langColor = (lang: string) =>
  lang === 'en' ? COLORS.en : lang === 'de' ? COLORS.de : COLORS.ru

/** Resolve a pipeline asset path (e.g. "creatives/x.jpg") against the Pages base URL. */
export const assetUrl = (p?: string | null) => (p ? import.meta.env.BASE_URL + p : '')
export const LANG_LABEL: Record<string, string> = { ru: 'RU', en: 'EN', de: 'DE', all: 'Все' }

// Meta lead action types are consistent for this account (lead == fb_pixel_lead == onsite_web_lead).
export const LEAD_HINT = 'Лид = событие «lead» из Meta (совпадает с pixel/onsite-лидом)'
export const QUAL_HINT =
  'Квал-лид = «Qualified» в колонке F выгрузки CRM. Привязан к дате создания лида, ' +
  'поэтому за последние дни цифра ещё дорастёт.'

/**
 * Manual rebuild = the "Run workflow" button on the Actions page.
 *
 * Triggering it from the page itself would need a GitHub token in the browser, and
 * this bundle ships to the client — so the button opens the page instead of holding
 * a credential. It only does anything for repo collaborators, hence ADMIN_ONLY below.
 */
export const REFRESH_URL =
  'https://github.com/igoradakhovskiy-cyber/desa-dashboard/actions/workflows/deploy.yml'
/** Admin controls are opt-in via ?admin so the client never sees a dead GitHub link. */
export const isAdmin = () =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('admin')

/** The scheduled rebuild runs every 3h; past this the dashboard is visibly behind. */
export const STALE_AFTER_HOURS = 4

// ------------------------------------------------------------ placements ----

export const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  threads: 'Threads',
  unknown: 'Не определён',
}

export const PLATFORM_COLOR: Record<string, string> = {
  facebook: '#4a92e0',
  instagram: '#d857a8',
  audience_network: '#e6b450',
  messenger: '#7c86ff',
  threads: '#8f9bb3',
  unknown: '#6b7488',
}

/** Meta's `platform_position` values, in the wording Ads Manager uses in Russian. */
export const POSITION_LABEL: Record<string, string> = {
  feed: 'Лента',
  facebook_reels: 'Reels',
  instagram_reels: 'Reels',
  facebook_stories: 'Stories',
  instagram_stories: 'Stories',
  story: 'Stories',
  facebook_reels_overlay: 'Reels · оверлей',
  instream_video: 'In-stream видео',
  video_feeds: 'Видеолента',
  marketplace: 'Marketplace',
  search: 'Поиск',
  instagram_search: 'Поиск',
  instagram_explore: 'Интересное',
  instagram_explore_grid_home: 'Интересное · сетка',
  instagram_profile_feed: 'Лента профиля',
  instagram_profile_reels: 'Reels в профиле',
  biz_disco_feed: 'Business Discovery',
  right_hand_column: 'Правая колонка',
  an_classic: 'Баннеры и нативка',
  rewarded_video: 'Rewarded video',
  messenger_inbox: 'Входящие',
  threads_feed: 'Лента',
  unknown: 'Не определён',
}

export const QUAL_EST_HINT =
  'Оценка, не факт. В выгрузке CRM нет плейсмента, поэтому квалы каждого объявления ' +
  'распределены по его собственным плейсментам пропорционально лидам: объявление с 10 квалами, ' +
  'у которого 70% лидов пришло из Reels, отдаёт в Reels 7. Считается отдельно по каждому ' +
  'объявлению, а не общим средним. Фактические цифры — расход, показы, клики, лиды и CPL.'

/** Sales-pipeline ladder, in the order the CRM statuses actually progress. */
export const STATUS_ORDER = [
  '01.New Lead',
  '03. No Responce',
  '04.Replied',
  '05.Qualified',
  '06.Meeting Set',
  '07.Online Meeting',
]
