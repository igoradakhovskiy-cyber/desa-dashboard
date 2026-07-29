import type { Dataset } from '../types'
import { COLORS, REFRESH_URL, isAdmin } from '../config'
import { dateFull } from '../lib/format'

const ru = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Shown only when the CRM source is broken.
 *
 * The failure mode this exists for: on 27.07.2026 a filter was left on the Google
 * Sheet tab, the export silently shrank to the visible rows, and the pipeline
 * aborted — freezing the whole dashboard for two days while the Meta side was
 * perfectly fine. Now the build ships anyway, and this banner is what stops the
 * frozen CRM numbers from being read as current.
 */
export default function CrmHealth({ ds }: { ds: Dataset }) {
  const h = ds.crm?.health
  if (!h || h.ok) return null

  const tone = COLORS.warn

  return (
    <div
      className="rounded-xl border px-4 py-3.5"
      style={{ borderColor: tone + '55', background: tone + '12' }}
      role="status"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          style={{ background: tone + '26', color: tone }}
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink">
            {h.stale ? 'Данные CRM заморожены' : 'Данные CRM под вопросом'}
          </div>

          <p className="mt-1 text-sm text-mute leading-relaxed">{h.message}</p>
          {h.hint && <p className="mt-1.5 text-sm text-dim leading-relaxed">{h.hint}</p>}

          {h.stale && h.frozen_at && (
            <p className="mt-2 text-xs text-dim leading-relaxed">
              Блоки квалов, воронки продаж и географии показывают последние достоверные данные от{' '}
              <span className="text-mute">{ru(h.frozen_at)}</span>. Реклама Meta — расход, лиды, CPL,
              креативы, плейсменты — обновляется как обычно, она не затронута.
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dim">
            <span>проверено {ru(h.checked_at)}</span>
            {h.baseline_rows_total != null && (
              <span className="tabular">
                строк в таблице: {h.rows_total} (было {h.baseline_rows_total})
              </span>
            )}
            {isAdmin() && (
              <a
                href={REFRESH_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border px-2 py-1 font-medium transition-colors hover:text-ink"
                style={{ borderColor: tone + '55', color: tone }}
              >
                Обновить данные →
              </a>
            )}
            {!isAdmin() && <span>после исправления данные подтянутся в течение 3 часов</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Compact "CRM frozen at …" chip for the header, so staleness is visible without scrolling. */
export function CrmStaleChip({ ds }: { ds: Dataset }) {
  const h = ds.crm?.health
  if (!h || h.ok || !h.stale || !h.frozen_at) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
      style={{ borderColor: COLORS.warn + '55', background: COLORS.warn + '12', color: COLORS.warn }}
      title={h.message || ''}
    >
      CRM на {dateFull(h.frozen_at.slice(0, 10))}
    </span>
  )
}
