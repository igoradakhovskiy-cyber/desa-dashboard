import type { CreativeGroup, Metrics } from '../types'
import type { StageRow } from '../lib/data'
import { assetUrl, COLORS, stageColor } from '../config'
import { int, money, moneySmart, pct } from '../lib/format'
import { LangBadge } from './ui'

export default function CreativeCard({
  group,
  m,
  stages = [],
  top,
  onClick,
}: {
  group: CreativeGroup
  m: Metrics
  stages?: StageRow[]
  top?: boolean
  onClick: () => void
}) {
  // The deepest stage this creative actually reached. One badge, not a ladder:
  // the card has room for the headline, and the full funnel is one click away.
  const deepest = [...stages].reverse().find((s) => s.depth > 0 && s.n > 0)

  return (
    <button
      onClick={onClick}
      className="group relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-line bento-hover text-left"
    >
      {group.poster ? (
        <img
          src={assetUrl(group.poster)}
          alt={group.key}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-card2 text-dim text-xs">
          нет постера
        </div>
      )}

      {/* gradient for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />

      {/* top row */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2.5">
        <LangBadge lang={group.lang} className="backdrop-blur bg-black/30" />
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/40 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="ml-0.5 border-y-[6px] border-y-transparent border-l-[10px] border-l-white/90" />
        </span>
      </div>
      {top && (
        <span
          className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ color: '#1a1206', background: COLORS.gold }}
        >
          ★ топ
        </span>
      )}

      {/* bottom metrics */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="truncate text-[13px] font-medium text-white/95" title={group.key}>
          {group.key}
        </div>
        <div className="mt-1.5 flex items-end gap-3">
          {m.qual_leads !== null ? (
            <>
              <Metric label="Квалы" value={int(m.qual_leads)} color={COLORS.qual} big />
              <Metric
                label="CPQL"
                value={m.qual_leads ? moneySmart(m.cpql!) : '—'}
                color={m.qual_leads ? COLORS.gold : '#8b93a5'}
              />
              <Metric label="Лиды" value={int(m.leads)} color="#cdd6e6" />
            </>
          ) : (
            <>
              <Metric label="Лиды" value={int(m.leads)} color={COLORS.leads} big />
              <Metric label="CPL" value={moneySmart(m.cpl)} color={COLORS.gold} />
              <Metric label="CTR" value={pct(m.ctr, 1)} color="#cdd6e6" />
            </>
          )}
        </div>
        <div className="mt-1 text-[11px] text-white/55 tabular">
          Расход {money(m.spend)}
          {m.qual_leads !== null && <> · CPL {moneySmart(m.cpl)}</>}
        </div>
        {deepest && (
          <div className="mt-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur"
              style={{
                color: stageColor(deepest.depth, stages.length),
                background: 'rgba(0,0,0,.42)',
              }}
              title={`${deepest.label} · ${deepest.stage}`}
            >
              {deepest.label} · {int(deepest.n)}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

function Metric({
  label,
  value,
  color,
  big = false,
}: {
  label: string
  value: string
  color: string
  big?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div
        className={`tabular font-semibold ${big ? 'font-display text-lg leading-none' : 'text-sm'}`}
        style={{ color }}
      >
        {value}
      </div>
    </div>
  )
}
