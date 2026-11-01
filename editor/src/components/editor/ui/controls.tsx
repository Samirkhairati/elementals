// Small shared editor controls. They only compose the design-token classes from src/index.css
// (.ed-field, .ed-input, .ed-seg, ...), so every panel gets the same heights, paddings and label column.

import { Slider } from './fields'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, Maximize, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Field row ───────────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: React.ReactNode
  /** Tooltip with a longer explanation. */
  hint?: string
  /** Longer explanation shown in an info popover next to the label (click the "i"). */
  info?: React.ReactNode
  /** Put the label above the control instead of in the 88px label column. */
  stack?: boolean
  htmlFor?: string
  className?: string
  children: React.ReactNode
}

/** `label | control` row on the shared 88px label column. */
export function Field({ label, hint, info, stack, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('ed-field', className)} data-stack={stack ? 'true' : undefined}>
      <div className="flex min-w-0 items-center gap-1">
        <label className="ed-label" htmlFor={htmlFor} title={hint}>
          {label}
        </label>
        {info ? <InfoTip>{info}</InfoTip> : null}
      </div>
      {/* Controls sit on the right edge so switches, segmented controls and inputs line up. */}
      <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
    </div>
  )
}

// ── Info popover ────────────────────────────────────────────────────────────────────────────────

/**
 * A small "i" that opens an explanation on click (closes on outside click, Escape or scroll). Keeps long help
 * text out of the layout: put it next to the label or title it explains.
 */
export function InfoTip({ children, label = 'More info', className }: { children: React.ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const width = 260
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2))
    setPos({ left, top: r.bottom + 6 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!bubble.current?.contains(t) && !button.current?.contains(t)) close()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        data-active={open ? 'true' : undefined}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground data-[active=true]:text-primary', className)}
      >
        <Info className="h-3 w-3" />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={bubble}
              role="tooltip"
              style={{ position: 'fixed', left: pos.left, top: pos.top, width: 260 }}
              className="z-[200] rounded-md border border-border bg-popover p-2 text-ed-label leading-4 text-popover-foreground shadow-lg"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

// ── Zoom controls ───────────────────────────────────────────────────────────────────────────────

interface ZoomControlsProps {
  /** Current zoom factor (1 = 100%). */
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  /** Back to the fitted view. */
  onFit: () => void
  /** True while the view already is the fitted one. */
  fitted?: boolean
  className?: string
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onFit, fitted, className }: ZoomControlsProps) {
  return (
    <div className={cn('flex items-center gap-0.5 rounded-md border border-border bg-background/80 p-0.5 backdrop-blur', className)} data-testid="zoom-controls" onMouseDown={(e) => e.stopPropagation()}>
      <IconButton title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}>
        <Minus />
      </IconButton>
      <span className="ed-mono w-11 text-center text-ed-label text-muted-foreground" data-testid="zoom-readout">
        {Math.round(zoom * 100)}%
      </span>
      <IconButton title="Zoom in" aria-label="Zoom in" onClick={onZoomIn}>
        <Plus />
      </IconButton>
      <IconButton title="Reset the view to fit" aria-label="Fit view" active={fitted} onClick={onFit}>
        <Maximize />
      </IconButton>
    </div>
  )
}

/** Section heading with an optional info popover. */
export function SectionTitle({ children, info, actions }: { children: React.ReactNode; info?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex h-row items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <span className="ed-section-title">{children}</span>
        {info ? <InfoTip>{info}</InfoTip> : null}
      </div>
      {actions}
    </div>
  )
}

/** A read-only value in a label column row (derived values such as the pixel anchor). */
export function ReadoutField({ label, info, testId = 'readout-value', children }: { label: React.ReactNode; info?: React.ReactNode; testId?: string; children: React.ReactNode }) {
  return (
    <Field label={label} info={info}>
      <span className="ed-mono truncate text-right text-ed-body text-muted-foreground" data-testid={testId}>
        {children}
      </span>
    </Field>
  )
}

// ── Number field ────────────────────────────────────────────────────────────────────────────────

interface NumberFieldProps {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Round to whole numbers (default true when step >= 1). */
  integer?: boolean
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string
  align?: 'left' | 'right'
  /** Compact widths (spec §8.8): xs 56px for 1-2 digit integers, sm 72px for numbers with units. Default fills the row. */
  size?: 'xs' | 'sm'
}

/** Right padding that leaves room for a unit label drawn at 10px (about 6.5px per character) plus gaps. */
function unitPadding(unit: string): number {
  return Math.ceil(unit.length * 6.5) + 16
}

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return ''
  return String(Math.round(v * 1000) / 1000)
}

