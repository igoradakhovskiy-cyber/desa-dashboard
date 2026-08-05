import { useEffect, useState } from 'react'
import type { CreativeGroup, Metrics } from '../types'
import type { Index, StageRow } from '../lib/data'
import { assetUrl, COLORS, QUAL_HINT, STAGE_HINT } from '../config'
import { int, money, moneySmart, pct } from '../lib/format'
import { InfoDot, LangBadge, PendingBadge } from './ui'
import StageLadder from './StageLadder'

export default function CreativeModal({
  group,
  m,
  stages,
  idx,
  onClose,
}: {
  group: CreativeGroup
  m: Metrics
  stages: StageRow[]
  idx: Index
  onClose: () => void
}) {
  const [showPreview, setShowPreview] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const campaigns = group.campaign_ids
    .map((id) => idx.campById.get(id)?.name)
    .filter(Boolean) as string[]

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bento w-full max-w-3xl max-h-[92vh] overflow-y-auto p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row">
          {/* media */}
          <div className="relative sm:w-[300px] shrink-0 bg-black">
            <div className="relative aspect-[9/16] w-full">
              {group.poster && (
                <img
                  src={assetUrl(group.poster)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {showPreview && group.preview_url && (
                <iframe
                  title={group.key}
                  src={group.preview_url}
                  className="absolute inset-0 h-full w-full border-0"
                  scrolling="no"
                  onError={() => setShowPreview(false)}
                />
              )}
            </div>
          </div>

          {/* details */}
          <div className="flex-1 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold text-ink">{group.key}</h3>
                  <LangBadge lang={group.lang} />
                </div>
                <p className="text-xs text-dim mt-0.5">
                  {group.ad_ids.length} объяв. · {campaigns.length} камп.
                </p>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg bg-card2 border border-line text-mute hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <Stat label="Расход" value={money(m.spend)} />
              <Stat label="Лиды" value={int(m.leads)} color={COLORS.leads} />
              <Stat label="CPL" value={moneySmart(m.cpl)} color={COLORS.gold} />
              <Stat label="Показы" value={int(m.impressions)} />
              <Stat label="Клики" value={int(m.clicks)} />
              <Stat label="CTR" value={pct(m.ctr)} color={COLORS.ctr} />
              {m.qual_leads !== null ? (
                <>
                  <Stat label="Квал-лиды" value={int(m.qual_leads)} color={COLORS.qual} />
                  <Stat
                    label="Цена квала"
                    value={m.qual_leads ? moneySmart(m.cpql!) : '—'}
                    color={COLORS.gold}
                  />
                  <Stat label="% квала" value={pct(m.qual_rate || 0, 1)} color={COLORS.qual} />
                </>
              ) : (
                <>
                  <Stat label="CPM" value={moneySmart(m.cpm)} />
                  <Stat label="CPC" value={moneySmart(m.cpc)} />
                  <Stat label="Квал-лиды" value="—" pending />
                </>
              )}
            </div>
            {m.qual_leads !== null && (
              <p className="mt-2 text-[11px] text-dim">
                {QUAL_HINT} Лидов в CRM за период: {int(m.crm_leads || 0)} (в Meta {int(m.leads)}).
              </p>
            )}

            {stages.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-dim">
                  Воронка этого креатива
                  <InfoDot text={STAGE_HINT} />
                </div>
                <StageLadder rows={stages} compact />
              </div>
            )}

            {campaigns.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wide text-dim mb-1.5">Кампании</div>
                <div className="flex flex-wrap gap-1.5">
                  {campaigns.map((c) => (
                    <span
                      key={c}
                      className="rounded-md bg-card2 border border-line px-2 py-0.5 text-[11px] text-mute"
                      title={c}
                    >
                      {c.length > 34 ? c.slice(0, 34) + '…' : c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              {group.permalink && (
                <a
                  href={group.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-card2 border border-line px-3 py-1.5 text-xs text-ink hover:border-[#33405a]"
                >
                  Открыть в Instagram ↗
                </a>
              )}
              {!group.preview_url && (
                <span className="text-xs text-dim">Живое превью недоступно — показан постер</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  color = COLORS.ink,
  pending = false,
}: {
  label: string
  value: string
  color?: string
  pending?: boolean
}) {
  return (
    <div className="rounded-lg bg-card2/60 border border-line2 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-dim">{label}</span>
        {pending && <PendingBadge />}
      </div>
      <div className="mt-0.5 tabular font-semibold text-sm" style={{ color: pending ? COLORS.dim : color }}>
        {value}
      </div>
    </div>
  )
}
