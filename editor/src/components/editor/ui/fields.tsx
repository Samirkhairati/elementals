// Themed form controls that replace the browser's own: dropdown, checkbox, radio group, slider and colour picker.
// They follow the ARIA patterns of the native elements (combobox + listbox, checkbox, radiogroup, slider) so keyboard use
// and screen readers keep working, and they share the tokens of the other editor controls (ed-input, ed-switch ...).

import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hexToHsv, hsvToHex, normalizeHex } from '@/lib/color'
import { PortalContainerContext } from '../../ui/portal-container'

// ── anchored popover ────────────────────────────────────────────────────────────────────────────

interface Anchored {
  left: number
  top?: number
  bottom?: number
  minWidth: number
  maxHeight: number
  /** 'fixed' on the page, 'absolute' inside a dialog's content node. */
  position: 'fixed' | 'absolute'
  /** Where to render it. */
  container: HTMLElement
}

/**
 * Where a popover sits under (or, when there is no room, above) its anchor, and when it closes: outside press, Escape,
 * window resize and scrolling of anything except the popover itself. It renders into the nearest portal container
 * (a dialog's content) or the page.
 */
function useAnchoredPopover(open: boolean, anchor: React.RefObject<HTMLElement | null>, popover: React.RefObject<HTMLElement | null>, close: () => void, wanted = 260): Anchored | null {
  const [pos, setPos] = useState<Anchored | null>(null)
  const inDialog = useContext(PortalContainerContext)

  useLayoutEffect(() => {
    if (!open || !anchor.current || typeof document === 'undefined') return setPos(null)
    const container = inDialog ?? document.body
    const absolute = inDialog !== null
    const r = anchor.current.getBoundingClientRect()
    const c = absolute ? container.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    const below = c.bottom - r.bottom - 8
    const above = r.top - c.top - 8
    const flip = below < Math.min(wanted, 160) && above > below
    const maxHeight = Math.max(96, Math.min(wanted, flip ? above : below))
    const room = Math.max(r.width, 200)
    const left = Math.max(8, Math.min(r.left - c.left, c.right - c.left - room - 8))
    const common = { left, minWidth: r.width, maxHeight, position: absolute ? ('absolute' as const) : ('fixed' as const), container }
    setPos(flip ? { ...common, bottom: c.bottom - r.top + 4 } : { ...common, top: r.bottom - c.top + 4 })
  }, [open, anchor, wanted, inDialog])

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!popover.current?.contains(t) && !anchor.current?.contains(t)) close()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const scroll = (e: Event) => {
      if (!popover.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open, anchor, popover, close])

  return pos
}

const POPOVER = 'z-[200] overflow-y-auto rounded-md border border-border bg-popover p-1 text-ed-body text-popover-foreground shadow-lg'

// ── Select ──────────────────────────────────────────────────────────────────────────────────────

export interface SelectOption<T extends string = string> {
  value: T
  /** What the list shows; defaults to the value. */
  label?: React.ReactNode
  disabled?: boolean
  /** Options with the same `group` sit under one heading (keep them next to each other). */
  group?: string
}

interface SelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  /** Shown while no option matches the value (for example '' = nothing chosen). */
  placeholder?: string
  disabled?: boolean
  id?: string
  title?: string
  className?: string
  'aria-label'?: string
}

/** A dropdown that matches the editor theme. Same job as `<select>`: pick one of a few options. */
export function Select<T extends string>({ value, onChange, options, placeholder, disabled, id, title, className, ...rest }: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  const typed = useRef({ text: '', at: 0 })
  const listId = useRef(`ed-select-${Math.random().toString(36).slice(2, 8)}`).current
  const close = React.useCallback(() => setOpen(false), [])
  const pos = useAnchoredPopover(open, button, list, close)
  const selected = options.findIndex((o) => o.value === value)
  const shown = selected >= 0 ? (options[selected].label ?? options[selected].value) : placeholder

  const enabled = (i: number) => i >= 0 && i < options.length && !options[i].disabled
  const step = (from: number, dir: 1 | -1): number => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i
    return from
  }
  const openList = () => {
    if (disabled) return
    setActive(enabled(selected) ? selected : step(-1, 1))
    setOpen(true)
  }
  const choose = (i: number) => {
    if (!enabled(i)) return
    setOpen(false)
    button.current?.focus()
    if (options[i].value !== value) onChange(options[i].value)
  }

  useEffect(() => {
    if (open && active >= 0) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, pos])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((a) => step(a, 1)); break
      case 'ArrowUp': e.preventDefault(); setActive((a) => step(a, -1)); break
      case 'Home': e.preventDefault(); setActive(step(-1, 1)); break
      case 'End': e.preventDefault(); setActive(step(options.length, -1)); break
      case 'Enter':
      case ' ': e.preventDefault(); choose(active); break
      case 'Tab': setOpen(false); break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          // type-ahead: the first enabled option whose text starts with what was typed
          const now = Date.now()
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
          const hit = options.findIndex((o) => !o.disabled && String(typeof o.label === 'string' ? o.label : o.value).toLowerCase().startsWith(typed.current.text))
          if (hit >= 0) setActive(hit)
        }
    }
  }

  let lastGroup: string | undefined
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={rest['aria-label']}
        title={title}
        disabled={disabled}
        data-open={open ? 'true' : undefined}
        className={cn('ed-input flex items-center justify-between gap-1 text-left disabled:opacity-50', className)}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={cn('min-w-0 flex-1 truncate', selected < 0 && 'text-muted-foreground')}>{shown ?? ' '}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && pos
        ? createPortal(
            <div ref={list} id={listId} role="listbox" aria-label={rest['aria-label']} className={POPOVER} style={{ position: pos.position, left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}>
              {options.map((o, i) => {
                const heading = o.group !== undefined && o.group !== lastGroup ? o.group : null
                lastGroup = o.group
                return (
                  <React.Fragment key={`${o.value}-${i}`}>
                    {heading && <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">{heading}</div>}
                    <div
                      id={`${listId}-${i}`}
                      role="option"
                      data-index={i}
                      data-value={o.value}
                      aria-selected={i === selected}
                      aria-disabled={o.disabled || undefined}
                      data-active={i === active ? 'true' : undefined}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 data-[active=true]:bg-muted aria-disabled:cursor-default aria-disabled:opacity-40"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => !o.disabled && setActive(i)}
                      onClick={() => choose(i)}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label ?? o.value}</span>
                      {i === selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </div>
                  </React.Fragment>
                )
              })}
              {options.length === 0 && <div className="px-2 py-1 text-muted-foreground">Nothing to choose from</div>}
            </div>,
            pos.container,
          )
        : null}
    </>
  )
}