/**
 * Numeric input that keeps a text draft while typing and commits ONCE on Enter / blur / arrow keys
 * (ArrowUp/Down add the step, Shift = x10), so typing "128" is not three undo steps.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  unit,
  integer,
  disabled,
  id,
  className,
  align = 'right',
  size,
  ...rest
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const whole = integer ?? step >= 1

  const clamp = (n: number) => {
    let v = whole ? Math.round(n) : Math.round(n * 1000) / 1000
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    return v
  }

  const commit = (text: string) => {
    setDraft(null)
    if (text.trim() === '') return
    const n = Number(text)
    if (!Number.isFinite(n)) return
    const next = clamp(n)
    if (next !== value) onCommit(next)
  }

  return (
    <div className={cn('ed-input-wrap', size === 'xs' ? 'w-14' : size === 'sm' ? 'w-[72px]' : 'w-full', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        className="ed-input"
        data-align={align}
        data-unit={unit ? 'true' : undefined}
        // Keep the number clear of the unit label whatever its length ("px" vs "tiles").
        style={unit ? { paddingRight: unitPadding(unit) } : undefined}
        disabled={disabled}
        aria-label={rest['aria-label']}
        value={draft ?? formatNumber(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (draft !== null) commit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value)
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const base = draft !== null && Number.isFinite(Number(draft)) ? Number(draft) : value
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const next = clamp(base + delta)
            setDraft(null)
            if (next !== value) onCommit(next)
          }
        }}
      />
      {unit ? <span className="ed-input-unit">{unit}</span> : null}
    </div>
  )
}

// ── Text field ──────────────────────────────────────────────────────────────────────────────────

interface TextFieldProps {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  id?: string
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

/** Text input that commits on Enter / blur (one history step per edit, not per keystroke). */
export function TextField({ value, onCommit, placeholder, id, disabled, className, ...rest }: TextFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    setDraft(null)
    if (text !== value) onCommit(text)
  }
  return (
    <input
      id={id}
      type="text"
      className={cn('ed-input', className)}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={rest['aria-label']}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (draft !== null) commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit(e.currentTarget.value)
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

// ── Segmented control ───────────────────────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T
  label?: React.ReactNode
  icon?: React.ReactNode
  title?: string
  /** Accessible name when the visible label is only a symbol (arrows ...). */
  ariaLabel?: string
  tone?: 'solid' | 'trigger'
}

interface SegmentedProps<T extends string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  'aria-label'?: string
  className?: string
}

export function Segmented<T extends string>({ value, options, onChange, className, ...rest }: SegmentedProps<T>) {
  return (
    <div className={cn('ed-seg', className)} role="radiogroup" aria-label={rest['aria-label']}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.ariaLabel ?? (typeof o.label === 'string' ? undefined : o.title)}
          title={o.title}
          data-active={o.value === value ? 'true' : undefined}
          data-tone={o.tone}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Switch ──────────────────────────────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export function Toggle({ checked, onChange, disabled, id, ...rest }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      className="ed-switch"
      onClick={() => onChange(!checked)}
    />
  )
}

// ── Buttons ─────────────────────────────────────────────────────────────────────────────────────

interface EdButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'dashed'
  size?: 'default' | 'sm'
}

export const EdButton = React.forwardRef<HTMLButtonElement, EdButtonProps>(function EdButton(
  { variant = 'default', size = 'default', className, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn('ed-btn', className)} data-variant={variant} data-size={size} {...props} />
})

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  tone?: 'danger'
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { active, tone, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('ed-iconbtn', className)}
      data-active={active ? 'true' : undefined}
      data-tone={tone}
      {...props}
    />
  )
})

// ── Misc ────────────────────────────────────────────────────────────────────────────────────────

export function Badge({
  tone,
  children,
  title,
  className,
}: {
  tone?: 'solid' | 'trigger' | 'event' | 'move' | 'warn'
  children: React.ReactNode
  title?: string
  className?: string
}) {
  return (
    <span className={cn('ed-badge', className)} data-tone={tone} title={title}>
      {children}
    </span>
  )
}

/** Animation clock in ms: advances every frame while `running`, holds its value while paused. */
export function useAnimationClock(running: boolean): number {
  const [tick, setTick] = useState(0)
  const tickRef = useRef(0)
  useEffect(() => {
    if (!running || typeof requestAnimationFrame === 'undefined') return
    let raf = 0
    let t0: number | null = null
    const base = tickRef.current
    const loop = (t: number) => {
      if (t0 === null) t0 = t
      tickRef.current = base + (t - t0)
      setTick(tickRef.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running])
  return tick
}

// ── Compact layout helpers (spec §8.8) ──────────────────────────────────────────────────────────

/** Related values on one line: `W [32] × H [48]`. */
export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>{children}</div>
}

/** A slider and its number together (fps, speed, scale). */
export function SliderNumber({ value, onCommit, min, max, step = 1, unit, label }: { value: number; onCommit: (v: number) => void; min: number; max: number; step?: number; unit?: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Slider aria-label={`${label} slider`} min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={onCommit} />
      <NumberField aria-label={label} size="sm" value={value} min={min} step={step} unit={unit} onCommit={onCommit} />
    </div>
  )
}

/** Collapsible section that shows a one-line summary while closed. */
export function Section({ title, summary, info, defaultOpen = true, children }: { title: React.ReactNode; summary?: React.ReactNode; info?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded border border-border">
      <div className="flex items-center gap-2 px-2 py-1">
        <button type="button" aria-expanded={open} className="flex flex-1 items-center gap-2 text-left text-ed-label" onClick={() => setOpen(!open)}>
          <span className="font-medium">{title}</span>
          {!open && summary ? <span className="ed-hint truncate">{summary}</span> : null}
        </button>
        {info ? <InfoTip>{info}</InfoTip> : null}
      </div>
      {open ? <div className="flex flex-col gap-2 border-t border-border p-2">{children}</div> : null}
    </section>
  )
}
