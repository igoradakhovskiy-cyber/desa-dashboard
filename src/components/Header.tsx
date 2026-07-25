import type { Dataset, Lang } from '../types'
import { LANGS } from '../types'
import type { Filters, Preset } from '../lib/data'
import { Segmented } from './ui'
import { dateFull } from '../lib/format'
import { LANG_LABEL } from '../config'

export default function Header({
  ds,
  filters,
  setFilters,
  presets,
}: {
  ds: Dataset
  filters: Filters
  setFilters: (f: Filters) => void
  presets: Preset[]
}) {
  const wholePeriod = filters.from === ds.date_min && filters.to === ds.date_max
  const periodLabel = wholePeriod
    ? `весь период · ${dateFull(ds.date_min)} – ${dateFull(ds.date_max)}`
    : `${dateFull(filters.from)} – ${dateFull(filters.to)}`

  const activePreset = presets.find((p) => p.from === filters.from && p.to === filters.to)?.key
  // only offer streams this account actually runs
  const present = new Set(ds.campaigns.map((c) => c.lang))
  const langOptions = LANGS.filter((l) => present.has(l)).map((l: Lang) => ({
    value: l,
    label: LANG_LABEL[l],
  }))
  const freshness = new Date(ds.generated_at).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <header>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-7 w-1.5 rounded-full bg-gradient-to-b from-[#4a92e0] to-[#d8b878]" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {ds.project}
            </h1>
          </div>
          <p className="text-sm text-mute mt-1.5 ml-4">
            Facebook / Instagram · <span className="text-mute">{periodLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-card border border-line px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#46c08a] animate-pulse" />
          <span className="text-xs text-mute">данные на {freshness}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* date presets */}
        <div className="inline-flex items-center gap-1 rounded-lg bg-card2 p-0.5 border border-line">
          {presets.map((p) => {
            const active = activePreset === p.key
            return (
              <button
                key={p.key}
                onClick={() => setFilters({ ...filters, from: p.from, to: p.to })}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-[#2a3448] text-ink' : 'text-mute hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* custom range */}
        <div className="inline-flex items-center gap-1.5 text-xs text-mute">
          <input
            type="date"
            value={filters.from}
            min={ds.date_min}
            max={filters.to}
            onChange={(e) => setFilters({ ...filters, from: e.target.value || ds.date_min })}
            className="rounded-md bg-card2 border border-line px-2 py-1 text-ink [color-scheme:dark]"
          />
          <span>–</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            max={ds.date_max}
            onChange={(e) => setFilters({ ...filters, to: e.target.value || ds.date_max })}
            className="rounded-md bg-card2 border border-line px-2 py-1 text-ink [color-scheme:dark]"
          />
        </div>

        <div className="ml-auto">
          <Segmented
            value={filters.lang}
            onChange={(v) => setFilters({ ...filters, lang: v })}
            options={[{ value: 'all' as const, label: LANG_LABEL.all }, ...langOptions]}
          />
        </div>
      </div>
    </header>
  )
}
