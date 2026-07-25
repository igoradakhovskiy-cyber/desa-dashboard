import type { ReactNode } from 'react'
import { COLORS, LANG_LABEL, langColor } from '../config'

export function Card({
  children,
  className = '',
  hoverable = false,
  onClick,
}: {
  children: ReactNode
  className?: string
  hoverable?: boolean
  onClick?: () => void
}) {
  return (
    <div
      className={`bento ${hoverable ? 'bento-hover cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-dim mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function LangBadge({ lang, className = '' }: { lang: string; className?: string }) {
  const c = langColor(lang)
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${className}`}
      style={{ color: c, background: c + '1f' }}
    >
      {LANG_LABEL[lang] || lang.toUpperCase()}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-card2 p-0.5 border border-line">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? 'bg-[#2a3448] text-ink shadow-sm' : 'text-mute hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Delta({ value, goodWhenLow = false }: { value: number; goodWhenLow?: boolean }) {
  if (!isFinite(value) || Math.abs(value) < 0.05) return <span className="text-dim text-xs">—</span>
  const positive = value > 0
  const good = goodWhenLow ? !positive : positive
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium tabular"
      style={{ color: good ? COLORS.pos : COLORS.neg }}
    >
      {positive ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%
    </span>
  )
}

/** Small "?" affordance carrying an explanation in the native tooltip. */
export function InfoDot({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-grid h-3.5 w-3.5 place-items-center rounded-full border border-line
                 text-[9px] font-bold text-dim cursor-help select-none align-middle"
    >
      ?
    </span>
  )
}

export function PendingBadge({ label = 'ждёт CRM' }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color: COLORS.warn, background: COLORS.warn + '1a' }}
    >
      {label}
    </span>
  )
}
