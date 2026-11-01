// Small building blocks shared by the event editor: compact inputs that commit on blur (so typing does
// not create one undo step per keystroke), a portal-aware popover, field rows and icon buttons.

import { Checkbox } from '../ui/fields'
import { PortalContainerContext, PortalContainerProvider } from '../../ui/portal-container'
import React, { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export const inputClass =
  'h-7 w-full min-w-0 rounded border border-input bg-background/60 px-2 text-xs font-mono outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary disabled:opacity-50'

export const selectClass =
  'h-7 w-full min-w-0 rounded border border-input bg-background/60 px-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-primary disabled:opacity-50'

// ── popover ─────────────────────────────────────────────────────────────────────────────────────

export { PortalContainerProvider }

interface PopoverProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
  width?: number
  align?: 'start' | 'end'
  label: string
  className?: string
}

/**
 * A floating panel anchored to an element. It is rendered into the nearest PortalContainerProvider (the
 * event editor dialog, so it stays inside the dialog's focus scope) or the document body.
 */
export function Popover({ open, onClose, anchorRef, children, width = 280, align = 'start', label, className }: PopoverProps) {
  const containerCtx = useContext(PortalContainerContext)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  const container = containerCtx ?? (typeof document !== 'undefined' ? document.body : null)
  const isBody = container === (typeof document !== 'undefined' ? document.body : null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    if (!container) return
    const anchor = anchorRef.current
    if (!anchor) return
    const a = anchor.getBoundingClientRect()
    const c = isBody ? { left: 0, top: 0, bottom: window.innerHeight } : container.getBoundingClientRect()
    const vw = window.innerWidth
    // Room inside the container (the dialog clips what sticks out of it), not just inside the viewport.
    const below = c.bottom - a.bottom
    const above = a.top - c.top
    const useBelow = below >= 260 || below >= above
    const maxHeight = Math.max(160, Math.min(420, (useBelow ? below : above) - 12))
    let left = (align === 'end' ? a.right - width : a.left) - c.left
    left = Math.max(8 - c.left, Math.min(left, vw - width - 8 - c.left))
    setPos(
      useBelow
        ? { left, top: a.bottom - c.top + 4, maxHeight }
        : { left, bottom: c.bottom - a.top + 4, maxHeight },
    )
  }, [open, container, isBody, anchorRef, align, width])

  // Move focus into the panel once it is positioned (a hidden element cannot take focus).
  const positioned = pos !== null
  useEffect(() => {
    if (!open || !positioned) return
    const el = ref.current
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('input, [tabindex], button')?.focus()
  }, [open, positioned])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      anchorRef.current?.focus()
      onCloseRef.current()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchorRef])

  if (!open || !container) return null
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-ev-popover=""
      style={{
        position: isBody ? 'fixed' : 'absolute',
        width,
        left: pos?.left ?? 0,
        top: pos?.top,
        bottom: pos?.bottom,
        maxHeight: pos?.maxHeight,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={cn(
        'z-[70] flex flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg',
        className,
      )}
    >
      {children}
    </div>,
    container,
  )
}

// ── draft inputs ────────────────────────────────────────────────────────────────────────────────

/**
 * Keeps what the user is typing locally and commits on blur / Enter (and when unmounted while editing),
 * so a text field produces one undo step per edit, not one per keystroke.
 */
function useDraft<T>(value: string, onCommit: (next: string) => T | void) {
  const [draft, setDraft] = useState<string | null>(null)
  const latest = useRef({ draft, value, onCommit })
  useEffect(() => {
    latest.current = { draft, value, onCommit }
  })
  const commit = useCallback(() => {
    const { draft: d, value: v, onCommit: fn } = latest.current
    if (d === null) return
    setDraft(null)
    latest.current.draft = null
    if (d !== v) fn(d)
  }, [])
  useEffect(
    () => () => {
      const { draft: d, value: v, onCommit: fn } = latest.current
      if (d !== null && d !== v) fn(d)
    },
    [],
  )
  const cancel = useCallback(() => {
    latest.current.draft = null
    setDraft(null)
  }, [])
  return { shown: draft ?? value, draft, setDraft, commit, cancel }
}

interface DraftTextProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  onCommit: (value: string) => void
}

export const DraftText = React.forwardRef<HTMLInputElement, DraftTextProps>(function DraftText({ value, onCommit, className, onBlur, onKeyDown, ...rest }, ref) {
  const d = useDraft(value, onCommit)
  return (
    <input
      ref={ref}
      type="text"
      {...rest}
      value={d.shown}
      onChange={(e) => d.setDraft(e.target.value)}
      onBlur={(e) => {
        d.commit()
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter') d.commit()
        else if (e.key === 'Escape' && d.draft !== null) {
          e.stopPropagation()
          d.cancel()
        }
      }}
      className={cn(inputClass, className)}
    />
  )
})

interface DraftTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string
  onCommit: (value: string) => void
  showCount?: boolean
}

