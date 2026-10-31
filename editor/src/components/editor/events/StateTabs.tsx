// Vertical state tabs: select, rename (double-click), add, duplicate, reorder, delete.

import React, { useState } from 'react'
import { ArrowDown, ArrowUp, CopyPlus, Plus, Trash2 } from 'lucide-react'
import type { EventState } from '../../../../../shared/engine/types'
import { TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { commandNodes } from '../../../../../shared/engine/graph'
import { cn } from '@/lib/utils'
import { DraftText, IconButton, SectionTitle, SmallButton } from './primitives'
import { stateLabel, type Problem } from './eventModel'

interface StateTabsProps {
  states: EventState[]
  selectedId: string
  /** Index of the state that would run with nothing set (-1 = none). */
  startIndex: number
  problems: Problem[]
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onAdd: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
}

export function StateTabs({ states, selectedId, startIndex, problems, onSelect, onRename, onAdd, onDuplicate, onDelete, onMove }: StateTabsProps) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const selectedIndex = states.findIndex((p) => p.id === selectedId)
  const selected = states[selectedIndex]

  const requestDelete = () => {
    if (!selected || states.length <= 1) return
    if (commandNodes(selected.graph).length > 0 && confirmDelete !== selected.id) {
      setConfirmDelete(selected.id)
      return
    }
    setConfirmDelete(null)
    onDelete(selected.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="state-tabs">
      <div className="px-2 pt-2">
        <SectionTitle>States</SectionTitle>
      </div>
      <div role="tablist" aria-label="Event states" aria-orientation="vertical" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-1">
        {states.map((state, i) => {
          const active = state.id === selectedId
          const own = problems.filter((p) => p.stateId === state.id)
          const errors = own.filter((p) => p.severity === 'error').length
          const warnings = own.length - errors
          return (
            <div
              key={state.id}
              role="tab"
              tabIndex={active ? 0 : -1}
              aria-selected={active}
              data-state-id={state.id}
              onClick={() => onSelect(state.id)}
              onDoubleClick={() => setRenaming(state.id)}
              onKeyDown={(e) => {
                if (renaming) return
                if (e.key === 'F2') setRenaming(state.id)
                else if (e.key === 'ArrowDown' && states[i + 1]) {
                  e.preventDefault()
                  onSelect(states[i + 1].id)
                } else if (e.key === 'ArrowUp' && states[i - 1]) {
                  e.preventDefault()
                  onSelect(states[i - 1].id)
                }
              }}
              className={cn('cursor-pointer rounded border px-2 py-1.5', active ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-accent/60')}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', i === startIndex ? 'bg-emerald-400' : 'border border-muted-foreground/40')}
                  title={i === startIndex ? 'This state runs when no switch or variable has been changed yet' : undefined}
                  data-start-dot={i === startIndex ? 'true' : undefined}
                  aria-label={i === startIndex ? 'Active at start' : undefined}
                />
                <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{i + 1}</span>
                {renaming === state.id ? (
                  <DraftText
                    autoFocus
                    aria-label={`Rename state ${i + 1}`}
                    value={state.name}
                    placeholder={`State ${i + 1}`}
                    onClick={(e) => e.stopPropagation()}
                    onCommit={(name) => onRename(state.id, name)}
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
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{stateLabel(state, i)}</span>
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
                <span>{TRIGGER_LABELS[state.trigger]}</span>
                <span>·</span>
                <span>
                  {commandNodes(state.graph).length} node{commandNodes(state.graph).length === 1 ? '' : 's'}
                </span>
                {state.conditions.length > 0 && (
                  <>
                    <span>·</span>
                    <span>
                      {state.conditions.length} cond
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
        runs with nothing set. The last state whose conditions hold wins.
      </p>
      <div className="border-t border-border p-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <SmallButton variant="primary" onClick={onAdd}>
            <Plus className="h-3 w-3" /> Add state
          </SmallButton>
          <IconButton title="Duplicate state" disabled={!selected} onClick={() => selected && onDuplicate(selected.id)}>
            <CopyPlus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Move state up (earlier)" disabled={selectedIndex <= 0} onClick={() => selected && onMove(selected.id, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Move state down (later)" disabled={selectedIndex < 0 || selectedIndex >= states.length - 1} onClick={() => selected && onMove(selected.id, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Delete state" danger disabled={states.length <= 1} onClick={requestDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        {confirmDelete && selected && confirmDelete === selected.id && (
          <div role="alert" className="mt-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-[11px]">
            <p className="text-amber-300">Delete “{stateLabel(selected, selectedIndex)}” and its {commandNodes(selected.graph).length} nodes? You can undo this.</p>
            <div className="mt-1 flex gap-1">
              <SmallButton variant="danger" onClick={requestDelete}>
                Delete state
              </SmallButton>
              <SmallButton onClick={() => setConfirmDelete(null)}>Cancel</SmallButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
