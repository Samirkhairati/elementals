// "Add a node" search: every catalog command grouped by category, plus End and Reroute. Opened with Tab,
// the right-click menu or the toolbar button, and by dropping a wire on empty canvas.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { COMMAND_CATALOG, COMMAND_CATEGORIES } from '../../../../../shared/engine/commands'
import { TREE_ONLY_TYPES } from '../../../../../shared/engine/graph'
import { cn } from '@/lib/utils'
import { CommandIcon, PlannedBadge } from './commandStyle'
import { STRUCTURAL_PALETTE } from './graphModel'

export interface PaletteEntry {
  type: string
  label: string
  description: string
  icon?: string
  category?: string
  group: string
  planned: boolean
}

/** Everything the palette can add, in display order (categories as in the catalog, then flow helpers). */
export function paletteEntries(): PaletteEntry[] {
  const out: PaletteEntry[] = []
  for (const cat of COMMAND_CATEGORIES) {
    for (const d of Object.values(COMMAND_CATALOG)) {
      if (d.category !== cat.id || TREE_ONLY_TYPES.includes(d.type)) continue
      out.push({ type: d.type, label: d.label, description: d.description, icon: d.icon, category: d.category, group: cat.label, planned: d.status === 'planned' })
    }
  }
  for (const s of STRUCTURAL_PALETTE) out.push({ type: s.type, label: s.label, description: s.description, group: 'Flow', planned: false })
  return out
}

function matches(entry: PaletteEntry, q: string): boolean {
  const hay = `${entry.label} ${entry.type} ${entry.group} ${entry.description}`.toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

export interface NodePaletteProps {
  /** Where the panel appears, in pixels inside the canvas. */
  x: number
  y: number
  onPick: (type: string) => void
  onClose: () => void
  /** Shown above the search ("Add after Show Text"). */
  title?: string
}

export function NodePalette({ x, y, onPick, onClose, title = 'Add a node' }: NodePaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const entries = useMemo(paletteEntries, [])
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => (q ? entries.filter((e) => matches(e, q)) : entries), [entries, q])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const pick = (entry: PaletteEntry | undefined) => entry && onPick(entry.type)

  return (
    <div
      role="dialog"
      aria-label={title}
      data-ev-popover=""
      className="absolute z-50 w-[300px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActive((a) => Math.min(shown.length - 1, a + 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActive((a) => Math.max(0, a - 1))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          pick(shown[active])
        }
      }}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          aria-label="Search nodes"
          className="h-6 w-full bg-transparent text-xs outline-none"
        />
      </div>
      <ul ref={listRef} role="listbox" aria-label="Nodes" className="max-h-72 overflow-y-auto py-1">
        {shown.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">Nothing matches “{query}”.</li>}
        {shown.map((entry, i) => (
          <React.Fragment key={entry.type}>
            {(i === 0 || shown[i - 1].group !== entry.group) && (
              <li role="presentation" className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {entry.group}
              </li>
            )}
            <li
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(entry)}
              className={cn('flex cursor-pointer items-start gap-2 px-3 py-1', i === active && 'bg-accent')}
            >
              <CommandIcon icon={entry.icon} category={entry.category as never} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs">
                  {entry.label}
                  {entry.planned && <PlannedBadge />}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">{entry.description}</span>
              </span>
            </li>
          </React.Fragment>
        ))}
      </ul>
    </div>
  )
}
