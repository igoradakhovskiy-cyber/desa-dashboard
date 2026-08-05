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
  'Квал-лид = строка на листе «История статусов» выгрузки CRM: на этом листе лежат только квалы, ' +
  'поэтому квал определяется наличием сделки, а не значением ячейки.\n\n' +
  'Эта цифра всегда считается по дате создания лида — переключатель «по дате заявки / по дате этапа» ' +
  'под воронкой на неё не влияет. Поэтому за последние дни она ещё дорастёт, а в режиме «по дате ' +
  'этапа» может не сойтись с первой строкой воронки.'

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

// ---------------------------------------------------------- sales funnel ----

/**
 * Russian names for the funnel stages.
 *
 * Deliberately a lookup with a fallback, not a source of truth: the order and the
 * set of stages come from the sheet itself, so a stage added by the sales team
 * shows up here under its raw key until someone translates it. Better an English
 * label on the dashboard than a stage that silently does not exist.
 */
export const STAGE_LABEL: Record<string, string> = {
  '05.Qualified': 'Квал-лид',
  '06.Meeting Set': 'Встреча назначена',
  '07.Online Meeting': 'Онлайн-встреча проведена',
  '08.Zoom with Founder': 'Zoom с основателем',
  '09.on-site Visit': 'Визит на объект',
  '10.Booking': 'Бронь',
  '11.Due diligence': 'Due diligence',
  '12.Contract signed': 'Договор подписан',
  '13.Contract Payment Received': 'Оплата получена',
}

/** Short forms for table headers, where the full label would wreck the layout. */
export const STAGE_SHORT: Record<string, string> = {
  '05.Qualified': 'Квалы',
  '06.Meeting Set': 'Встреча',
  '07.Online Meeting': 'Онлайн',
  '08.Zoom with Founder': 'Zoom',
  '09.on-site Visit': 'Визит',
  '10.Booking': 'Бронь',
  '11.Due diligence': 'DD',
  '12.Contract signed': 'Договор',
  '13.Contract Payment Received': 'Оплата',
}

/** Strips the "NN." prefix so an untranslated stage still reads like a name. */
const rawStageName = (key: string) => key.replace(/^\d{2}\.\s*/, '')
export const stageLabel = (key: string) => STAGE_LABEL[key] || rawStageName(key)
export const stageShort = (key: string) => STAGE_SHORT[key] || rawStageName(key)

/**
 * Cold green at the qual, warming to gold as the deal gets closer to money.
 * Interpolated over the stages that actually exist, so adding a stage to the
 * sheet re-spaces the ramp instead of falling off the end of a fixed list.
 */
export function stageColor(depth: number, total: number) {
  const t = total > 1 ? depth / (total - 1) : 0
  const from = [70, 192, 138] // COLORS.qual
  const to = [216, 184, 120] // COLORS.gold
  const ch = from.map((c, i) => Math.round(c + (to[i] - c) * t))
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`
}

export const STAGE_HINT =
  'Воронка по листу «История статусов» выгрузки CRM: на нём лежат только квал-лиды, а в колонках — ' +
  'даты прохождения этапов.\n\n' +
  'Этап засчитывается, если у сделки есть дата на нём ИЛИ на любом более глубоком: продажи ' +
  'регулярно проставляют следующий статус, пропустив предыдущий, и без этого воронка росла бы вниз. ' +
  'Поэтому «дошло до этапа», а не «находится на этапе».\n\n' +
  'Цена этапа = весь расход за период / число дошедших до этапа.'

/**
 * The switch confused its first reader — "по дате события" invites the question
 * "события какого именно?" — so the hint answers exactly that, per stage, and
 * names the two fallbacks. The label itself now says «по дате этапа».
 */
export const BASIS_HINT =
  'Переключатель меняет только одно: к какому дню отнесён этап. Расход и лиды он не трогает.\n\n' +
  '«По дате заявки» — этап считается в тот день, когда лид оставил заявку. Тогда расход периода и ' +
  'его результат — про одних и тех же людей, поэтому цена этапа честная. Минус: последние дни всегда ' +
  'недосчитаны, лиды ещё не успели дойти по воронке.\n\n' +
  '«По дате этапа» — этап считается в тот день, который стоит в колонке ЭТОГО этапа на листе ' +
  '«История статусов»: у «Встреча назначена» это дата назначения встречи, у «Онлайн-встреча» — дата ' +
  'созвона. Если этап пропущен — берётся дата ближайшего заполненного этапа глубже; если у квала не ' +
  'проставлен 05.Qualified — дата создания лида.\n\n' +
  'В коротком периоде цифр в этом режиме больше: подтягиваются сделки по старым заявкам, чей расход ' +
  'в период не входит, поэтому цена этапа занижена. Для оценки закупки — «по дате заявки», ' +
  'для контроля отдела продаж — «по дате этапа».'

/** Labels for the basis switch; also used in the funnel subtitle. */
export const BASIS_LABEL: Record<string, string> = {
  lead: 'по дате заявки',
  event: 'по дате этапа',
}
