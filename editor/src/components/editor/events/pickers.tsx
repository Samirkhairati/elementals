// Searchable pickers for things that live elsewhere in the project: switches, variables, maps, sprites,
// targets and facings. They show names (never raw ids alone) and can create switches/variables inline.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsUpDown, Plus, Search, X } from 'lucide-react'
import type { CommandTarget, Facing } from '../../../../../shared/engine/types'
import { previewFrame } from '../../../../../shared/engine/sprites'
import { cn } from '@/lib/utils'
import { useEventEnv } from './eventEnv'
import { Popover, inputClass } from './primitives'

// ── generic list picker ─────────────────────────────────────────────────────────────────────────

export interface PickerItem {
  id: string
  label: string
  /** Muted text after the label (usually the id). */
  sub?: string
  description?: string
  group?: string
  leading?: React.ReactNode
  trailing?: React.ReactNode
  /** Extra searchable text. */
  keywords?: string
}

export interface ListPickerProps {
  items: PickerItem[]
  value?: string | null
  onSelect: (id: string) => void
  placeholder?: string
  emptyText?: string
  /** Rendered under the list; gets the query and a way to close the popover. */
  footer?: (api: { query: string; close: () => void }) => React.ReactNode
  /** An extra first row that clears the value. */
  clearLabel?: string
  onClear?: () => void
  close: () => void
  groups?: { id: string; label: string }[]
}

function matches(item: PickerItem, q: string): boolean {
  if (!q) return true
  const hay = `${item.label} ${item.sub ?? ''} ${item.id} ${item.keywords ?? ''} ${item.description ?? ''}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w))
}

export function ListPicker({ items, value, onSelect, placeholder = 'Search…', emptyText = 'Nothing matches.', footer, clearLabel, onClear, close, groups }: ListPickerProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => items.filter((i) => matches(i, query.trim())), [items, query])
  // Rows in display order: optional clear row, then items (grouped when groups are given).
  const rows = useMemo(() => {
    const out: ({ kind: 'clear' } | { kind: 'item'; item: PickerItem } | { kind: 'header'; label: string })[] = []
    if (clearLabel && onClear && !query) out.push({ kind: 'clear' })
    if (groups) {
      for (const g of groups) {
        const inGroup = filtered.filter((i) => i.group === g.id)
        if (inGroup.length === 0) continue
        out.push({ kind: 'header', label: g.label })
        for (const item of inGroup) out.push({ kind: 'item', item })
      }
    } else {
      for (const item of filtered) out.push({ kind: 'item', item })
    }
    return out
  }, [filtered, groups, clearLabel, onClear, query])
  const selectable = rows.filter((r) => r.kind !== 'header')
  const activeIndex = Math.min(active, Math.max(0, selectable.length - 1))
  const activeRow = selectable[activeIndex]

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, query])

  const choose = (row: (typeof selectable)[number] | undefined) => {
    if (!row) return
    if (row.kind === 'clear') onClear?.()
    else if (row.kind === 'item') onSelect(row.item.id)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(selectable.length - 1, activeIndex + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(0, activeIndex - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(activeRow)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          placeholder={placeholder}
          aria-label="Search"
          className="h-6 w-full min-w-0 bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
        {selectable.length === 0 && <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">{items.length === 0 ? emptyText : 'Nothing matches.'}</div>}
        {rows.map((row, i) => {
          if (row.kind === 'header') {
            return (
              <div key={`h-${row.label}-${i}`} className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {row.label}
              </div>
            )
          }
          const isActive = row === activeRow
          if (row.kind === 'clear') {
            return (
              <button
                key="clear"
                type="button"
                role="option"
                aria-selected={!value}
                data-active={isActive}
                onMouseEnter={() => setActive(selectable.indexOf(row))}
                onClick={() => choose(row)}
                className={cn('flex w-full items-center gap-2 px-3 py-1 text-left text-xs italic text-muted-foreground', isActive && 'bg-accent')}
              >
                <X className="h-3 w-3" aria-hidden />
                {clearLabel}
              </button>
            )
          }
          const { item } = row
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === value}
              data-active={isActive}
              onMouseEnter={() => setActive(selectable.indexOf(row))}
              onClick={() => choose(row)}
              className={cn('flex w-full items-start gap-2 px-3 py-1 text-left', isActive && 'bg-accent', item.id === value && 'font-semibold')}
            >
              {item.leading}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate text-xs">{item.label}</span>
                  {item.sub && <span className="truncate text-[10px] text-muted-foreground">{item.sub}</span>}
                </span>
                {item.description && <span className="block text-[10px] font-normal leading-snug text-muted-foreground">{item.description}</span>}
              </span>
              {item.trailing}
            </button>
          )
        })}
      </div>
      {footer && <div className="border-t border-border p-1.5">{footer({ query, close })}</div>}
    </div>
  )
}

/** Trigger button + popover + list: the shape of every picker field. */
export interface PickerFieldProps extends Omit<ListPickerProps, 'close' | 'footer'> {
  id?: string
  display?: React.ReactNode
  placeholder: string
  invalid?: boolean
  title?: string
  width?: number
  footer?: ListPickerProps['footer']
  label: string
  disabled?: boolean
}

export function PickerField({ id, display, placeholder, invalid, title, width = 280, label, disabled, ...list }: PickerFieldProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={anchor}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        // Field label first, then what is chosen (a <label for> alone would hide the value from screen readers).
        aria-labelledby={id ? `${id}-label ${id}-value` : undefined}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-7 w-full min-w-0 items-center gap-1.5 rounded border bg-background/60 px-2 text-left text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50',
          invalid ? 'border-red-500/60 text-red-400' : 'border-input',
        )}
      >
        <span id={id ? `${id}-value` : undefined} className={cn('min-w-0 flex-1 truncate', !display && 'text-muted-foreground/70')}>
          {display ?? placeholder}
        </span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} width={width} label={label}>
        <ListPicker {...list} close={() => setOpen(false)} />
      </Popover>
    </>
  )
}

// ── inline creation ─────────────────────────────────────────────────────────────────────────────

function NewEntry({ noun, query, onCreate }: { noun: 'switch' | 'variable' | 'stage'; query: string; onCreate: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(query)
          setEditing(true)
        }}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-primary hover:bg-accent"
      >
        <Plus className="h-3 w-3" aria-hidden />
        New {noun}…
      </button>
    )
  }
  const submit = () => {
    const n = name.trim()
    if (n) onCreate(n)
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            submit()
          }
        }}
        placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} name`}
        aria-label={`New ${noun} name`}
        className={inputClass}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!name.trim()}
        className="h-7 shrink-0 rounded bg-primary px-2 text-[11px] text-primary-foreground disabled:opacity-50"
      >
        Create
      </button>
    </div>
  )
}

