import type { CrmDaily, DailyRow, Metrics } from '../types'
import type { Index } from '../lib/data'
import { splitByLang } from '../lib/data'
import { Card, SectionTitle } from './ui'
import { int, money, moneySmart, pct } from '../lib/format'
import { COLORS, LANG_LABEL, langColor } from '../config'

export default function LangSplit({
  rows,
  idx,
  total,
  crmRows,
}: {
  rows: DailyRow[]
  idx: Index
  total: Metrics
  crmRows: CrmDaily[] | null
}) {
  const split = splitByLang(rows, idx, crmRows)
  const totalSpend = total.spend || 1
  const hasCrm = !!crmRows

  return (
    <Card className="p-5">
      <SectionTitle title="Потоки EN / DE / RU" subtitle="Разбивка по языку кампаний" />

      {/* share bar */}
      <div className="flex h-2.5 w-full rounded-full overflow-hidden mb-4 bg-card2">
        {split.map((s) => (
          <div
            key={s.lang}
            style={{
              width: `${(s.metrics.spend / totalSpend) * 100}%`,
              background: langColor(s.lang),
            }}
          />
        ))}
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
              <th className="font-medium py-1.5 pl-1">Поток</th>
              <th className="font-medium py-1.5 text-right">Расход</th>
              <th className="font-medium py-1.5 text-right">Доля</th>
              <th className="font-medium py-1.5 text-right">Лиды</th>
              <th className="font-medium py-1.5 text-right">CPL</th>
              {hasCrm && <th className="font-medium py-1.5 text-right">Квалы</th>}
              {hasCrm && <th className="font-medium py-1.5 text-right">CPQL</th>}
              <th className="font-medium py-1.5 text-right pr-1">CTR</th>
            </tr>
          </thead>
          <tbody>
            {split.map((s) => (
              <tr key={s.lang} className="border-t border-line2">
                <td className="py-2 pl-1">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: langColor(s.lang) }}
                    />
                    <span className="font-medium text-ink">{LANG_LABEL[s.lang]}</span>
                  </span>
                </td>
                <td className="py-2 text-right tabular text-ink">{money(s.metrics.spend)}</td>
                <td className="py-2 text-right tabular text-mute">
                  {pct((s.metrics.spend / totalSpend) * 100, 1)}
                </td>
                <td className="py-2 text-right tabular text-ink">{int(s.metrics.leads)}</td>
                <td className="py-2 text-right tabular text-ink">{moneySmart(s.metrics.cpl)}</td>
                {hasCrm && (
                  <td
                    className="py-2 text-right tabular font-medium"
                    style={{ color: s.metrics.qual_leads ? COLORS.qual : COLORS.dim }}
                  >
                    {int(s.metrics.qual_leads || 0)}
                  </td>
                )}
                {hasCrm && (
                  <td className="py-2 text-right tabular text-ink">
                    {s.metrics.qual_leads ? moneySmart(s.metrics.cpql!) : '—'}
                  </td>
                )}
                <td className="py-2 text-right tabular text-mute pr-1">{pct(s.metrics.ctr)}</td>
              </tr>
            ))}
            {split.length === 0 && (
              <tr>
                <td colSpan={hasCrm ? 8 : 6} className="py-4 text-center text-dim">
                  Нет данных за период
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
