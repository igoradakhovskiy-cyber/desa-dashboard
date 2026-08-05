import type { CrmHealth as Health, Dataset } from '../types'
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
 * What goes stale when a given source freezes. Spelled out per source, because
 * "the CRM is frozen" is not actionable when only half of it is: the funnel can be
 * days old while the lead counts next to it are live, and the reader has no way to
 * tell which is which.
 */
const AFFECTED: Record<string, string> = {
  client_data: 'Лиды CRM, % квалификации и «текущий статус» сделок',
  stages: 'Квал-лиды, CPQL и вся воронка по этапам (включая цены этапов)',
}

/** Every broken source, in a stable order. Falls back to the single legacy verdict. */
function brokenSources(ds: Dataset): { id: string; h: Health }[] {
  const src = ds.crm?.health_sources
  if (src) {
    return (['client_data', 'stages'] as const)
      .map((id) => ({ id, h: src[id] }))
      .filter((x) => x.h && !x.h.ok)
  }
  const h = ds.crm?.health
  return h && !h.ok ? [{ id: 'client_data', h }] : []
}

/**
 * Shown only when a CRM source is broken.
 *
 * The failure mode this exists for: on 27.07.2026 a filter was left on the Google
 * Sheet tab, the export silently shrank to the visible rows, and the pipeline
 * aborted — freezing the whole dashboard for two days while the Meta side was
 * perfectly fine. Now the build ships anyway, each tab freezes on its own, and
 * this banner is what stops frozen numbers from being read as current.
 */
export default function CrmHealth({ ds }: { ds: Dataset }) {
  const broken = brokenSources(ds)
  if (!broken.length) return null

  const tone = COLORS.warn

  return (
    <div className="space-y-3">
      {broken.map(({ id, h }) => (
        <div
          key={id}
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
                {h.stale ? 'Данные заморожены' : 'Данные под вопросом'}
                {h.tab && <span className="text-mute font-normal"> · лист «{h.tab}»</span>}
              </div>

              <p className="mt-1 text-sm text-mute leading-relaxed">{h.message}</p>
              {h.hint && <p className="mt-1.5 text-sm text-dim leading-relaxed">{h.hint}</p>}

              {h.stale && h.frozen_at && (
                <p className="mt-2 text-xs text-dim leading-relaxed">
                  {AFFECTED[id] || 'Показатели с этого листа'} показывают последние достоверные данные
                  от <span className="text-mute">{ru(h.frozen_at)}</span>. Всё остальное — реклама
                  Meta и второй лист CRM — обновляется как обычно.
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dim">
                <span>проверено {ru(h.checked_at)}</span>
                {h.baseline_rows_total != null && (
                  <span className="tabular">
                    строк на листе: {h.rows_total} (было {h.baseline_rows_total})
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
      ))}
    </div>
  )
}

/** Compact "CRM frozen at …" chip for the header, so staleness is visible without scrolling. */
export function CrmStaleChip({ ds }: { ds: Dataset }) {
  const stale = brokenSources(ds).filter(({ h }) => h.stale && h.frozen_at)
  if (!stale.length) return null
  // Oldest frozen source wins: the chip is a floor on how current the page is.
  const worst = stale.reduce((a, b) => (a.h.frozen_at! < b.h.frozen_at! ? a : b))
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
      style={{ borderColor: COLORS.warn + '55', background: COLORS.warn + '12', color: COLORS.warn }}
      title={stale.map(({ h }) => `${h.tab}: ${h.message || ''}`).join('\n')}
    >
      CRM на {dateFull(worst.h.frozen_at!.slice(0, 10))}
    </span>
  )
}
