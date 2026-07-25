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

/** Sales-pipeline ladder, in the order the CRM statuses actually progress. */
export const STATUS_ORDER = [
  '01.New Lead',
  '03. No Responce',
  '04.Replied',
  '05.Qualified',
  '06.Meeting Set',
  '07.Online Meeting',
]
