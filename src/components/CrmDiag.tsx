import { useState } from 'react'
import type { Dataset } from '../types'
import { int } from '../lib/format'
import { COLORS } from '../config'

/**
 * Data-quality strip for the CRM join. Always reports the whole window (not the
 * selected period) — it answers "can I trust these numbers?", not "how did last
 * week go?". Unmatched rows are shown with their reasons rather than dropped
 * silently, so a broken UTM never looks like a bad week.
 */
export default function CrmDiag({ ds }: { ds: Dataset }) {
  const [open, setOpen] = useState(false)
  if (!ds.crm) return null
  const c = ds.crm
  const metaLeads = ds.daily.reduce((s, r) => s + r.leads, 0)
  const rate = metaLeads ? (c.rows_matched / metaLeads) * 100 : 0
  const u = c.unmatched
  const skipped = u.macro + u.unknown_campaign + u.unknown_ad + u.no_utm

  const reasons: { label: string; n: number; note: string }[] = [
    {
      label: 'кампания вне периода дашборда',
      n: u.unknown_campaign,
      note: 'лиды со старых флайтов — их расход в окно не входит, поэтому в CPQL они не считаются',
    },
    {
      label: 'UTM не подставился',
      n: u.macro,
      note: 'в CRM пришло буквально {{campaign.name}} — Meta не раскрыла макрос',
    },
    {
      label: 'объявления уже нет в кабинете',
      n: u.unknown_ad,
      note: 'лид засчитан кампании, но в галерее креативов не показан',
    },
    { label: 'без UTM', n: u.no_utm, note: 'заявка пришла не из рекламы' },
  ].filter((r) => r.n > 0)

  const tone = rate >= 80 ? COLORS.pos : rate >= 50 ? COLORS.warn : COLORS.neg

  return (
    <div className="bento px-4 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
          <span className="text-mute">
            CRM сопоставлена с рекламой:{' '}
            <span className="text-ink tabular font-medium">
              {int(c.rows_matched)} из {int(metaLeads)}
            </span>{' '}
            лидов Meta <span className="tabular">({Math.round(rate)}%)</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-dim">
          {skipped > 0 && `${int(skipped)} не сопоставлено`}
          <span className="ml-2 inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
            ▸
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-3 border-t border-line2 pt-3 space-y-2 text-xs">
          {reasons.map((r) => (
            <div key={r.label} className="flex items-start gap-3">
              <span className="w-8 shrink-0 text-right tabular font-medium text-ink">{int(r.n)}</span>
              <span className="text-mute">
                {r.label} — <span className="text-dim">{r.note}</span>
              </span>
            </div>
          ))}
          <p className="text-dim pt-1">
            Разрыв в {int(Math.max(0, metaLeads - c.rows_matched))} лид(ов) — это в основном кампании,
            которые ведут в другую воронку и в эту выгрузку CRM не попадают. Строк во вкладке{' '}
            <span className="text-mute">{c.tab}</span>: {int(c.rows_total)}, из них в периоде{' '}
            {int(c.rows_in_window)}.
          </p>
        </div>
      )}
    </div>
  )
}
