import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { DailyRow } from '../types'
import { dailySeries } from '../lib/data'
import { Card, SectionTitle } from './ui'
import { COLORS } from '../config'
import { compact, dateShort, int, money, moneySmart, pct } from '../lib/format'

function Tip({ active, payload, label, rows }: any) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-panel/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-ink mb-1">{dateShort(label)}</div>
      {rows.map((r: any) => (
        <div key={r.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-mute">
            <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="tabular text-ink">{r.fmt(p[r.key])}</span>
        </div>
      ))}
    </div>
  )
}

export default function TrendCharts({ rows }: { rows: DailyRow[] }) {
  const data = dailySeries(rows)

  const axis = { stroke: COLORS.dim, fontSize: 11 }
  const grid = <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />

  return (
    <section>
      <SectionTitle title="Динамика по дням" subtitle="Расход, лиды и эффективность за выбранный период" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* spend + leads */}
        <Card className="p-4 lg:col-span-2">
          <div className="text-sm text-mute mb-3">Расход и лиды</div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.spend} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.spend} stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              <XAxis dataKey="date" tickFormatter={dateShort} {...axis} tickLine={false} />
              <YAxis
                yAxisId="l"
                tickFormatter={(v) => '$' + compact(v)}
                {...axis}
                tickLine={false}
                width={48}
              />
              <YAxis yAxisId="r" orientation="right" tickFormatter={compact} {...axis} tickLine={false} width={32} />
              <Tooltip
                content={
                  <Tip
                    rows={[
                      { key: 'spend', label: 'Расход', color: COLORS.spend, fmt: money },
                      { key: 'leads', label: 'Лиды', color: COLORS.leads, fmt: int },
                    ]}
                  />
                }
              />
              <Area
                yAxisId="l"
                type="monotone"
                dataKey="spend"
                stroke={COLORS.spend}
                strokeWidth={2}
                fill="url(#gSpend)"
                isAnimationActive={false}
              />
              <Bar
                yAxisId="r"
                dataKey="leads"
                fill={COLORS.leads}
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* CPL */}
        <Card className="p-4">
          <div className="text-sm text-mute mb-3">Цена лида (CPL)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              {grid}
              <XAxis dataKey="date" tickFormatter={dateShort} {...axis} tickLine={false} />
              <YAxis tickFormatter={(v) => '$' + compact(v)} {...axis} tickLine={false} width={44} />
              <Tooltip
                content={<Tip rows={[{ key: 'cpl', label: 'CPL', color: COLORS.cpl, fmt: moneySmart }]} />}
              />
              <Line type="monotone" dataKey="cpl" stroke={COLORS.cpl} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* CTR */}
        <Card className="p-4">
          <div className="text-sm text-mute mb-3">CTR</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              {grid}
              <XAxis dataKey="date" tickFormatter={dateShort} {...axis} tickLine={false} />
              <YAxis tickFormatter={(v) => v.toFixed(1) + '%'} {...axis} tickLine={false} width={44} />
              <Tooltip
                content={<Tip rows={[{ key: 'ctr', label: 'CTR', color: COLORS.ctr, fmt: (v: number) => pct(v) }]} />}
              />
              <Line type="monotone" dataKey="ctr" stroke={COLORS.ctr} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </section>
  )
}
