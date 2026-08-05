import type { StageRow } from '../lib/data'
import { int, moneySmart, pct } from '../lib/format'
import { COLORS, stageColor } from '../config'

/**
 * The cumulative sales funnel, one row per stage.
 *
 * Shared between the dashboard card and the creative modal, because a funnel that
 * looks different depending on where you read it is a funnel nobody trusts. The
 * modal passes `compact` to drop the two derived percentages — inside a single
 * creative the absolute count and the price are the whole story.
 */
export default function StageLadder({
  rows,
  lost = 0,
  compact = false,
}: {
  rows: StageRow[]
  lost?: number
  compact?: boolean
}) {
  if (!rows.length) return <div className="py-6 text-center text-dim text-sm">Нет данных воронки</div>

  const total = rows.length
  // Scaled against the qual, not against the largest row: the funnel is cumulative,
  // so the first stage is always the widest and the bars read as a real funnel.
  const top = Math.max(1, rows[0]?.n || 0)

  return (
    <div>
      <div className="flex items-center gap-3 pb-1.5 mb-1 border-b border-line text-[10px] uppercase tracking-wide text-dim">
        <span className={compact ? 'w-28 shrink-0' : 'w-40 shrink-0'}>Этап</span>
        <span className="flex-1" />
        <span className="w-10 shrink-0 text-right">Кол-во</span>
        {!compact && <span className="w-12 shrink-0 text-right">% кв.</span>}
        {!compact && <span className="w-14 shrink-0 text-right">из пред.</span>}
        <span className="w-16 shrink-0 text-right">Цена</span>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const color = stageColor(r.depth, total)
          const empty = r.n === 0
          return (
            <div key={r.stage} className={`flex items-center gap-3 ${empty ? 'opacity-40' : ''}`}>
              <span
                className={`${compact ? 'w-28' : 'w-40'} shrink-0 truncate text-xs text-mute`}
                title={`${r.label} · ${r.stage}`}
              >
                {r.label}
              </span>
              <div className="h-6 flex-1 rounded-md bg-card2 overflow-hidden">
                <div
                  className="h-full rounded-md transition-[width]"
                  style={{
                    width: `${Math.max(empty ? 0 : 2, (r.n / top) * 100)}%`,
                    background: `linear-gradient(90deg, ${color}cc, ${color}66)`,
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right tabular text-sm font-medium text-ink">
                {int(r.n)}
              </span>
              {!compact && (
                <span className="w-12 shrink-0 text-right tabular text-xs text-dim">
                  {pct(r.share, 1)}
                </span>
              )}
              {!compact && (
                <span className="w-14 shrink-0 text-right tabular text-xs text-dim">
                  {r.conv === null ? '—' : pct(r.conv, 1)}
                </span>
              )}
              <span
                className="w-16 shrink-0 text-right tabular text-xs font-medium"
                style={{ color: r.cost === null ? COLORS.dim : COLORS.ink }}
              >
                {r.cost === null ? '—' : moneySmart(r.cost)}
              </span>
            </div>
          )
        })}
      </div>

      {lost > 0 && (
        <div className="flex items-center gap-3 pt-2 mt-2 border-t border-line2">
          <span className={`${compact ? 'w-28' : 'w-40'} shrink-0 truncate text-xs text-mute`}>
            Потеряно
          </span>
          <div className="h-6 flex-1 rounded-md bg-card2 overflow-hidden">
            <div
              className="h-full rounded-md"
              style={{
                width: `${Math.max(2, (lost / top) * 100)}%`,
                background: `linear-gradient(90deg, ${COLORS.neg}cc, ${COLORS.neg}66)`,
              }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular text-sm font-medium text-ink">
            {int(lost)}
          </span>
          {!compact && <span className="w-12 shrink-0" />}
          {!compact && <span className="w-14 shrink-0" />}
          <span className="w-16 shrink-0" />
        </div>
      )}
    </div>
  )
}
