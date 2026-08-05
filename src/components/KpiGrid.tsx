import type { Dataset, Metrics } from '../types'
import { aggregate, stageFunnel, type DateBasis, type Filters, type Index } from '../lib/data'
import { int, money, moneySmart, pct } from '../lib/format'
import { Card, InfoDot } from './ui'
import { COLORS, QUAL_HINT, STAGE_HINT, stageColor, stageLabel } from '../config'

function Progress({ value, target, color }: { value: number; target: number; color: string }) {
  const p = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-card2 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

function Hero({
  label,
  value,
  accent,
  hint,
  children,
}: {
  label: string
  value: string
  accent: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <Card className="p-4 relative overflow-hidden">
      <div
        className="absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl opacity-20"
        style={{ background: accent }}
      />
      <div className="text-xs font-medium text-mute uppercase tracking-wide flex items-center gap-1.5">
        {label}
        {hint && <InfoDot text={hint} />}
      </div>
      <div className="mt-1.5 font-display text-3xl font-bold text-ink tabular">{value}</div>
      {children}
    </Card>
  )
}

function Stat({
  label,
  value,
  accent = COLORS.mute,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <Card className="p-3.5">
      <div className="text-[11px] font-medium text-mute uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular" style={{ color: accent }}>
        {value}
      </div>
    </Card>
  )
}

/** One deep funnel stage: how many got there, and what each one cost. */
function StageTile({
  label,
  n,
  cost,
  color,
}: {
  label: string
  n: number
  cost: number | null
  color: string
}) {
  return (
    <Card className="p-3.5">
      <div className="text-[11px] font-medium text-mute uppercase tracking-wide truncate" title={label}>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-xl font-semibold tabular" style={{ color }}>
          {int(n)}
        </span>
        <span className="text-xs text-dim tabular">{cost === null ? '—' : moneySmart(cost)}</span>
      </div>
    </Card>
  )
}

export default function KpiGrid({
  ds,
  metrics,
  idx,
  filters,
  basis,
}: {
  ds: Dataset
  metrics: Metrics
  idx: Index
  filters: Filters
  basis: DateBasis
}) {
  const m = metrics
  // Stages below the qual, and only those with something in them: an empty tile
  // row for 08…13 would read as "we measure this and it is zero", when the truth
  // is that no deal has got that far yet.
  const funnel = stageFunnel(ds, idx, filters, basis, m.spend, stageLabel)
  const deep = funnel.filter((r) => r.depth > 0 && r.n > 0)
  // Plan progress = month-to-date of the latest data month (all languages).
  const monthPrefix = ds.date_max.slice(0, 7)
  const month = aggregate(
    ds.daily.filter((r) => r.date.startsWith(monthPrefix)),
    ds.crm ? ds.crm.daily.filter((r) => r.date.startsWith(monthPrefix)) : null,
  )
  const hasCrm = m.qual_leads !== null
  const cplOk = m.cpl <= ds.plan.cpl
  const cpqlOk = (m.cpql ?? 0) <= ds.plan.cpql

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Hero label="Расход" value={money(m.spend)} accent={COLORS.spend}>
          <div className="mt-3 text-[11px] text-dim">
            план месяца {money(ds.plan.budget)} · {pct((month.spend / ds.plan.budget) * 100, 1)}
          </div>
          <Progress value={month.spend} target={ds.plan.budget} color={COLORS.spend} />
        </Hero>

        <Hero label="Лиды" value={int(m.leads)} accent={COLORS.leads}>
          <div className="mt-3 text-[11px] text-dim">
            план месяца {int(ds.plan.leads)} · {pct((month.leads / ds.plan.leads) * 100, 1)}
          </div>
          <Progress value={month.leads} target={ds.plan.leads} color={COLORS.leads} />
        </Hero>

        <Hero label="Цена лида (CPL)" value={moneySmart(m.cpl)} accent={COLORS.cpl}>
          <div className="mt-3 text-[11px] text-dim">
            цель ≤ {money(ds.plan.cpl)} ·{' '}
            <span style={{ color: cplOk ? COLORS.pos : COLORS.neg }}>
              {cplOk ? 'в цели' : 'выше цели'}
            </span>
          </div>
          <Progress
            value={ds.plan.cpl}
            target={Math.max(m.cpl, ds.plan.cpl)}
            color={cplOk ? COLORS.pos : COLORS.neg}
          />
        </Hero>

        <Hero
          label="Квал-лиды"
          value={hasCrm ? int(m.qual_leads!) : '—'}
          accent={COLORS.qual}
          hint={QUAL_HINT}
        >
          <div className="mt-3 text-[11px] text-dim">
            план месяца {int(ds.plan.qual)} ·{' '}
            {pct(((month.qual_leads || 0) / ds.plan.qual) * 100, 1)}
          </div>
          <Progress value={month.qual_leads || 0} target={ds.plan.qual} color={COLORS.qual} />
        </Hero>

        <Hero
          label="Цена квал-лида"
          value={m.qual_leads ? moneySmart(m.cpql!) : '—'}
          accent={cpqlOk ? COLORS.pos : COLORS.neg}
          hint={QUAL_HINT}
        >
          <div className="mt-3 text-[11px] text-dim">
            цель ≤ {money(ds.plan.cpql)} ·{' '}
            {m.qual_leads ? (
              <span style={{ color: cpqlOk ? COLORS.pos : COLORS.neg }}>
                {cpqlOk ? 'в цели' : 'выше цели'}
              </span>
            ) : (
              <span>нет квалов за период</span>
            )}
          </div>
          <Progress
            value={ds.plan.cpql}
            target={Math.max(m.cpql || 0, ds.plan.cpql)}
            color={cpqlOk ? COLORS.pos : COLORS.neg}
          />
        </Hero>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Показы" value={int(m.impressions)} accent={COLORS.ink} />
        <Stat label="Клики" value={int(m.clicks)} accent={COLORS.ink} />
        <Stat label="CTR" value={pct(m.ctr)} accent={COLORS.ctr} />
        <Stat label="CPM" value={moneySmart(m.cpm)} accent={COLORS.ink} />
        <Stat label="CPC" value={moneySmart(m.cpc)} accent={COLORS.ink} />
        <Stat
          label="% квалификации"
          value={hasCrm ? pct(m.qual_rate!, 1) : '—'}
          accent={COLORS.qual}
        />
      </div>

      {deep.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-dim">
            Глубже квала · количество и цена
            <InfoDot text={STAGE_HINT} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {deep.map((r) => (
              <StageTile
                key={r.stage}
                label={r.label}
                n={r.n}
                cost={r.cost}
                color={stageColor(r.depth, funnel.length)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
