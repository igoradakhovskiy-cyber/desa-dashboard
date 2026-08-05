import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

interface Anchor {
  cx: number
  top: number
  bottom: number
}

/**
 * The explanation itself, portalled to <body> and positioned fixed.
 *
 * Both details are load-bearing: the dots live inside cards and table rows with
 * their own stacking and `overflow-hidden`, so an in-flow tooltip gets clipped by
 * whichever bar or card it happens to sit in. Measured after mount, then flipped
 * below the dot and clamped to the viewport, so a long hint near the top or the
 * right edge stays fully readable.
 */
function Bubble({ text, anchor }: { text: string; anchor: Anchor }) {
  const ref = useRef<HTMLDivElement>(null)
  // Rendered off-screen for one frame so the measurement never flashes.
  const [style, setStyle] = useState<CSSProperties>({ left: -9999, top: 0, opacity: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const pad = 8
    const half = el.offsetWidth / 2
    const above = anchor.top - el.offsetHeight - 10 >= pad
    setStyle({
      left: Math.min(Math.max(anchor.cx, pad + half), window.innerWidth - pad - half),
      top: above ? anchor.top - 8 : anchor.bottom + 8,
      transform: `translate(-50%, ${above ? '-100%' : '0'})`,
      opacity: 1,
    })
  }, [anchor, text])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-50 w-max max-w-[min(24rem,calc(100vw-1rem))]
                 whitespace-pre-line rounded-lg border border-line bg-card2 px-3 py-2
                 text-xs leading-relaxed text-mute shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]"
    >
      {text}
    </div>,
    document.body,
  )
}

/**
 * Small "?" affordance that explains a number on hover, focus or tap.
 *
 * Was a native `title`, which in practice showed nothing: the browser delay is
 * long enough that nobody waits on a 14px target, and it never appeared at all on
 * touch. These hints carry the methodology — what counts as a qual, which date a
 * stage is filed under — so an invisible tooltip meant the numbers were being
 * read without their definition.
 */
export function InfoDot({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  const open = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom })
  }
  const close = () => setAnchor(null)

  // The bubble is anchored to where the dot was when it opened, so any scroll
  // would leave it floating over unrelated content. Cheaper to dismiss it.
  useEffect(() => {
    if (!anchor) return
    const hide = () => setAnchor(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [anchor])

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={text}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
        onClick={(e) => {
          // Touch has no hover: tap toggles. stopPropagation because some dots sit
          // inside rows that expand on click.
          e.stopPropagation()
          e.preventDefault()
          anchor ? close() : open()
        }}
        className="inline-grid h-3.5 w-3.5 place-items-center rounded-full border border-line
                   text-[9px] font-bold text-dim cursor-help select-none align-middle
                   transition-colors hover:border-mute hover:text-mute focus:outline-none
                   focus-visible:border-mute focus-visible:text-mute"
      >
        ?
      </span>
      {anchor && <Bubble text={text} anchor={anchor} />}
    </>
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
