// Vertical page tabs: select, rename (double-click), add, duplicate, reorder, delete.

import React, { useState } from 'react'
import { ArrowDown, ArrowUp, CopyPlus, Plus, Trash2 } from 'lucide-react'
import type { EventPage } from '../../../../../shared/engine/types'
import { TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { countCommands } from '../../../../../shared/engine/commands'
import { cn } from '@/lib/utils'
import { DraftText, IconButton, SectionTitle, SmallButton } from './primitives'
import { pageLabel, type Problem } from './eventModel'

interface PageTabsProps {
  pages: EventPage[]
  selectedId: string
  /** Index of the page that would run with no state set (-1 = none). */
  startIndex: number
  problems: Problem[]
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onAdd: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
}

export function PageTabs({ pages, selectedId, startIndex, problems, onSelect, onRename, onAdd, onDuplicate, onDelete, onMove }: PageTabsProps) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const selectedIndex = pages.findIndex((p) => p.id === selectedId)
  const selected = pages[selectedIndex]

  const requestDelete = () => {
    if (!selected || pages.length <= 1) return
    if (countCommands(selected.commands) > 0 && confirmDelete !== selected.id) {
      setConfirmDelete(selected.id)
      return
    }
    setConfirmDelete(null)
    onDelete(selected.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="page-tabs">
      <div className="px-2 pt-2">
        <SectionTitle>Pages</SectionTitle>
      </div>
      <div role="tablist" aria-label="Event pages" aria-orientation="vertical" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-1">
        {pages.map((page, i) => {
          const active = page.id === selectedId
          const own = problems.filter((p) => p.pageId === page.id)
          const errors = own.filter((p) => p.severity === 'error').length
          const warnings = own.length - errors
          return (
            <div
              key={page.id}
              role="tab"
              tabIndex={active ? 0 : -1}
              aria-selected={active}
              data-page-id={page.id}
              onClick={() => onSelect(page.id)}
              onDoubleClick={() => setRenaming(page.id)}
              onKeyDown={(e) => {
                if (renaming) return
                if (e.key === 'F2') setRenaming(page.id)
                else if (e.key === 'ArrowDown' && pages[i + 1]) {
                  e.preventDefault()
                  onSelect(pages[i + 1].id)
                } else if (e.key === 'ArrowUp' && pages[i - 1]) {
                  e.preventDefault()
                  onSelect(pages[i - 1].id)
                }
              }}
              className={cn('cursor-pointer rounded border px-2 py-1.5', active ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-accent/60')}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', i === startIndex ? 'bg-emerald-400' : 'border border-muted-foreground/40')}
                  title={i === startIndex ? 'This page runs when no switch or variable has been changed yet' : undefined}
                  data-start-dot={i === startIndex ? 'true' : undefined}
                  aria-label={i === startIndex ? 'Active at start' : undefined}
                />
                <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{i + 1}</span>
                {renaming === page.id ? (
                  <DraftText
                    autoFocus
                    aria-label={`Rename page ${i + 1}`}
                    value={page.name}
                    placeholder={`Page ${i + 1}`}
                    onClick={(e) => e.stopPropagation()}
                    onCommit={(name) => onRename(page.id, name)}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        e.stopPropagation()
                        setRenaming(null)
                      }
                    }}
                    className="h-6"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{pageLabel(page, i)}</span>
                )}
                {errors > 0 && (
                  <span className="rounded bg-red-500/20 px-1 text-[10px] text-red-400" title={`${errors} error${errors > 1 ? 's' : ''}`}>
                    {errors}
                  </span>
                )}
                {warnings > 0 && (
                  <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-400" title={`${warnings} warning${warnings > 1 ? 's' : ''}`}>
                    {warnings}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1 pl-[26px] text-[10px] text-muted-foreground">
                <span>{TRIGGER_LABELS[page.trigger]}</span>
                <span>·</span>
                <span>
                  {countCommands(page.commands)} cmd{countCommands(page.commands) === 1 ? '' : 's'}
                </span>
                {page.conditions.length > 0 && (
                  <>
                    <span>·</span>
                    <span>
                      {page.conditions.length} cond
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="px-2 pb-1 text-[10px] leading-snug text-muted-foreground">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
        runs with no state set. The last page whose conditions hold wins.
      </p>
      <div className="border-t border-border p-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <SmallButton variant="primary" onClick={onAdd}>
            <Plus className="h-3 w-3" /> Add page
          </SmallButton>
          <IconButton title="Duplicate page" disabled={!selected} onClick={() => selected && onDuplicate(selected.id)}>
            <CopyPlus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Move page up (earlier)" disabled={selectedIndex <= 0} onClick={() => selected && onMove(selected.id, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Move page down (later)" disabled={selectedIndex < 0 || selectedIndex >= pages.length - 1} onClick={() => selected && onMove(selected.id, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Delete page" danger disabled={pages.length <= 1} onClick={requestDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        {confirmDelete && selected && confirmDelete === selected.id && (
          <div role="alert" className="mt-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-[11px]">
            <p className="text-amber-300">Delete “{pageLabel(selected, selectedIndex)}” and its {countCommands(selected.commands)} commands? You can undo this.</p>
            <div className="mt-1 flex gap-1">
              <SmallButton variant="danger" onClick={requestDelete}>
                Delete page
              </SmallButton>
              <SmallButton onClick={() => setConfirmDelete(null)}>Cancel</SmallButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
