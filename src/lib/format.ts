// ru-RU number / money / date formatting helpers.
const RU = 'ru-RU'
const nf0 = new Intl.NumberFormat(RU, { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat(RU, { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat(RU, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const int = (n: number) => nf0.format(Math.round(n || 0))
export const num1 = (n: number) => nf1.format(n || 0)
export const money = (n: number) => '$' + nf0.format(Math.round(n || 0))
export const money2 = (n: number) => '$' + nf2.format(n || 0)
/** decimals only when the value is small (CPL, CPC …) */
export const moneySmart = (n: number) => (Math.abs(n) >= 100 ? money(n) : '$' + nf2.format(n || 0))
export const pct = (n: number, d: 1 | 2 = 2) => (d === 2 ? nf2 : nf1).format(n || 0) + '%'

/** Russian plural: plural(3, 'страна', 'страны', 'стран') -> 'страны' */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(Math.round(n)) % 100
  if (a > 10 && a < 20) return many
  const b = a % 10
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

/** compact for chart axes: 12.3k, 1.2M */
export const compact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return num1(n / 1_000_000) + 'M'
  if (a >= 1_000) return num1(n / 1_000) + 'k'
  return int(n)
}

export const dateShort = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}
export const dateFull = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
export const dateHuman = (iso: string) => {
  const [y, m, d] = iso.split('-')
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`
}
