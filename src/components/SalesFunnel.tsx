import type { Dataset } from '../types'
import type { Filters, Index } from '../lib/data'
import { statusLadder } from '../lib/data'
import { Card, SectionTitle, InfoDot } from './ui'
import { int, pct } from '../lib/format'
import { COLORS, STATUS_ORDER } from '../config'

const HINT =
  'Статусы сделок из CRM за выбранный период. Это состояние на сейчас, а не путь лида: ' +
  'сделка видна только в том статусе, где стоит сегодня.'

/** Colour ramp: cold grey at the top of the pipeline → gold at the meeting stage. */
const TINT: Record<string, string> = {
  '01.New Lead': COLORS.impressions,
  '03. No Responce': COLORS.dim,
  '04.Replied': COLORS.ctr,
  '05.Qualified': COLORS.qual,
  '06.Meeting Set': COLORS.gold,
  '07.Online Meeting': COLORS.gold,
}

/** Terminal loss — tinted red so it never reads as another rung of the ladder. */
const isLost = (s: string) => /ЗАКРЫТО|НЕ РЕАЛИЗОВАНО|отказ/i.test(s)

export default function SalesFunnel({
  ds,
  idx,
  filters,
}: {
  ds: Dataset
  idx: Index
  filters: Filters
}) {
  const ladder = statusLadder(ds, idx, filters, STATUS_ORDER)
  const total = ladder.reduce((s, r) => s + r.n, 0)
  const max = Math.max(1, ...ladder.map((r) => r.n))

  return (
    <Card className="p-5">
      <SectionTitle
        title="Статусы сделок"
        subtitle={`${int(total)} сделок в CRM за период`}
        right={<InfoDot text={HINT} />}
      />

      {ladder.length === 0 ? (
        <div className="py-6 text-center text-dim text-sm">Нет сделок за период</div>
      ) : (
        <div className="space-y-2">
          {ladder.map((r) => {
            const lost = isLost(r.status)
            const color = TINT[r.status] || (lost ? COLORS.neg : COLORS.mute)
            return (
              <div
                key={r.status}
                className={`flex items-center gap-3 ${lost ? 'pt-2 mt-1 border-t border-line2' : ''}`}
              >
                <span className="w-36 shrink-0 truncate text-xs text-mute" title={r.status}>
                  {r.status}
                </span>
                <div className="h-6 flex-1 rounded-md bg-card2 overflow-hidden">
                  <div
                    className="h-full rounded-md"
                    style={{
                      width: `${Math.max(2, (r.n / max) * 100)}%`,
                      background: `linear-gradient(90deg, ${color}cc, ${color}66)`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular text-sm font-medium text-ink">
                  {int(r.n)}
                </span>
                <span className="w-12 shrink-0 text-right tabular text-xs text-dim">
                  {pct(total ? (r.n / total) * 100 : 0, 1)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
