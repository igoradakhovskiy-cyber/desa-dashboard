/**
 * Country naming bridge between the two data sources.
 *
 * Meta's `breakdowns=country` returns ISO-3166-1 alpha-2 codes ("DE"); the CRM
 * export carries English CLDR names ("Germany", "Türkiye", "Myanmar (Burma)") —
 * Bitrix derives them from the phone number. The dashboard keys geography by ISO
 * code and renders a Russian name, so both directions live here.
 *
 * The tables are generated from `Intl.DisplayNames` rather than typed by hand:
 * the CRM emits CLDR spellings verbatim, so generating from the same source is
 * what makes the join exact instead of a guessing game about diacritics.
 */

const EN = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })
const RU = new Intl.DisplayNames(['ru'], { type: 'region', fallback: 'none' })

/**
 * CLDR still names deprecated and aggregate codes, and several of them collide
 * with a live country ("Serbia" is both RS and YU, "France" both FR and FX).
 * Left in, the reverse index would hand the join a code Meta never returns and
 * every lead from that country would quietly stop matching its spend.
 */
const NOT_A_COUNTRY = new Set([
  // deprecated, collide with a current code
  'FX', 'YU', 'CS', 'AN', 'ZR', 'TP', 'SU', 'DD', 'BU', 'NT', 'DY', 'HV', 'VD', 'NH', 'YD', 'RH',
  // groupings and exceptional reservations, not destinations
  'QU', 'UK', 'EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB', 'AC', 'TA', 'DG', 'IC', 'EA', 'CP',
])

const CODES = []
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const c = String.fromCharCode(a, b)
    if (NOT_A_COUNTRY.has(c)) continue
    try {
      if (EN.of(c)) CODES.push(c)
    } catch {
      /* not a region subtag */
    }
  }
}

/** Shorter or more familiar than the CLDR Russian name. */
const RU_OVERRIDE = {
  US: 'США',
  KR: 'Южная Корея',
  MM: 'Мьянма',
  US_CA: 'США / Канада',
}

const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** English CLDR name → ISO code. */
const EN_TO_ISO = new Map()
for (const c of CODES) EN_TO_ISO.set(normName(EN.of(c)), c)

/**
 * Buckets the CRM writes that are not a country.
 *
 * Bitrix labels a lead by the *dialling plan* of its phone number, and a few
 * plans span borders. A plan with one obvious main country folds into it; the
 * North American one genuinely cannot be split after the fact, so it keeps its
 * own pseudo-code and stays out of the money columns instead of being guessed
 * into US.
 */
const CRM_ALIASES = {
  'australia / christmas island / cocos islands': 'AU',
  'united states / canada (nanp)': 'US_CA',
  'сша / канада': 'US_CA',
  // hand-typed spellings, in case anyone ever edits the column
  uk: 'GB',
  england: 'GB',
  usa: 'US',
  uae: 'AE',
  turkey: 'TR',
  holland: 'NL',
  'czech republic': 'CZ',
  burma: 'MM',
}

/**
 * Country label as the CRM wrote it → ISO code, or null when unrecognised.
 *
 * Unknown multi-country labels fall back to their first segment, so a dialling
 * plan we have not seen before ("X / Y / Z") still lands on a real country
 * rather than becoming a row of its own.
 */
export function isoFromCrm(name) {
  const k = normName(name)
  if (!k || k === '—' || k === '-') return null
  if (CRM_ALIASES[k]) return CRM_ALIASES[k]
  const direct = EN_TO_ISO.get(k)
  if (direct) return direct
  if (k.includes('/')) {
    const head = normName(k.split('/')[0])
    if (EN_TO_ISO.get(head)) return EN_TO_ISO.get(head)
  }
  return null
}

/** Display name for an ISO code; falls back to the raw code so nothing vanishes. */
export const ruFromIso = (iso) => {
  if (RU_OVERRIDE[iso]) return RU_OVERRIDE[iso]
  try {
    return RU.of(iso) || iso
  } catch {
    return iso
  }
}

/** Only the names actually needed by a dataset — keeps the payload small. */
export function nameMapFor(isoCodes) {
  const out = {}
  for (const iso of isoCodes) out[iso] = ruFromIso(iso)
  return out
}
