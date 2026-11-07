import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Sheet({
  open,
  title,
  eyebrow,
  onClose,
  children,
  footer,
  size = 'medium',
}: {
  open: boolean
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'medium' | 'tall'
}) {
  const [dragY, setDragY] = useState(0)
  const drag = useRef<{ id: number; startY: number } | null>(null)

  useEffect(() => {
    if (!open) setDragY(0)
  }, [open])

  if (!open) return null

  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { id: event.pointerId, startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== event.pointerId) return
    setDragY(Math.max(0, event.clientY - drag.current.startY))
  }
  const onPointerUp = (event: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== event.pointerId) return
    const distance = event.clientY - drag.current.startY
    drag.current = null
    if (distance > 90) onClose()
    else setDragY(0)
  }

  return (
    <div className="m-sheet-layer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div
        className={`m-sheet m-sheet-${size}`}
        style={dragY ? ({ transform: `translateY(${dragY}px)`, transition: 'none' } as CSSProperties) : undefined}
      >
        <div
          className="m-sheet-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <i />
        </div>
        <header className="m-sheet-head">
          <div>
            {eyebrow && <span className="m-eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="m-icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className="m-sheet-body">{children}</div>
        {footer && <footer className="m-sheet-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  color,
  center,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  color?: string
  /** Fill from the centre instead of the left edge (pan, tone). */
  center?: boolean
}) {
  const span = max - min
  const pct = ((value - min) / span) * 100
  const from = center ? Math.min(50, pct) : 0
  const to = center ? Math.max(50, pct) : pct
  return (
    <label className="m-slider" style={{ '--fill-from': `${from}%`, '--fill-to': `${to}%`, '--slider-color': color ?? 'var(--accent)' } as CSSProperties}>
      <span className="m-slider-head">
        <span>{label}</span>
        <b>{format ? format(value) : value.toFixed(2)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="m-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          className={option.value === value ? 'is-on' : ''}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  label,
  value,
  onDec,
  onInc,
  disableDec,
  disableInc,
}: {
  label: string
  value: ReactNode
  onDec: () => void
  onInc: () => void
  disableDec?: boolean
  disableInc?: boolean
}) {
  return (
    <div className="m-stepper">
      <span>{label}</span>
      <div>
        <button onClick={onDec} disabled={disableDec} aria-label={`${label} down`}>−</button>
        <b>{value}</b>
        <button onClick={onInc} disabled={disableInc} aria-label={`${label} up`}>+</button>
      </div>
    </div>
  )
}

/** Wraps window-level pointer tracking for a drag that starts on an element. */
export const useRaf = (callback: (time: number) => void, active = true) => {
  const saved = useRef(callback)
  saved.current = callback
  useEffect(() => {
    if (!active) return
    let frame = 0
    const loop = (time: number) => {
      saved.current(time)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active])
}