// ── switches, variables ─────────────────────────────────────────────────────────────────────────

interface IdPickerProps {
  value: string
  onChange: (id: string) => void
  id?: string
  disabled?: boolean
}

export function SwitchPicker({ value, onChange, id, disabled }: IdPickerProps) {
  const env = useEventEnv()
  const items = useMemo<PickerItem[]>(() => env.switches.map((s) => ({ id: s.id, label: s.name, sub: s.folder ? `${s.folder} · ${s.id}` : s.id })), [env.switches])
  const found = env.switches.find((s) => s.id === value)
  return (
    <PickerField
      id={id}
      label="Choose a switch"
      disabled={disabled}
      items={items}
      value={value}
      onSelect={onChange}
      placeholder="Choose switch…"
      emptyText="No switches yet. Create one below."
      display={value ? (found ? found.name : `Missing: ${value}`) : undefined}
      invalid={!!value && !found}
      title={value && !found ? `Switch "${value}" does not exist` : found ? found.id : undefined}
      footer={({ query, close }) => (
        <NewEntry
          noun="switch"
          query={query}
          onCreate={(name) => {
            const created = env.addSwitch(name)
            if (created) {
              onChange(created)
              close()
            }
          }}
        />
      )}
    />
  )
}

export function VariablePicker({ value, onChange, id, disabled }: IdPickerProps) {
  const env = useEventEnv()
  const items = useMemo<PickerItem[]>(() => env.variables.map((v) => ({ id: v.id, label: v.name, sub: v.folder ? `${v.folder} · ${v.id}` : v.id })), [env.variables])
  const found = env.variables.find((v) => v.id === value)
  return (
    <PickerField
      id={id}
      label="Choose a variable"
      disabled={disabled}
      items={items}
      value={value}
      onSelect={onChange}
      placeholder="Choose variable…"
      emptyText="No variables yet. Create one below."
      display={value ? (found ? found.name : `Missing: ${value}`) : undefined}
      invalid={!!value && !found}
      title={value && !found ? `Variable "${value}" does not exist` : found ? found.id : undefined}
      footer={({ query, close }) => (
        <NewEntry
          noun="variable"
          query={query}
          onCreate={(name) => {
            const created = env.addVariable(name)
            if (created) {
              onChange(created)
              close()
            }
          }}
        />
      )}
    />
  )
}

