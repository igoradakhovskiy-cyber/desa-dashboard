import { useState } from 'react'
import type { Dataset } from '../types'
import type { Filters, GeoRow, Index } from '../lib/data'
import { geoTable } from '../lib/data'
import { Card, InfoDot, SectionTitle, Segmented } from './ui'
import { int, money, moneySmart, pct, plural } from '../lib/format'
import { COLORS, GEO_HINT } from '../config'

const SHOW = 8
type SortKey = 'spend' | 'qual' | 'cpql'

/**
 * The full country P&L: what each geo cost and what it actually returned.
 *
 * Volume and quality diverge sharply here — the country burning the most budget
 * is rarely the one sending qualified leads — which is exactly the signal worth
 * acting on when moving geo budgets around.
 */
export default function GeoTable({
  ds,
  idx,
  filters,
}: {
  ds: Dataset
  idx: Index
  filters: Filters
}) {
  const [sort, setSort] = useState<SortKey>('spend')
  const [all, setAll] = useState(false)

  const rowsAll = geoTable(ds, idx, filters)

  // Countries the CRM knows but Meta never delivered to always sit at the bottom:
  // they have no spend, so every money column would be a lie.
  const delivered = rowsAll.filter((r) => !r.no_delivery)
  const offGeo = rowsAll.filter((r) => r.no_delivery)

  const sorters: Record<SortKey, (a: GeoRow, b: GeoRow) => number> = {
    spend: (a, b) => b.spend - a.spend,
    qual: (a, b) => b.qual - a.qual || b.spend - a.spend,
    // countries without a qual sort last instead of pretending to be free
    cpql: (a, b) => (a.cpql ?? Infinity) - (b.cpql ?? Infinity) || b.spend - a.spend,
  }
  const sorted = [...delivered].sort(sorters[sort])
  const rows = all ? sorted : sorted.slice(0, SHOW)
  const maxSpend = Math.max(1, ...sorted.map((r) => r.spend))

  const totals = rowsAll.reduce(
    (o, r) => {
      o.spend += r.spend
      o.leads += r.leads
      o.crm_leads += r.crm_leads
      o.qual += r.qual
      return o
    },
    { spend: 0, leads: 0, crm_leads: 0, qual: 0 },
  )

  return (
    <Card className="p-5">
      <SectionTitle
        title="География"
        subtitle={`${delivered.length} ${plural(delivered.length, 'страна', 'страны', 'стран')} за период`}
        right={
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'spend', label: 'по расходу' },
              { value: 'qual', label: 'по квалам' },
              { value: 'cpql', label: 'по CPQL' },
            ]}
          />
        }
      />

      {rows.length === 0 ? (
        <div className="py-6 text-center text-dim text-sm">Нет данных за период</div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[13px] min-w-[500px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-dim">
                  <th className="font-medium py-1.5 pl-1">
                    <span className="inline-flex items-center gap-1.5">
                      Страна <InfoDot text={GEO_HINT} />
                    </span>
                  </th>
                  <th className="font-medium py-1.5 text-right">Расход</th>
                  <th className="font-medium py-1.5 text-right">Лиды</th>
                  <th className="font-medium py-1.5 text-right">CPL</th>
                  <th className="font-medium py-1.5 text-right">Квалы</th>
                  <th className="font-medium py-1.5 text-right">CPQL</th>
                  <th className="font-medium py-1.5 text-right pr-1">% квала</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.country} r={r} maxSpend={maxSpend} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="py-2 pl-1 text-mute font-medium">Итого</td>
                  <td className="py-2 text-right tabular text-ink font-medium">
                    {money(totals.spend)}
                  </td>
                  <td className="py-2 text-right tabular text-mute">{int(totals.leads)}</td>
                  <td className="py-2 text-right tabular text-mute">
                    {totals.leads ? moneySmart(totals.spend / totals.leads) : '—'}
                  </td>
                  <td
                    className="py-2 text-right tabular font-medium"
                    style={{ color: totals.qual ? COLORS.qual : COLORS.dim }}
                  >
                    {int(totals.qual)}
                  </td>
                  <td className="py-2 text-right tabular text-ink font-medium">
                    {totals.qual ? moneySmart(totals.spend / totals.qual) : '—'}
                  </td>
                  <td className="py-2 text-right tabular text-mute pr-1">
                    {totals.crm_leads ? pct((totals.qual / totals.crm_leads) * 100, 1) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {sorted.length > SHOW && (
            <button
              onClick={() => setAll(!all)}
              className="mt-3 text-xs text-mute hover:text-ink transition-colors"
            >
              {all ? '× свернуть' : `показать все ${sorted.length} →`}
            </button>
          )}

          {offGeo.length > 0 && (
            <div className="mt-4 border-t border-line2 pt-3">
              <p className="text-[11px] text-dim">
                Ещё {offGeo.length} {plural(offGeo.length, 'страна', 'страны', 'стран')} есть в
                CRM, но рекламу там не показывали — человек кликнул из другой страны, а номер
                телефона остался домашним. Расход на них не относится, поэтому CPQL не считаем:
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {offGeo
                  .slice()
                  .sort((a, b) => b.qual - a.qual || b.crm_leads - a.crm_leads)
                  .map((r) => (
                    <span key={r.country} className="text-mute">
                      {r.name}{' '}
                      <span className="tabular text-dim">
                        {int(r.crm_leads)} {plural(r.crm_leads, 'лид', 'лида', 'лидов')}
                      </span>
                      {r.qual > 0 && (
                        <span className="tabular font-medium" style={{ color: COLORS.qual }}>
                          {' '}
                          · {int(r.qual)} {plural(r.qual, 'квал', 'квала', 'квалов')}
                        </span>
                      )}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function Row({ r, maxSpend }: { r: GeoRow; maxSpend: number }) {
  // The CRM lead count is the denominator behind "% квала", so it belongs in the
  // row's tooltip rather than in an eighth column nobody can read on a phone.
  const title =
    `${r.name} · ${r.country}\n` +
    `Расход ${money(r.spend)} · показы ${int(r.impressions)} · клики ${int(r.clicks)}\n` +
    `Лиды Meta: ${int(r.leads)} · записано в CRM: ${int(r.crm_leads)}\n` +
    `Квалов: ${int(r.qual)}`

  return (
    <tr className="border-t border-line2" title={title}>
      <td className="py-1.5 pl-1 relative">
        <span
          className="absolute inset-y-1 left-0 rounded-sm"
          style={{ width: `${(r.spend / maxSpend) * 100}%`, background: COLORS.spend + '14' }}
        />
        <span className="relative text-ink">{r.name}</span>
      </td>
      <td className="py-1.5 text-right tabular text-ink">{money(r.spend)}</td>
      <td className="py-1.5 text-right tabular text-mute">{int(r.leads)}</td>
      <td className="py-1.5 text-right tabular text-mute">
        {r.cpl === null ? '—' : moneySmart(r.cpl)}
      </td>
      <td
        className="py-1.5 text-right tabular font-medium"
        style={{ color: r.qual ? COLORS.qual : COLORS.dim }}
      >
        {int(r.qual)}
      </td>
      <td
        className="py-1.5 text-right tabular font-medium"
        style={{ color: r.cpql === null ? COLORS.dim : COLORS.gold }}
      >
        {r.cpql === null ? '—' : moneySmart(r.cpql)}
      </td>
      <td className="py-1.5 text-right tabular text-mute pr-1">
        {r.qual_rate === null || !r.qual ? '—' : pct(r.qual_rate, 1)}
      </td>
    </tr>
  )
}
