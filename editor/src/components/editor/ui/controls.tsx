// Small shared editor controls. They only compose the design-token classes from src/index.css
// (.ed-field, .ed-input, .ed-seg, ...), so every panel gets the same heights, paddings and label column.

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ── Field row ───────────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: React.ReactNode
  /** Tooltip with a longer explanation. */
  hint?: string
  /** Put the label above the control instead of in the 88px label column. */
  stack?: boolean
  htmlFor?: string
  className?: string
  children: React.ReactNode
}

/** `label | control` row on the shared 88px label column. */
export function Field({ label, hint, stack, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('ed-field', className)} data-stack={stack ? 'true' : undefined}>
      <label className="ed-label" htmlFor={htmlFor} title={hint}>
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
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
    <div className={cn('ed-input-wrap w-full', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        className="ed-input"
        data-align={align}
        data-unit={unit ? 'true' : undefined}
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
