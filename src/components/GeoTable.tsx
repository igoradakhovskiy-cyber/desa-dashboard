import { useState } from 'react'
import type { Dataset } from '../types'
import type { Filters, Index } from '../lib/data'
import { geoTable } from '../lib/data'
import { Card, SectionTitle, Segmented } from './ui'
import { int, pct } from '../lib/format'
import { COLORS } from '../config'

const SHOW = 8

/**
 * Where the qualified leads actually come from. Volume and quality diverge sharply
 * here, which is exactly the signal worth acting on when shifting geo budgets.
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
  const [sort, setSort] = useState<'qual' | 'leads'>('qual')
  const [all, setAll] = useState(false)

  const rowsAll = geoTable(ds, idx, filters)
  const sorted =
    sort === 'qual'
      ? rowsAll
      : [...rowsAll].sort((a, b) => b.leads - a.leads || b.qual - a.qual)
  const rows = all ? sorted : sorted.slice(0, SHOW)
  const maxLeads = Math.max(1, ...sorted.map((r) => r.leads))

  return (
    <Card className="p-5">
      <SectionTitle
        title="География лидов"
        subtitle={`${rowsAll.length} стран за период`}
        right={
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'qual', label: 'по квалам' },
              { value: 'leads', label: 'по лидам' },
            ]}
          />
        }
      />

      {rows.length === 0 ? (
        <div className="py-6 text-center text-dim text-sm">Нет данных за период</div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[380px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
                  <th className="font-medium py-1.5 pl-1">Страна</th>
                  <th className="font-medium py-1.5 text-right">Лиды</th>
                  <th className="font-medium py-1.5 text-right">Квалы</th>
                  <th className="font-medium py-1.5 text-right pr-1">% квала</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.country} className="border-t border-line2">
                    <td className="py-1.5 pl-1 relative">
                      <span
                        className="absolute inset-y-1 left-0 rounded-sm"
                        style={{
                          width: `${(r.leads / maxLeads) * 100}%`,
                          background: COLORS.en + '12',
                        }}
                      />
                      <span className="relative text-ink">{r.country}</span>
                    </td>
                    <td className="py-1.5 text-right tabular text-mute">{int(r.leads)}</td>
                    <td
                      className="py-1.5 text-right tabular font-medium"
                      style={{ color: r.qual ? COLORS.qual : COLORS.dim }}
                    >
                      {int(r.qual)}
                    </td>
                    <td className="py-1.5 text-right tabular text-mute pr-1">
                      {r.qual ? pct(r.rate, 1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
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
        </>
      )}
    </Card>
  )
}
