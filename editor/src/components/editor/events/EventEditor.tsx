// The full event editor: state tabs | state settings + command list | command inspector or problems.
// It is a pure function of `states`; every edit calls `onChange(newStates)` exactly once.

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Redo2, Undo2 } from 'lucide-react'
import type { Command, EventState } from '../../../../../shared/engine/types'
import { findCommand, getCommandDef } from '../../../../../shared/engine/commands'
import { createDefaultEventState } from '../../../../../shared/engine/components'
import { TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { cn } from '@/lib/utils'
import { useEventEnv } from './eventEnv'
import {
  addState,
  applyTemplate,
  buildValidationContext,
  collectProblems,
  countBySeverity,
  defaultActiveStateIndex,
  deleteState,
  duplicateState,
  groupIssuesByCommand,
  moveState,
  setCommandParams,
  updateState,
  validateState,
  type EventTemplate,
  type InsertTarget,
  type Problem,
} from './eventModel'
import { CommandList } from './CommandList'
import { StateTabs } from './StateTabs'
import { StateSettings } from './StateSettings'
import { ParamForm } from './ParamForm'
import { ProblemsList } from './ProblemsList'
import { CommandIcon, PlannedBadge } from './commandStyle'
import { IconButton } from './primitives'

export interface EventEditorProps {
  states: EventState[]
  /** Called once per user edit with the complete new state list. */
  onChange: (states: EventState[]) => void
  className?: string
}

export function EventEditor({ states: statesProp, onChange, className }: EventEditorProps) {
  const env = useEventEnv()
  const states = useMemo(() => (statesProp.length > 0 ? statesProp : [createDefaultEventState()]), [statesProp])
  const pagesRef = useRef(states)
  useLayoutEffect(() => {
    pagesRef.current = states
  })

  const commit = useCallback(
    (next: EventState[]) => {
      if (next === pagesRef.current) return
      pagesRef.current = next
      onChange(next)
    },
    [onChange],
  )

  const [selectedStateId, setSelectedStateId] = useState<string>(states[0].id)
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'command' | 'problems'>('command')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const formRef = useRef<HTMLDivElement>(null)

  const state = states.find((p) => p.id === selectedStateId) ?? states[0]
  const stateIndex = states.indexOf(state)
  const selected = selectedCommandId ? findCommand(state.commands, selectedCommandId) : null

  const vctx = useMemo(() => buildValidationContext(env), [env])
  const problems = useMemo(() => collectProblems(states, vctx), [states, vctx])
  const counts = countBySeverity(problems)
  const stateValidation = useMemo(() => validateState(state, vctx), [state, vctx])
  const issuesByCommand = useMemo(() => groupIssuesByCommand(stateValidation.commandIssues), [stateValidation])
  const startIndex = defaultActiveStateIndex(states, env.variables)

  const commitCommands = useCallback(
    (stateId: string, commands: Command[]) => commit(updateState(pagesRef.current, stateId, { commands })),
    [commit],
  )

  const onCommandsChange = useCallback(
    (next: Command[], select?: string | null) => {
      commitCommands(state.id, next)
      if (select !== undefined) setSelectedCommandId(select)
      if (select) setRightTab('command')
    },
    [commitCommands, state.id],
  )

  const onApplyTemplate = useCallback(
    (template: EventTemplate, target: InsertTarget) => {
      const result = applyTemplate(pagesRef.current, state.id, template, target)
      commit(result.states)
      if (result.selectId) {
        setSelectedCommandId(result.selectId)
        setRightTab('command')
      }
    },
    [commit, state.id],
  )

  const selectState = (id: string) => {
    setSelectedStateId(id)
    setSelectedCommandId(null)
  }

  const jumpToProblem = (p: Problem) => {
    setSelectedStateId(p.stateId)
    setSelectedCommandId(p.commandId ?? null)
    setRightTab('command')
    if (p.scope !== 'command') setSettingsOpen(true)
  }

  // Deferred one tick: a double-click selects first, and the form for that command renders after.
  const focusForm = () => {
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('[data-testid="param-form"] :is(input:not([type=hidden]), textarea, select, button[aria-haspopup])')?.focus()
    }, 0)
  }

  const def = selected ? getCommandDef(selected.command.type) : undefined

  return (
    <div className={cn('flex min-h-0 flex-1 text-foreground', className)} data-testid="event-editor">
      {/* states */}
      <aside className="w-[210px] shrink-0 border-r border-border bg-muted/20">
        <StateTabs
          states={states}
          selectedId={state.id}
          startIndex={startIndex}
          problems={problems}
          onSelect={selectState}
          onRename={(id, name) => commit(updateState(pagesRef.current, id, { name }))}
          onAdd={() => {
            const r = addState(pagesRef.current)
            commit(r.states)
            selectState(r.id)
          }}
          onDuplicate={(id) => {
            const r = duplicateState(pagesRef.current, id)
            commit(r.states)
            if (r.id) selectState(r.id)
          }}
          onDelete={(id) => {
            const remaining = deleteState(pagesRef.current, id)
            commit(remaining)
            if (id === state.id) {
              const idx = Math.min(stateIndex, remaining.length - 1)
              selectState(remaining[idx].id)
            }
          }}
          onMove={(id, delta) => commit(moveState(pagesRef.current, id, delta))}
        />
      </aside>

      {/* state content */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`State ${stateIndex + 1}`}>
        <div className="shrink-0 border-b border-border">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            aria-expanded={settingsOpen}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent/40"
          >
            {settingsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="text-xs font-semibold">State {stateIndex + 1}</span>
            <span className="truncate text-xs text-muted-foreground">
              {state.name.trim() ? `“${state.name.trim()}” · ` : ''}
              {TRIGGER_LABELS[state.trigger]}
              {state.conditions.length > 0 ? ` · ${state.conditions.length} condition${state.conditions.length > 1 ? 's' : ''}` : ' · always eligible'}
            </span>
          </button>
          {settingsOpen && (
            <div className="max-h-[36vh] overflow-y-auto border-t border-border/60">
              <StateSettings state={state} onChange={(patch) => commit(updateState(pagesRef.current, state.id, patch))} />
            </div>
          )}
        </div>
        <CommandList
          commands={state.commands}
          onChange={onCommandsChange}
          onApplyTemplate={onApplyTemplate}
          selectedId={selected ? selected.command.id : null}
          onSelect={(id) => {
            setSelectedCommandId(id)
            if (id) setRightTab('command')
          }}
          issues={issuesByCommand}
          onRequestEdit={focusForm}
        />
      </section>

      {/* inspector / problems */}
      <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-muted/10">
        <div role="tablist" aria-label="Inspector" className="flex shrink-0 items-center border-b border-border">
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'command'}
            onClick={() => setRightTab('command')}
            className={cn('px-3 py-1.5 text-xs font-medium', rightTab === 'command' ? 'border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            Command
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'problems'}
            onClick={() => setRightTab('problems')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium', rightTab === 'problems' ? 'border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            Problems
            {counts.errors > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded bg-red-500/20 px-1 text-[10px] text-red-400">
                <AlertCircle className="h-3 w-3" />
                {counts.errors}
              </span>
            )}
            {counts.warnings > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1 text-[10px] text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {counts.warnings}
              </span>
            )}
          </button>
          <span className="ml-auto flex items-center gap-0.5 pr-1.5">
            <IconButton title="Undo" disabled={!env.undo || env.canUndo === false} onClick={() => env.undo?.()}>
              <Undo2 className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="Redo" disabled={!env.redo || env.canRedo === false} onClick={() => env.redo?.()}>
              <Redo2 className="h-3.5 w-3.5" />
            </IconButton>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" ref={formRef}>
          {rightTab === 'problems' ? (
            <ProblemsList problems={problems} states={states} onJump={jumpToProblem} />
          ) : selected ? (
            <div className="p-3" data-testid="command-inspector">
              <div className="mb-2 flex items-start gap-2">
                <CommandIcon icon={def?.icon} category={def?.category} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold">{def?.label ?? 'Unknown command'}</h3>
                    {def?.status === 'planned' && <PlannedBadge />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{def?.description ?? `“${selected.command.type}” is not in the command catalog.`}</p>
                  {def?.status === 'planned' && <p className="mt-0.5 text-[10px] text-muted-foreground/80">Planned: you can place it now; the game skips it until that system exists.</p>}
                </div>
              </div>
              {(issuesByCommand.get(selected.command.id) ?? []).length > 0 && (
                <ul className="mb-2 space-y-0.5" data-testid="command-issues">
                  {(issuesByCommand.get(selected.command.id) ?? []).map((i, n) => (
                    <li key={n} className={cn('flex items-start gap-1 text-[11px]', i.severity === 'error' ? 'text-red-400' : 'text-amber-400')}>
                      {i.severity === 'error' ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
              <ParamForm
                key={selected.command.id}
                command={selected.command}
                onPatch={(patch, prune) => {
                  const cur = pagesRef.current.find((p) => p.id === state.id)
                  if (cur) commitCommands(state.id, setCommandParams(cur.commands, selected.command.id, patch, prune))
                }}
              />
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground" data-testid="no-selection">
              Select a command to edit its parameters.
              <br />
              <span className="text-[10px]">States with no commands can start from a template.</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