/** Picks a global stage (quest / story progress). */
export function StagePicker({ value, onChange, id, disabled }: IdPickerProps) {
  const env = useEventEnv()
  const items = useMemo<PickerItem[]>(() => env.stages.map((st) => ({ id: st.id, label: st.name, sub: st.folder ? `${st.folder} · ${st.id}` : st.id })), [env.stages])
  const found = env.stages.find((st) => st.id === value)
  return (
    <PickerField
      id={id}
      label="Choose a stage"
      disabled={disabled}
      items={items}
      value={value}
      onSelect={onChange}
      placeholder="Choose stage…"
      emptyText="No stages yet. Create one below."
      display={value ? (found ? found.name : `Missing: ${value}`) : undefined}
      invalid={!!value && !found}
      title={value && !found ? `Stage "${value}" does not exist` : found ? found.id : undefined}
      footer={({ query, close }) => (
        <NewEntry
          noun="stage"
          query={query}
          onCreate={(name) => {
            const created = env.addStage(name)
            if (created) {
              onChange(created)
              close()
            }
          }}
        />
      )}
    />
  )
}

/** Picks one value of a stage. With no stage chosen yet it says so instead of listing anything. */
export function StageValuePicker({ stageId, value, onChange, id, disabled }: IdPickerProps & { stageId: string }) {
  const env = useEventEnv()
  const stage = env.stages.find((st) => st.id === stageId)
  const items = useMemo<PickerItem[]>(() => (stage ? stage.values.map((v, i) => ({ id: v.id, label: v.name, sub: `#${i + 1}` })) : []), [stage])
  const found = stage?.values.find((v) => v.id === value)
  return (
    <PickerField
      id={id}
      label="Choose a stage value"
      disabled={disabled || !stage}
      items={items}
      value={value}
      onSelect={onChange}
      placeholder={stage ? 'Choose value…' : 'Choose a stage first'}
      emptyText="This stage has no values."
      display={value ? (found ? found.name : `Missing: ${value}`) : undefined}
      invalid={!!value && !!stage && !found}
      title={value && stage && !found ? `Stage "${stage.name}" has no value "${value}"` : found ? found.id : undefined}
    />
  )
}

// ── maps ────────────────────────────────────────────────────────────────────────────────────────

export function MapPicker({ value, onChange, id }: IdPickerProps) {
  const env = useEventEnv()
  const items = useMemo<PickerItem[]>(() => env.maps.map((m) => ({ id: m.id, label: m.name, sub: m.id === m.name ? undefined : m.id })), [env.maps])
  const found = env.maps.find((m) => m.id === value)
  return (
    <PickerField
      id={id}
      label="Choose a map"
      items={items}
      value={value}
      onSelect={onChange}
      placeholder="Choose map…"
      emptyText="No maps in the project."
      display={value ? (found ? found.name : `Missing: ${value}`) : undefined}
      invalid={!!value && !found}
      title={value && !found ? `Map "${value}" does not exist` : undefined}
    />
  )
}

// ── sprites ─────────────────────────────────────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>()

/** First/idle frame of a sprite asset drawn small (pixelated). Falls back to an empty box without a graphic. */
export function SpriteThumb({
  asset,
  facing = 'down',
  frame = 0,
  animation = '',
  size = 24,
}: {
  asset: string
  facing?: Facing
  frame?: number
  animation?: string
  size?: number
}) {
  const env = useEventEnv()
  const info = asset ? env.getSpriteAsset(asset) : undefined
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!info) return
    const sheet = info.sheets
    let cancelled = false
    const draw = (img: HTMLImageElement) => {
      if (cancelled) return
      const el = canvas.current
      const ctx = el?.getContext('2d')
      if (!el || !ctx) return
      const pf = previewFrame(info.meta, { facing, animation, frame }, 0, img.naturalWidth)
      const url = sheet[pf.sheetFile]
      if (!url || !pf.rect) return
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.imageSmoothingEnabled = false
      const scale = Math.min(el.width / pf.rect.w, el.height / pf.rect.h)
      const w = pf.rect.w * scale
      const h = pf.rect.h * scale
      ctx.drawImage(img, pf.rect.x, pf.rect.y, pf.rect.w, pf.rect.h, (el.width - w) / 2, el.height - h, w, h)
    }
    const first = previewFrame(info.meta, { facing, animation, frame }, 0, 1)
    const url = sheet[first.sheetFile]
    if (!url) return
    const cached = imageCache.get(url)
    if (cached?.complete && cached.naturalWidth > 0) {
      draw(cached)
    } else {
      const img = cached ?? new Image()
      imageCache.set(url, img)
      img.addEventListener('load', () => draw(img), { once: true })
      if (!cached) img.src = url
    }
    return () => {
      cancelled = true
    }
  }, [info, facing, frame, animation])

  return (
    <canvas
      ref={canvas}
      width={size}
      height={size}
      aria-hidden
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={cn('shrink-0 rounded-sm bg-muted/60', !info && 'opacity-40')}
      data-testid={info ? 'sprite-thumb' : 'sprite-thumb-empty'}
    />
  )
}

