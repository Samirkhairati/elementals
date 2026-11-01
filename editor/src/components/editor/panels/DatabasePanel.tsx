import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Pencil, Plus, Search, Trash2, TriangleAlert } from 'lucide-react'
import type { CommonEvent } from '../../../../../shared/engine/common'
import type { EventGraph, StageDef, SwitchDef, VariableDef } from '../../../../../shared/engine/types'
import { cn } from '@/lib/utils'
import { countAccess, countEvents, describeRefs, scanCommonEventUsage, scanDatabaseUsage, type UsageMap, type UsageRef } from '@/lib/databaseUsage'
import { CommonEventDialog } from '../events/CommonEventDialog'

export interface DatabasePanelProps {
  switches: SwitchDef[]
  variables: VariableDef[]
  stages: StageDef[]
  /** Every map of the project (usage is counted across all of them). */
  maps: UsageMap[]
  addSwitch: (name?: string) => string
  renameSwitch: (id: string, name: string) => void
  removeSwitch: (id: string) => void
  addVariable: (name?: string, initial?: number) => string
  renameVariable: (id: string, name: string) => void
  setVariableInitial: (id: string, initial: number) => void
  removeVariable: (id: string) => void
  addStage: (name?: string) => string
  renameStage: (id: string, name: string) => void
  removeStage: (id: string) => void
  addStageValue: (stageId: string, name?: string) => string
  renameStageValue: (stageId: string, valueId: string, name: string) => void
  removeStageValue: (stageId: string, valueId: string) => void
  moveStageValue: (stageId: string, valueId: string, delta: -1 | 1) => void
  setStageInitial: (stageId: string, valueId: string) => void
  /** Groups an entry ("Quests/Lost cat"); '' removes the folder. */
  setFolder: (kind: 'switch' | 'variable' | 'stage', id: string, folder: string) => void
  /** Common events (project/common); the section is hidden when `commonEvents` is not provided. */
  commonEvents?: CommonEvent[]
  addCommonEvent?: (name?: string) => string
  renameCommonEvent?: (id: string, name: string) => void
  removeCommonEvent?: (id: string) => void
  setCommonEventGraph?: (id: string, graph: EventGraph) => void
}

type Kind = 'switch' | 'variable'

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

// ── small parts ─────────────────────────────────────────────────────────────────────────────────

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      title={copied ? 'Copied' : `Copy id “${id}”`}
      aria-label={`Copy id ${id}`}
      onClick={() => {
        void Promise.resolve(navigator.clipboard?.writeText(id)).catch(() => undefined)
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1200)
      }}
      className="group/id inline-flex max-w-full items-center gap-1 rounded text-[10px] text-muted-foreground/70 hover:text-foreground"
    >
      <span className="truncate font-mono">{id}</span>
      {copied ? <Check className="h-2.5 w-2.5 shrink-0 text-emerald-400" /> : <Copy className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover/id:opacity-100" />}
    </button>
  )
}

/**
 * Name field with inline validation. A valid name is committed on blur/Enter; an invalid one (empty or
 * a duplicate) stays in the field with the reason shown, and nothing is written until it is fixed.
 */
function NameField({ value, rowId, validate, onCommit, label }: { value: string; rowId: string; validate: (name: string) => string | null; onCommit: (name: string) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  const typedError = draft !== null ? validate(draft) : null
  const storedError = draft === null ? validate(value) : null
  const error = typedError ?? storedError

  const commit = () => {
    if (draft === null) return
    if (validate(draft) === null) {
      if (draft.trim() !== value) onCommit(draft.trim())
      setDraft(null)
    }
  }

  return (
    <div className="min-w-0">
      <input
        data-row-id={rowId}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setDraft(null)
        }}
        className={cn(
          'h-6 w-full min-w-0 rounded border bg-background/50 px-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-primary',
          error ? 'border-red-500/60' : 'border-input/60',
        )}
      />
      {error && (
        <p role="alert" className="mt-0.5 flex items-center gap-1 text-[10px] text-red-400">
          <TriangleAlert className="h-2.5 w-2.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

function NumberField({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(n)
    setDraft(null)
  }
  return (
    <input
      type="number"
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') setDraft(null)
      }}
      className="h-6 w-full min-w-0 rounded border border-input/60 bg-background/50 px-1.5 text-right text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
    />
  )
}

/** Folder path of an entry: committed on blur/Enter, Escape reverts. */
function FolderField({ value, onCommit, label }: { value: string; onCommit: (folder: string) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== value) onCommit(draft.trim())
    setDraft(null)
  }
  return (
    <input
      aria-label={label}
      placeholder="folder"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') setDraft(null)
      }}
      className="h-5 w-24 min-w-0 rounded border border-transparent bg-transparent px-1 text-[10px] text-muted-foreground outline-none hover:border-input/60 focus:border-input focus:ring-1 focus:ring-primary"
    />
  )
}

