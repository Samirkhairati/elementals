// The full event editor: state tabs | state settings + node canvas | node inspector or problems.
// It is a pure function of `states`; every edit calls `onChange(newStates)` exactly once.

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Redo2, Undo2 } from 'lucide-react'
import type { EventGraph, EventState } from '../../../../../shared/engine/types'
import { getCommandDef } from '../../../../../shared/engine/commands'
import { createDefaultEventState } from '../../../../../shared/engine/components'
import { TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { GRAPH_END, GRAPH_JUNCTION, GRAPH_START, getNode, updateNodeParams } from '../../../../../shared/engine/graph'
import { cn } from '@/lib/utils'
import { useEventEnv } from './eventEnv'
import {
  EVENT_TEMPLATES,
  addState,
  applyTemplate,
  buildSummaryContext,
  buildValidationContext,
  collectProblems,
  countBySeverity,
  defaultActiveStateIndex,
  deleteState,
  duplicateState,
  groupIssuesByNode,
  isEmptyGraph,
  moveState,
  updateState,
  validateState,
  type EventTemplate,
  type Problem,
} from './eventModel'
import { GraphCanvas } from './GraphCanvas'
import { StateTabs } from './StateTabs'
import { StateSettings } from './StateSettings'
import { ParamForm } from './ParamForm'
import { ProblemsList } from './ProblemsList'
import { CommandIcon, PlannedBadge, iconFor } from './commandStyle'
import { IconButton } from './primitives'

export interface EventEditorProps {
  states: EventState[]
  /** Called once per user edit with the complete new state list. */
  onChange: (states: EventState[]) => void
  className?: string
}

const STRUCTURAL_INFO: Record<string, { label: string; description: string }> = {
  [GRAPH_START]: { label: 'Start', description: 'The event begins here. Wire it to the first node.' },
  [GRAPH_END]: { label: 'End', description: 'The event stops here. A wire that leads nowhere also ends it; this just makes it visible.' },
  [GRAPH_JUNCTION]: { label: 'Reroute', description: 'A point to bend a wire around. Wire a later node back to one to make a loop (the loop must wait somewhere).' },
}

export function EventEditor({ states: statesProp, onChange, className }: EventEditorProps) {
  const env = useEventEnv()
  const states = useMemo(() => (statesProp.length > 0 ? statesProp : [createDefaultEventState()]), [statesProp])
  const statesRef = useRef(states)
  useLayoutEffect(() => {
    statesRef.current = states
  })

  const commit = useCallback(
    (next: EventState[]) => {
      if (next === statesRef.current) return
      statesRef.current = next
      onChange(next)
    },
    [onChange],
  )

  const [selectedStateId, setSelectedStateId] = useState<string>(states[0].id)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'node' | 'problems'>('node')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const formRef = useRef<HTMLDivElement>(null)

  const state = states.find((p) => p.id === selectedStateId) ?? states[0]
  const stateIndex = states.indexOf(state)
  const selected = selectedNodeId ? getNode(state.graph, selectedNodeId) : undefined

  const vctx = useMemo(() => buildValidationContext(env), [env])
  const summaryContext = useMemo(() => buildSummaryContext(env), [env])
  const problems = useMemo(() => collectProblems(states, vctx), [states, vctx])
  const counts = countBySeverity(problems)
  const stateValidation = useMemo(() => validateState(state, vctx), [state, vctx])
  const issuesByNode = useMemo(() => groupIssuesByNode(stateValidation.nodeIssues), [stateValidation])
  const startIndex = defaultActiveStateIndex(states, env.variables, env.stages)

  const onGraphChange = useCallback(
    (graph: EventGraph, select?: string | null) => {
      commit(updateState(statesRef.current, state.id, { graph }))
      if (select !== undefined) setSelectedNodeId(select)
      if (select) setRightTab('node')
    },
    [commit, state.id],
  )

  const onApplyTemplate = useCallback(
    (template: EventTemplate) => {
      const result = applyTemplate(statesRef.current, state.id, template)
      commit(result.states)
      if (result.selectId) {
        setSelectedNodeId(result.selectId)
        setRightTab('node')
      }
    },
    [commit, state.id],
  )

  const selectState = (id: string) => {
    setSelectedStateId(id)
    setSelectedNodeId(null)
  }

  const jumpToProblem = (p: Problem) => {
    setSelectedStateId(p.stateId)
    setSelectedNodeId(p.nodeId ?? null)
    setRightTab('node')
    if (p.scope !== 'node') setSettingsOpen(true)
  }

  const def = selected ? getCommandDef(selected.type) : undefined
  const structural = selected ? STRUCTURAL_INFO[selected.type] : undefined
  const selectedIssues = selected ? (issuesByNode.get(selected.id) ?? []) : []

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
          onRename={(id, name) => commit(updateState(statesRef.current, id, { name }))}
          onAdd={() => {
            const r = addState(statesRef.current)
            commit(r.states)
            selectState(r.id)
          }}
          onDuplicate={(id) => {
            const r = duplicateState(statesRef.current, id)
            commit(r.states)
            if (r.id) selectState(r.id)
          }}
          onDelete={(id) => {
            const remaining = deleteState(statesRef.current, id)
            commit(remaining)
            if (id === state.id) {
              const idx = Math.min(stateIndex, remaining.length - 1)
              selectState(remaining[idx].id)
            }
          }}
          onMove={(id, delta) => commit(moveState(statesRef.current, id, delta))}
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
              <StateSettings state={state} onChange={(patch) => commit(updateState(statesRef.current, state.id, patch))} />
            </div>
          )}
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GraphCanvas
            key={state.id}
            graph={state.graph}
            onChange={onGraphChange}
            selectedId={selected ? selected.id : null}
            onSelect={(id) => {
              setSelectedNodeId(id)
              if (id) setRightTab('node')
            }}
            issues={issuesByNode}
            summaryContext={summaryContext}
          />
          {isEmptyGraph(state) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4" data-testid="template-start">
              <div className="pointer-events-auto max-w-md rounded-md border border-border bg-background/95 p-3 shadow-md">
                <p className="mb-2 text-xs text-muted-foreground">Nothing happens yet. Add a node (Tab, right-click or “Add node”), or start from a template:</p>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TEMPLATES.map((t) => {
                    const Icon = iconFor(t.icon)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        title={t.description}
                        onClick={() => onApplyTemplate(t)}
                        className="inline-flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-accent"
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* inspector / problems */}
      <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-muted/10">
        <div role="tablist" aria-label="Inspector" className="flex shrink-0 items-center border-b border-border">
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'node'}
            onClick={() => setRightTab('node')}
            className={cn('px-3 py-1.5 text-xs font-medium', rightTab === 'node' ? 'border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            Node
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
            <div className="p-3" data-testid="node-inspector">
              <div className="mb-2 flex items-start gap-2">
                <CommandIcon icon={def?.icon} category={def?.category} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold">{structural?.label ?? def?.label ?? 'Unknown command'}</h3>
                    {def?.status === 'planned' && <PlannedBadge />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{structural?.description ?? def?.description ?? `“${selected.type}” is not in the command catalog.`}</p>
                  {def?.status === 'planned' && <p className="mt-0.5 text-[10px] text-muted-foreground/80">Planned: you can place it now; the game skips it until that system exists.</p>}
                </div>
              </div>
              {selectedIssues.length > 0 && (
                <ul className="mb-2 space-y-0.5" data-testid="node-issues">
                  {selectedIssues.map((i, n) => (
                    <li key={n} className={cn('flex items-start gap-1 text-[11px]', i.severity === 'error' ? 'text-red-400' : 'text-amber-400')}>
                      {i.severity === 'error' ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
              {!structural && (
                <ParamForm
                  key={selected.id}
                  command={selected}
                  onPatch={(patch) => {
                    const cur = statesRef.current.find((p) => p.id === state.id)
                    if (cur) commit(updateState(statesRef.current, state.id, { graph: updateNodeParams(cur.graph, selected.id, patch) }))
                  }}
                />
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground" data-testid="no-selection">
              Select a node to edit its parameters.
              <br />
              <span className="text-[10px]">Drag from a node’s right handle to connect it, or drop the wire on empty canvas to add a node.</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
