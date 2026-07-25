import type { Metrics } from '../types'
import { Card, SectionTitle, InfoDot } from './ui'
import { int, pct } from '../lib/format'
import { COLORS, QUAL_HINT } from '../config'

export default function Funnel({ metrics }: { metrics: Metrics }) {
  const m = metrics
  const hasCrm = m.qual_leads !== null
  const stages = [
    { label: 'Показы', value: m.impressions, color: COLORS.impressions, hint: undefined },
    { label: 'Клики', value: m.clicks, color: COLORS.ctr, hint: undefined },
    { label: 'Лиды', value: m.leads, color: COLORS.leads, hint: undefined },
    ...(hasCrm
      ? [{ label: 'Квал-лиды', value: m.qual_leads!, color: COLORS.qual, hint: QUAL_HINT }]
      : []),
  ]
  const max = m.impressions || 1
  const convs = [
    { label: 'CTR', value: m.impressions ? (m.clicks / m.impressions) * 100 : 0 },
    { label: 'Клик → лид', value: m.clicks ? (m.leads / m.clicks) * 100 : 0 },
    // measured against CRM leads, not Meta leads — that's the base the CRM actually saw
    { label: 'Лид → квал', value: m.qual_rate || 0 },
  ]

  return (
    <Card className="p-5">
      <SectionTitle title="Воронка" subtitle="Показы → Клики → Лиды → Квал-лиды" />
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          // log-ish scale so clicks/leads stay visible next to huge impressions
          const w = Math.max(6, (Math.log10(s.value + 1) / Math.log10(max + 1)) * 100)
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-mute flex items-center gap-1.5">
                  {s.label}
                  {s.hint && <InfoDot text={s.hint} />}
                </span>
                <span className="text-ink tabular font-semibold">{int(s.value)}</span>
              </div>
              <div className="h-8 w-full rounded-lg bg-card2 overflow-hidden">
                <div
                  className="h-full rounded-lg flex items-center px-2"
                  style={{
                    width: `${w}%`,
                    background: `linear-gradient(90deg, ${s.color}cc, ${s.color}77)`,
                  }}
                />
              </div>
              {i < stages.length - 1 && (
                <div className="flex justify-center my-1">
                  <span className="text-[11px] text-dim">
                    ↓ {convs[i].label} <span className="text-mute tabular">{pct(convs[i].value)}</span>
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