// ── Checkbox ────────────────────────────────────────────────────────────────────────────────────

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Text next to the box; clicking it toggles too. */
  label?: React.ReactNode
  disabled?: boolean
  /** Some but not all of a group (shown as a dash). */
  indeterminate?: boolean
  className?: string
  title?: string
  'aria-label'?: string
}

export function Checkbox({ checked, onChange, label, disabled, indeterminate, className, title, ...rest }: CheckboxProps) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-ed-body', disabled ? 'opacity-50' : 'cursor-pointer', className)} title={title}>
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        aria-label={rest['aria-label']}
        disabled={disabled}
        data-state={indeterminate ? 'mixed' : checked ? 'checked' : 'unchecked'}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background/50 text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=mixed]:border-primary data-[state=mixed]:bg-primary"
        onClick={() => onChange(!checked)}
      >
        {indeterminate ? <span className="h-0.5 w-2 rounded bg-current" /> : checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </button>
      {label !== undefined && <span className="min-w-0">{label}</span>}
    </label>
  )
}

// ── Radio group ─────────────────────────────────────────────────────────────────────────────────

export interface RadioOption<T extends string = string> {
  value: T
  label: React.ReactNode
  /** A quieter line under the label. */
  hint?: React.ReactNode
  disabled?: boolean
}

interface RadioGroupProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: RadioOption<T>[]
  className?: string
  'aria-label'?: string
}

/** One choice out of a few, listed with their explanations (use `Segmented` for short side-by-side switches). */
export function RadioGroup<T extends string>({ value, onChange, options, className, ...rest }: RadioGroupProps<T>) {
  const move = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return onChange(options[i].value)
  }
  return (
    <div role="radiogroup" aria-label={rest['aria-label']} className={cn('flex flex-col gap-1.5', className)}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            tabIndex={on || (!options.some((x) => x.value === value) && i === 0) ? 0 : -1}
            className="group flex items-start gap-2 rounded text-left text-ed-body disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i, 1) }
              if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i, -1) }
            }}
          >
            <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors', on ? 'border-primary' : 'border-input group-hover:border-muted-foreground')}>
              {on && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block">{o.label}</span>
              {o.hint && <span className="ed-hint block">{o.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A single round radio button, for lists where each row carries its own (a start value among several). */
export function Radio({ checked, onChange, label, disabled, className, ...rest }: { checked: boolean; onChange: () => void; label?: React.ReactNode; disabled?: boolean; className?: string; 'aria-label'?: string }) {
  return (
    <label className={cn('inline-flex items-center gap-1.5', disabled ? 'opacity-50' : 'cursor-pointer', className)}>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={rest['aria-label']}
        disabled={disabled}
        className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background', checked ? 'border-primary' : 'border-input hover:border-muted-foreground')}
        onClick={() => !checked && onChange()}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </button>
      {label !== undefined && <span className="min-w-0">{label}</span>}
    </label>
  )
}

// ── Slider ──────────────────────────────────────────────────────────────────────────────────────

interface SliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

function snap(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round((value - min) / step) * step + min
  return Math.min(max, Math.max(min, Math.round(stepped * 1e6) / 1e6))
}

/** Drag the thumb or use the arrow keys (Shift = x10, Home / End = ends). */
export function Slider({ value, onChange, min, max, step = 1, disabled, className, ...rest }: SliderProps) {
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const span = Math.max(1e-9, max - min)
  const ratio = Math.min(1, Math.max(0, (value - min) / span))

  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const next = snap(min + ((clientX - r.left) / r.width) * span, min, max, step)
    if (next !== value) onChange(next)
  }

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={rest['aria-label']}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled || undefined}
      className={cn('relative flex h-4 min-w-16 flex-1 cursor-pointer touch-none items-center focus-visible:outline-none [&:focus-visible>span:last-child]:ring-2 [&:focus-visible>span:last-child]:ring-ring', disabled && 'pointer-events-none opacity-50', className)}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        fromPointer(e.clientX)
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture?.(e.pointerId)
      }}
      onKeyDown={(e) => {
        const big = step * (e.shiftKey ? 10 : 1)
        const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? value + big : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? value - big : e.key === 'PageUp' ? value + step * 10 : e.key === 'PageDown' ? value - step * 10 : e.key === 'Home' ? min : e.key === 'End' ? max : null
        if (to === null) return
        e.preventDefault()
        const next = snap(to, min, max, step)
        if (next !== value) onChange(next)
      }}
    >
      <span className="absolute inset-x-0 h-1 rounded-full bg-input" />
      <span className="absolute h-1 rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      <span className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-foreground shadow" style={{ left: `${ratio * 100}%` }} />
    </div>
  )
}