export const DraftTextarea = React.forwardRef<HTMLTextAreaElement, DraftTextareaProps>(function DraftTextarea(
  { value, onCommit, showCount = true, className, onBlur, onKeyDown, ...rest },
  ref,
) {
  const d = useDraft(value, onCommit)
  const id = useId()
  return (
    <div className="space-y-0.5">
      <textarea
        ref={ref}
        rows={3}
        aria-describedby={showCount ? `${id}-count` : undefined}
        {...rest}
        value={d.shown}
        onChange={(e) => d.setDraft(e.target.value)}
        onBlur={(e) => {
          d.commit()
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.defaultPrevented) return
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) d.commit()
          else if (e.key === 'Escape' && d.draft !== null) {
            e.stopPropagation()
            d.cancel()
          }
        }}
        className={cn(
          'min-h-[56px] w-full resize-y rounded border border-input bg-background/60 p-2 text-xs font-mono outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary',
          className,
        )}
      />
      {showCount && (
        <div id={`${id}-count`} className="text-right text-[10px] text-muted-foreground">
          {d.shown.length} {d.shown.length === 1 ? 'character' : 'characters'}
        </div>
      )}
    </div>
  )
})

interface DraftNumberProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number
  onCommit: (value: number) => void
}

/** Number input (text box with ↑/↓ stepping, no browser spinner): commits a finite number on blur / Enter; anything else reverts to the stored value. */
export const DraftNumber = React.forwardRef<HTMLInputElement, DraftNumberProps>(function DraftNumber({ value, onCommit, className, onBlur, onKeyDown, step, ...rest }, ref) {
  const stored = Number.isFinite(value) ? String(value) : ''
  const [draft, setDraft] = useState<string | null>(null)
  const latest = useRef({ draft, stored, onCommit })
  useEffect(() => {
    latest.current = { draft, stored, onCommit }
  })
  const commit = useCallback(() => {
    const { draft: d, stored: s, onCommit: fn } = latest.current
    if (d === null) return
    setDraft(null)
    latest.current.draft = null
    if (d.trim() === '' || d === s) return
    const n = Number(d)
    if (Number.isFinite(n) && n !== Number(s)) fn(n)
  }, [])
  useEffect(
    () => () => {
      const { draft: d, stored: s, onCommit: fn } = latest.current
      if (d === null || d.trim() === '' || d === s) return
      const n = Number(d)
      if (Number.isFinite(n) && n !== Number(s)) fn(n)
    },
    [],
  )
  return (
    <input
      ref={ref}
      {...rest}
      type="text"
      inputMode="decimal"
      role="spinbutton"
      aria-valuenow={Number.isFinite(value) ? value : undefined}
      aria-valuemin={typeof rest.min === 'number' ? rest.min : undefined}
      aria-valuemax={typeof rest.max === 'number' ? rest.max : undefined}
      value={draft ?? stored}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit()
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape' && draft !== null) {
          e.stopPropagation()
          latest.current.draft = null
          setDraft(null)
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // the arrows a native number box has, without its spinner
          e.preventDefault()
          const base = Number(draft ?? stored)
          const by = (Number(step) > 0 ? Number(step) : 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
          const next = Math.round(((Number.isFinite(base) ? base : 0) + by) * 1e6) / 1e6
          latest.current.draft = null
          setDraft(null)
          if (next !== Number(stored)) latest.current.onCommit(next)
        }
      }}
      className={cn(inputClass, 'text-right', className)}
    />
  )
})

// ── layout atoms ────────────────────────────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string
  help?: string
  required?: boolean
  unit?: string
  children: (id: string) => React.ReactNode
  /** Label left, control right on one line (booleans, small numbers). */
  inline?: boolean
  className?: string
}

export function FieldRow({ label, help, required, unit, children, inline, className }: FieldRowProps) {
  const id = useId()
  return (
    <div className={cn('py-1', className)} data-field={label}>
      <div className={cn(inline ? 'flex items-center justify-between gap-2' : 'space-y-1')}>
        <label id={`${id}-label`} htmlFor={id} className="block shrink-0 select-none text-ed-label font-medium text-muted-foreground">
          {label}
          {required && (
            <span className="ml-0.5 text-amber-400" aria-hidden title="Required">
              *
            </span>
          )}
          {unit && <span className="ml-1 text-muted-foreground/60">({unit})</span>}
        </label>
        <div className={cn(inline && 'min-w-0 flex-1 flex justify-end')}>{children(id)}</div>
      </div>
      {help && <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/80">{help}</p>}
    </div>
  )
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  title: string
  danger?: boolean
  active?: boolean
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { title, danger, active, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={title}
      aria-label={title}
      {...rest}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        danger && 'hover:bg-red-500/15 hover:text-red-400',
        active && 'bg-accent text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
})

export const SmallButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }
>(function SmallButton({ className, variant = 'default', type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded border px-2.5 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && 'border-border bg-background/60 hover:bg-accent',
        variant === 'primary' && 'border-transparent bg-primary text-primary-foreground hover:opacity-90',
        variant === 'danger' && 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20',
        variant === 'ghost' && 'border-transparent hover:bg-accent',
        className,
      )}
    />
  )
})

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pb-1">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">{children}</h3>
      {right}
    </div>
  )
}

/** A themed checkbox with its label and an optional help line. */
export function CheckRow({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; disabled?: boolean }) {
  return (
    <div className="py-0.5">
      <Checkbox checked={checked} disabled={disabled} onChange={onChange} label={label} />
      {help && <p className="ml-6 text-[10px] leading-snug text-muted-foreground/80">{help}</p>}
    </div>
  )
}

/** A titled block of related fields: the unit a settings panel is built from. */
export function Group({ title, hint, right, children, className }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-md border border-border/70 bg-card/40', className)} aria-label={title}>
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {right}
      </header>
      <div className="space-y-1 px-3 py-2">{children}</div>
      {hint && <p className="border-t border-border/50 px-3 py-1.5 text-[10px] leading-snug text-muted-foreground/80">{hint}</p>}
    </section>
  )
}