export function SpritePicker({
  value,
  onChange,
  id,
  clearLabel,
  facing,
  frame,
  animation,
}: IdPickerProps & { clearLabel?: string; facing?: Facing; frame?: number; animation?: string }) {
  const env = useEventEnv()
  const items = useMemo<PickerItem[]>(
    () =>
      env.sprites.map((s) => ({
        id: s.id,
        label: s.name,
        sub: s.id,
        trailing: <span className="shrink-0 text-[9px] uppercase text-muted-foreground">{s.kind}</span>,
        leading: <SpriteThumb asset={s.id} size={28} />,
      })),
    [env.sprites],
  )
  const found = env.sprites.find((s) => s.id === value)
  return (
    <PickerField
      id={id}
      label="Choose a sprite"
      items={items}
      value={value}
      onSelect={onChange}
      placeholder={clearLabel ?? 'Choose sprite…'}
      emptyText="No sprite assets in the project."
      clearLabel={clearLabel}
      onClear={clearLabel ? () => onChange('') : undefined}
      display={
        value ? (
          <span className="flex items-center gap-1.5">
            <SpriteThumb asset={value} facing={facing} frame={frame} animation={animation} size={20} />
            <span className="truncate">{found ? found.name : `Missing: ${value}`}</span>
          </span>
        ) : undefined
      }
      invalid={!!value && !found}
      title={value && !found ? `Sprite "${value}" does not exist` : value || undefined}
      width={300}
    />
  )
}

// ── targets ─────────────────────────────────────────────────────────────────────────────────────

function encodeTarget(t: CommandTarget | undefined): string {
  if (t === undefined || t === 'self') return 'self'
  if (t === 'player') return 'player'
  if (typeof t === 'object' && t && typeof t.entity === 'string') return `entity:${t.entity}`
  return 'self'
}

export function TargetPicker({ value, onChange, id }: { value: CommandTarget | undefined; onChange: (t: CommandTarget) => void; id?: string }) {
  const env = useEventEnv()
  const items = useMemo<PickerItem[]>(
    () => [
      { id: 'self', label: 'This event', description: 'The entity that owns this event.', group: 'special' },
      { id: 'player', label: 'Player', description: 'The player character.', group: 'special' },
      ...env.entities
        .filter((e) => e.id !== env.entityId)
        .map((e) => ({ id: `entity:${e.id}`, label: e.name || e.id, sub: 'on this map', group: 'entities' })),
    ],
    [env.entities, env.entityId],
  )
  const encoded = encodeTarget(value)
  const missing = encoded.startsWith('entity:') && !env.entities.some((e) => `entity:${e.id}` === encoded)
  const display =
    encoded === 'self' ? 'This event' : encoded === 'player' ? 'Player' : missing ? `Missing: ${encoded.slice(7)}` : env.entities.find((e) => `entity:${e.id}` === encoded)?.name || encoded.slice(7)
  return (
    <PickerField
      id={id}
      label="Choose a target"
      items={items}
      value={encoded}
      onSelect={(sel) => onChange(sel === 'self' || sel === 'player' ? sel : { entity: sel.slice(7) })}
      placeholder="Choose target…"
      groups={[
        { id: 'special', label: 'Special' },
        { id: 'entities', label: 'Entities on this map' },
      ]}
      display={display}
      invalid={missing}
      title={missing ? 'That entity is no longer on this map' : undefined}
    />
  )
}

// ── facing ──────────────────────────────────────────────────────────────────────────────────────

const FACING_BUTTONS: { value: Facing; label: string; Icon: typeof ArrowUp }[] = [
  { value: 'up', label: 'Up', Icon: ArrowUp },
  { value: 'left', label: 'Left', Icon: ArrowLeft },
  { value: 'down', label: 'Down', Icon: ArrowDown },
  { value: 'right', label: 'Right', Icon: ArrowRight },
]

export function FacingPicker({ value, onChange, id }: { value: string; onChange: (f: Facing) => void; id?: string }) {
  return (
    <div id={id} role="radiogroup" aria-label="Direction" className="inline-flex overflow-hidden rounded border border-input">
      {FACING_BUTTONS.map(({ value: f, label, Icon }) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={value === f}
          aria-label={label}
          title={label}
          onClick={() => onChange(f)}
          className={cn('flex h-7 w-8 items-center justify-center border-r border-input last:border-r-0 hover:bg-accent', value === f && 'bg-primary text-primary-foreground hover:bg-primary')}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}