// ── Colour ──────────────────────────────────────────────────────────────────────────────────────

const PRESETS = ['#ffffff', '#c0c0c0', '#808080', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

interface ColorFieldProps {
  /** `#rrggbb`, or '' for none. */
  value: string
  onChange: (value: string) => void
  /** Offers a "None" button that sets ''. */
  allowEmpty?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/** A swatch that opens a picker: saturation / brightness square, hue slider, hex field and a few presets. */
export function ColorField({ value, onChange, allowEmpty, disabled, className, ...rest }: ColorFieldProps) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  const pos = useAnchoredPopover(open, button, panel, close, 300)
  const hex = normalizeHex(value) ?? ''
  const [hsv, setHsv] = useState(() => hexToHsv(hex || '#ffffff'))
  const [text, setText] = useState(hex)
  useEffect(() => {
    setText(hex)
    if (hex) setHsv((cur) => (hsvToHex(cur) === hex ? cur : hexToHsv(hex))) // keep the hue of a grey / black
  }, [hex])

  const apply = (next: typeof hsv) => {
    setHsv(next)
    const out = hsvToHex(next)
    if (out !== hex) onChange(out)
  }
  const fromPointer = (e: React.PointerEvent) => {
    const r = area.current?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return
    apply({ ...hsv, s: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), v: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) })
  }
  const commitText = () => {
    const n = normalizeHex(text)
    if (n) onChange(n)
    else setText(hex)
  }
  const drag = useRef(false)

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={rest['aria-label'] ?? 'Colour'}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        className={cn('ed-input flex items-center gap-2 text-left disabled:opacity-50', className)}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ed-checker h-4 w-4 shrink-0 overflow-hidden rounded-sm border border-border" aria-hidden>
          <span className="block h-full w-full" style={{ background: hex || 'transparent' }} />
        </span>
        <span className={cn('min-w-0 flex-1 truncate', !hex && 'text-muted-foreground')}>{hex || 'none'}</span>
      </button>
      {open && pos
        ? createPortal(
            <div ref={panel} role="dialog" aria-label="Colour picker" className={cn(POPOVER, 'flex w-56 flex-col gap-2 p-2')} style={{ position: pos.position, left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
              <div
                ref={area}
                data-testid="color-area"
                className="relative h-28 w-full cursor-crosshair touch-none rounded"
                style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
                onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e) }}
                onPointerMove={(e) => drag.current && fromPointer(e)}
                onPointerUp={(e) => { drag.current = false; e.currentTarget.releasePointerCapture?.(e.pointerId) }}
              >
                <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
              </div>
              <Slider aria-label="Hue" min={0} max={360} step={1} value={Math.round(hsv.h)} onChange={(h) => apply({ ...hsv, h })} />
              <div className="flex items-center gap-1.5">
                <input
                  aria-label="Hex colour"
                  className="ed-input"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={commitText}
                  onKeyDown={(e) => e.key === 'Enter' && commitText()}
                />
                {allowEmpty && <button type="button" className="ed-btn shrink-0" onClick={() => { onChange(''); setOpen(false) }}>None</button>}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {PRESETS.map((c) => (
                  <button key={c} type="button" aria-label={`Use ${c}`} title={c} className={cn('h-5 rounded border border-border', c === hex && 'ring-2 ring-primary')} style={{ background: c }} onClick={() => onChange(c)} />
                ))}
              </div>
            </div>,
            pos.container,
          )
        : null}
    </>
  )
}

/** Options for `Select` from plain strings. */
export const optionsOf = <T extends string>(values: readonly T[]): SelectOption<T>[] => values.map((v) => ({ value: v }))