/** "read but never set" / "set but never read": the two usual mistakes. */
function AccessHints({ refs }: { refs: UsageRef[] | undefined }) {
  const { reads, writes } = countAccess(refs)
  if (reads > 0 && writes === 0) return <span className="ml-1.5 text-[10px] text-amber-400" title="Something reads it, but nothing ever changes it">never set</span>
  if (writes > 0 && reads === 0) return <span className="ml-1.5 text-[10px] text-amber-400" title="Something changes it, but nothing ever reads it">never read</span>
  return null
}

/** Rows grouped by folder: ungrouped first, then folders alphabetically. */
function groupByFolder<T extends { folder?: string }>(rows: T[]): { folder: string; rows: T[] }[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const key = r.folder ?? ''
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([folder, list]) => ({ folder, rows: list }))
}

// ── one section ─────────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  name: string
  initial?: number
  folder?: string
}

interface SectionProps {
  kind: Kind
  title: string
  rows: Row[]
  usage: Record<string, UsageRef[]>
  query: string
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onInitial?: (id: string, n: number) => void
  onFolder: (id: string, folder: string) => void
  onRemove: (id: string) => void
  emptyText: string
}

function Section({ kind, title, rows, usage, query, onAdd, onRename, onInitial, onFolder, onRemove, emptyText }: SectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const nameCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(normalizeName(r.name), (m.get(normalizeName(r.name)) ?? 0) + 1)
    return m
  }, [rows])

  const q = query.trim().toLowerCase()
  const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.folder ?? '').toLowerCase().includes(q)) : rows
  const columns = kind === 'variable' ? 4 : 3
  const noun = kind === 'switch' ? 'switch' : 'variable'

  const validateFor = (row: Row) => (name: string): string | null => {
    const n = normalizeName(name)
    if (!n) return 'Name cannot be empty'
    const clash = rows.some((r) => r.id !== row.id && normalizeName(r.name) === n)
    return clash ? `Another ${noun} is already called “${name.trim()}”` : null
  }

  return (
    <section aria-label={title} data-testid={kind === 'switch' ? 'switches-section' : 'variables-section'}>
      <div className="flex items-center justify-between gap-2 pb-1 pt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title} <span className="ml-1 rounded bg-muted px-1 font-normal normal-case">{rows.length}</span>
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3 w-3" /> Add {noun}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-border/70 px-2 py-3 text-center text-[11px] text-muted-foreground">{emptyText}</p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-2 text-center text-[11px] text-muted-foreground">No {noun} matches “{query}”.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-xs" aria-label={title}>
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/80">
              <th className="px-1 pb-1 font-medium">Name</th>
              {kind === 'variable' && <th className="w-16 px-1 pb-1 text-right font-medium">Initial</th>}
              <th className="w-[4.5rem] px-1 pb-1 text-right font-medium">Used in</th>
              <th className="w-6 pb-1" />
            </tr>
          </thead>
          <tbody>
            {groupByFolder(visible).flatMap((group) => [
              ...(group.folder
                ? [
                    <tr key={`folder:${group.folder}`} data-folder={group.folder}>
                      <th colSpan={columns} scope="colgroup" className="px-1 pb-0.5 pt-2 text-left text-[10px] font-medium text-muted-foreground">
                        {group.folder}
                      </th>
                    </tr>,
                  ]
                : []),
              ...group.rows.map((row) => {
              const refs = usage[row.id]
              const events = countEvents(refs)
              const duplicate = (nameCounts.get(normalizeName(row.name)) ?? 0) > 1
              const isConfirming = confirming === row.id
              return (
                <React.Fragment key={row.id}>
                  <tr className="align-top" data-row-id={row.id}>
                    <td className="px-1 py-1">
                      <NameField
                        value={row.name}
                        rowId={`${kind}:${row.id}`}
                        label={`${kind === 'switch' ? 'Switch' : 'Variable'} name`}
                        validate={validateFor(row)}
                        onCommit={(name) => onRename(row.id, name)}
                      />
                      <div className="mt-0.5 px-0.5">
                        <CopyId id={row.id} />
                        <FolderField value={row.folder ?? ''} label={`Folder of ${row.name}`} onCommit={(folder) => onFolder(row.id, folder)} />
                        {duplicate && <span className="ml-1.5 text-[10px] text-amber-400">duplicate name</span>}
                        <AccessHints refs={refs} />
                      </div>
                    </td>
                    {kind === 'variable' && onInitial && (
                      <td className="px-1 py-1">
                        <NumberField value={row.initial ?? 0} label={`Initial value of ${row.name}`} onCommit={(n) => onInitial(row.id, n)} />
                      </td>
                    )}
                    <td className="px-1 py-1 text-right">
                      {events > 0 ? (
                        <button
                          type="button"
                          aria-expanded={expanded === row.id}
                          title="Show where it is used"
                          onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                          className="h-6 rounded px-1.5 text-[11px] text-foreground underline decoration-dotted underline-offset-2 hover:bg-accent"
                        >
                          {events} {events === 1 ? 'event' : 'events'}
                        </button>
                      ) : (
                        <span className="inline-block h-6 px-1.5 text-[11px] leading-6 text-muted-foreground/70">unused</span>
                      )}
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        title={`Delete ${row.name}`}
                        aria-label={`Delete ${row.name}`}
                        onClick={() => {
                          if (events === 0) onRemove(row.id)
                          else setConfirming(isConfirming ? null : row.id)
                        }}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                  {expanded === row.id && events > 0 && (
                    <tr>
                      <td colSpan={kind === 'variable' ? 4 : 3} className="px-1 pb-1">
                        <ul className="rounded bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground" aria-label={`Where ${row.name} is used`}>
                          {describeRefs(refs).map((line) => (
                            <li key={line} className="truncate" title={line}>
                              {line}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                  {isConfirming && (
                    <tr>
                      <td colSpan={kind === 'variable' ? 4 : 3} className="px-1 pb-2">
                        <div role="alertdialog" aria-label={`Delete ${row.name}?`} className="rounded border border-amber-500/40 bg-amber-500/10 p-2">
                          <p className="text-[11px] text-amber-300">
                            “{row.name}” is used by {events} {events === 1 ? 'event' : 'events'}. They will show an error until you pick something else.
                          </p>
                          <ul className="mt-1 max-h-24 overflow-y-auto text-[10px] text-muted-foreground">
                            {describeRefs(refs).map((line) => (
                              <li key={line} className="truncate">
                                {line}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-1.5 flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirming(null)
                                onRemove(row.id)
                              }}
                              className="h-6 rounded border border-red-500/40 bg-red-500/10 px-2 text-[11px] text-red-400 hover:bg-red-500/20"
                            >
                              Delete anyway
                            </button>
                            <button type="button" onClick={() => setConfirming(null)} className="h-6 rounded border border-border px-2 text-[11px] hover:bg-accent">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
              }),
            ])}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ── the panel ───────────────────────────────────────────────────────────────────────────────────

interface StagesSectionProps {
  stages: StageDef[]
  usage: Record<string, UsageRef[]>
  query: string
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onAddValue: (stageId: string) => void
  onRenameValue: (stageId: string, valueId: string, name: string) => void
  onRemoveValue: (stageId: string, valueId: string) => void
  onMoveValue: (stageId: string, valueId: string, delta: -1 | 1) => void
  onInitial: (stageId: string, valueId: string) => void
  onFolder: (id: string, folder: string) => void
}

/** Stages: progress through ordered named values (a quest, a story act). The order is what conditions compare. */
function StagesSection({ stages, usage, query, onAdd, onRename, onRemove, onAddValue, onRenameValue, onRemoveValue, onMoveValue, onInitial, onFolder }: StagesSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const visible = q
    ? stages.filter((st) => st.name.toLowerCase().includes(q) || st.id.toLowerCase().includes(q) || (st.folder ?? '').toLowerCase().includes(q) || st.values.some((v) => v.name.toLowerCase().includes(q)))
    : stages

  return (
    <section aria-label="Stages" data-testid="stages-section">
      <div className="flex items-center justify-between gap-2 pb-1 pt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Stages <span className="ml-1 rounded bg-muted px-1 font-normal normal-case">{stages.length}</span>
        </h3>
        <button type="button" onClick={onAdd} className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-3 w-3" /> Add stage
        </button>
      </div>
      {stages.length === 0 ? (
        <p className="rounded border border-dashed border-border/70 px-2 py-3 text-center text-[11px] text-muted-foreground">
          No stages yet. A stage is progress through named steps, like a quest: Not started → Accepted → Done. Use it instead of several switches.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-2 text-center text-[11px] text-muted-foreground">No stage matches “{query}”.</p>
      ) : (
        <div className="space-y-2">
          {groupByFolder(visible).map((group) => (
            <div key={group.folder} data-folder={group.folder || undefined}>
              {group.folder && <p className="px-1 pb-0.5 text-[10px] font-medium text-muted-foreground">{group.folder}</p>}
              <ul className="space-y-2">
                {group.rows.map((stage) => {
                  const refs = usage[stage.id]
                  const events = countEvents(refs)
                  const isConfirming = confirming === stage.id
                  return (
                    <li key={stage.id} className="rounded border border-border/60 bg-background/30 p-1.5" data-row-id={stage.id}>
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1">
                          <NameField
                            value={stage.name}
                            rowId={`stage:${stage.id}`}
                            label="Stage name"
                            validate={(name) => {
                              const n = normalizeName(name)
                              if (!n) return 'Name cannot be empty'
                              return stages.some((o) => o.id !== stage.id && normalizeName(o.name) === n) ? `Another stage is already called “${name.trim()}”` : null
                            }}
                            onCommit={(name) => onRename(stage.id, name)}
                          />
                          <div className="mt-0.5 px-0.5">
                            <CopyId id={stage.id} />
                            <FolderField value={stage.folder ?? ''} label={`Folder of ${stage.name}`} onCommit={(folder) => onFolder(stage.id, folder)} />
                            <AccessHints refs={refs} />
                          </div>
                        </div>
                        {events > 0 ? (
                          <button
                            type="button"
                            aria-expanded={expanded === stage.id}
                            title="Show where it is used"
                            onClick={() => setExpanded(expanded === stage.id ? null : stage.id)}
                            className="h-6 shrink-0 rounded px-1.5 text-[11px] underline decoration-dotted underline-offset-2 hover:bg-accent"
                          >
                            {events} {events === 1 ? 'event' : 'events'}
                          </button>
                        ) : (
                          <span className="inline-block h-6 shrink-0 px-1.5 text-[11px] leading-6 text-muted-foreground/70">unused</span>
                        )}
                        <button
                          type="button"
                          title={`Delete ${stage.name}`}
                          aria-label={`Delete ${stage.name}`}
                          onClick={() => (events === 0 ? onRemove(stage.id) : setConfirming(isConfirming ? null : stage.id))}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      <ol className="mt-1.5 space-y-1" aria-label={`Values of ${stage.name}`}>
                        {stage.values.map((value, index) => (
                          <li key={value.id} className="flex items-center gap-1" data-value-id={value.id}>
                            <span className="w-4 shrink-0 text-right text-[10px] text-muted-foreground">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <NameField
                                value={value.name}
                                rowId={`stagevalue:${stage.id}:${value.id}`}
                                label={`Value ${index + 1} of ${stage.name}`}
                                validate={(name) => {
                                  const n = normalizeName(name)
                                  if (!n) return 'Name cannot be empty'
                                  return stage.values.some((o) => o.id !== value.id && normalizeName(o.name) === n) ? 'Another value has this name' : null
                                }}
                                onCommit={(name) => onRenameValue(stage.id, value.id, name)}
                              />
                            </div>
                            <label className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground" title="The value a new game starts with">
                              <input type="radio" name={`initial-${stage.id}`} checked={stage.initial === value.id} onChange={() => onInitial(stage.id, value.id)} aria-label={`${value.name} is the starting value`} />
                              start
                            </label>
                            <button type="button" title="Move earlier" aria-label={`Move ${value.name} earlier`} disabled={index === 0} onClick={() => onMoveValue(stage.id, value.id, -1)} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30">
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button type="button" title="Move later" aria-label={`Move ${value.name} later`} disabled={index === stage.values.length - 1} onClick={() => onMoveValue(stage.id, value.id, 1)} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30">
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            <button type="button" title="Delete value" aria-label={`Delete ${value.name}`} disabled={stage.values.length <= 1} onClick={() => onRemoveValue(stage.id, value.id)} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-500/15 hover:text-red-400 disabled:opacity-30">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ol>
                      <button type="button" onClick={() => onAddValue(stage.id)} className="mt-1 inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-primary hover:bg-accent">
                        <Plus className="h-2.5 w-2.5" /> Add value
                      </button>

                      {expanded === stage.id && events > 0 && (
                        <ul className="mt-1 rounded bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground" aria-label={`Where ${stage.name} is used`}>
                          {describeRefs(refs).map((line) => (
                            <li key={line} className="truncate" title={line}>
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                      {isConfirming && (
                        <div role="alertdialog" aria-label={`Delete ${stage.name}?`} className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 p-2">
                          <p className="text-[11px] text-amber-300">
                            “{stage.name}” is used by {events} {events === 1 ? 'event' : 'events'}. They will show an error until you pick something else.
                          </p>
                          <div className="mt-1.5 flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirming(null)
                                onRemove(stage.id)
                              }}
                              className="h-6 rounded border border-red-500/40 bg-red-500/10 px-2 text-[11px] text-red-400 hover:bg-red-500/20"
                            >
                              Delete anyway
                            </button>
                            <button type="button" onClick={() => setConfirming(null)} className="h-6 rounded border border-border px-2 text-[11px] hover:bg-accent">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function DatabasePanel({
  switches,
  variables,
  stages,
  maps,
  addSwitch,
  renameSwitch,
  removeSwitch,
  addVariable,
  renameVariable,
  setVariableInitial,
  removeVariable,
  addStage,
  renameStage,
  removeStage,
  addStageValue,
  renameStageValue,
  removeStageValue,
  moveStageValue,
  setStageInitial,
  setFolder,
  commonEvents,
  addCommonEvent,
  renameCommonEvent,
  removeCommonEvent,
  setCommonEventGraph,
}: DatabasePanelProps) {
  const [query, setQuery] = useState('')
  const [editingCommon, setEditingCommon] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const usage = useMemo(() => scanDatabaseUsage(maps), [maps])
  const commonUsage = useMemo(() => scanCommonEventUsage(maps, commonEvents ?? []), [maps, commonEvents])

  // Focus (and select) the name of a row that was just added.
  useEffect(() => {
    if (!focusKey) return
    const input = rootRef.current?.querySelector<HTMLInputElement>(`input[data-row-id="${focusKey.replace(/"/g, '\\"')}"]`)
    if (input) {
      input.focus()
      input.select()
      setFocusKey(null)
    }
  }, [focusKey, switches, variables, stages])

  return (
    <div ref={rootRef} className="space-y-1 text-xs" data-testid="database-panel">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or id…"
          aria-label="Filter switches, variables and stages"
          className="h-6 w-full rounded border border-input/60 bg-background/50 pl-7 pr-2 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <Section
        kind="switch"
        title="Switches"
        rows={switches}
        usage={usage.switches}
        query={query}
        emptyText="No switches yet. A switch is a global ON/OFF flag, like “Met the professor”."
        onAdd={() => {
          setQuery('')
          const id = addSwitch()
          if (id) setFocusKey(`switch:${id}`)
        }}
        onRename={renameSwitch}
        onFolder={(id, folder) => setFolder('switch', id, folder)}
        onRemove={removeSwitch}
      />
      <Section
        kind="variable"
        title="Variables"
        rows={variables}
        usage={usage.variables}
        query={query}
        emptyText="No variables yet. A variable is a global number, like “Badges earned”."
        onAdd={() => {
          setQuery('')
          const id = addVariable()
          if (id) setFocusKey(`variable:${id}`)
        }}
        onRename={renameVariable}
        onInitial={setVariableInitial}
        onFolder={(id, folder) => setFolder('variable', id, folder)}
        onRemove={removeVariable}
      />
      <StagesSection
        stages={stages}
        usage={usage.stages}
        query={query}
        onAdd={() => {
          setQuery('')
          const id = addStage()
          if (id) setFocusKey(`stage:${id}`)
        }}
        onRename={renameStage}
        onRemove={removeStage}
        onAddValue={(stageId) => {
          const valueId = addStageValue(stageId)
          if (valueId) setFocusKey(`stagevalue:${stageId}:${valueId}`)
        }}
        onRenameValue={renameStageValue}
        onRemoveValue={removeStageValue}
        onMoveValue={moveStageValue}
        onInitial={setStageInitial}
        onFolder={(id, folder) => setFolder('stage', id, folder)}
      />
      {commonEvents && addCommonEvent && renameCommonEvent && removeCommonEvent && setCommonEventGraph && (
        <>
          <CommonEventsSection
            events={commonEvents}
            usage={commonUsage}
            query={query}
            onAdd={() => {
              setQuery('')
              const id = addCommonEvent()
              if (id) setFocusKey(`common:${id}`)
            }}
            onRename={renameCommonEvent}
            onRemove={removeCommonEvent}
            onOpen={setEditingCommon}
          />
          <CommonEventDialog event={commonEvents.find((e) => e.id === editingCommon)} onClose={() => setEditingCommon(null)} onGraphChange={setCommonEventGraph} />
        </>
      )}
    </div>
  )
}

function CommonEventsSection({
  events,
  usage,
  query,
  onAdd,
  onRename,
  onRemove,
  onOpen,
}: {
  events: CommonEvent[]
  usage: Record<string, string[]>
  query: string
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onOpen: (id: string) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const visible = q ? events.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)) : events
  const validateFor = (row: CommonEvent) => (name: string): string | null => {
    const n = normalizeName(name)
    if (!n) return 'Name cannot be empty'
    return events.some((e) => e.id !== row.id && normalizeName(e.name) === n) ? `Another common event is already called “${name.trim()}”` : null
  }
  return (
    <section aria-label="Common events" data-testid="common-events-section">
      <div className="flex items-center justify-between gap-2 pb-1 pt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Common events <span className="ml-1 rounded bg-muted px-1 font-normal normal-case">{events.length}</span>
        </h3>
        <button type="button" onClick={onAdd} className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-3 w-3" /> Add common event
        </button>
      </div>
      {events.length === 0 ? (
        <p className="rounded border border-dashed border-border/70 px-2 py-3 text-center text-[11px] text-muted-foreground">No common events yet. A common event is a shared graph any event can call, like “Heal the party”.</p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-2 text-center text-[11px] text-muted-foreground">No common event matches “{query}”.</p>
      ) : (
        <ul className="space-y-1">
          {visible.map((row) => {
            const callers = usage[row.id] ?? []
            return (
              <li key={row.id} data-row-id={row.id} className="rounded border border-border/50 p-1">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <NameField value={row.name} rowId={`common:${row.id}`} label="Common event name" validate={validateFor(row)} onCommit={(name) => onRename(row.id, name)} />
                    <CopyId id={row.id} />
                  </div>
                  <span className="mt-1 w-14 shrink-0 text-right text-[10px] text-muted-foreground" title={callers.join('\n')}>
                    {callers.length === 0 ? 'Unused' : `${callers.length} caller${callers.length > 1 ? 's' : ''}`}
                  </span>
                  <button type="button" aria-label={`Edit ${row.name}`} title="Open the graph" onClick={() => onOpen(row.id)} className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${row.name}`}
                    title="Delete"
                    onClick={() => (callers.length === 0 ? onRemove(row.id) : setConfirming(confirming === row.id ? null : row.id))}
                    className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {confirming === row.id && (
                  <div role="alertdialog" className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-[11px]">
                    <p>Still called from:</p>
                    <ul className="ml-3 list-disc">
                      {callers.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <div className="mt-1 flex gap-1">
                      <button type="button" onClick={() => { onRemove(row.id); setConfirming(null) }} className="rounded bg-red-600 px-2 py-0.5 text-white">
                        Delete anyway
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="rounded border border-border px-2 py-0.5">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
