import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Plus, Search, Trash2, TriangleAlert } from 'lucide-react'
import type { SwitchDef, VariableDef } from '../../../../../shared/engine/types'
import { cn } from '@/lib/utils'
import { countEvents, describeRefs, scanDatabaseUsage, type UsageMap, type UsageRef } from '@/lib/databaseUsage'

export interface DatabasePanelProps {
  switches: SwitchDef[]
  variables: VariableDef[]
  /** Every map of the project (usage is counted across all of them). */
  maps: UsageMap[]
  addSwitch: (name?: string) => string
  renameSwitch: (id: string, name: string) => void
  removeSwitch: (id: string) => void
  addVariable: (name?: string, initial?: number) => string
  renameVariable: (id: string, name: string) => void
  setVariableInitial: (id: string, initial: number) => void
  removeVariable: (id: string) => void
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

// ── one section ─────────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  name: string
  initial?: number
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
  onRemove: (id: string) => void
  emptyText: string
}

function Section({ kind, title, rows, usage, query, onAdd, onRename, onInitial, onRemove, emptyText }: SectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const nameCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(normalizeName(r.name), (m.get(normalizeName(r.name)) ?? 0) + 1)
    return m
  }, [rows])

  const q = query.trim().toLowerCase()
  const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) : rows
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
            {visible.map((row) => {
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
                        {duplicate && <span className="ml-1.5 text-[10px] text-amber-400">duplicate name</span>}
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
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ── the panel ───────────────────────────────────────────────────────────────────────────────────

export function DatabasePanel({
  switches,
  variables,
  maps,
  addSwitch,
  renameSwitch,
  removeSwitch,
  addVariable,
  renameVariable,
  setVariableInitial,
  removeVariable,
}: DatabasePanelProps) {
  const [query, setQuery] = useState('')
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const usage = useMemo(() => scanDatabaseUsage(maps), [maps])

  // Focus (and select) the name of a row that was just added.
  useEffect(() => {
    if (!focusKey) return
    const input = rootRef.current?.querySelector<HTMLInputElement>(`input[data-row-id="${focusKey.replace(/"/g, '\\"')}"]`)
    if (input) {
      input.focus()
      input.select()
      setFocusKey(null)
    }
  }, [focusKey, switches, variables])

  return (
    <div ref={rootRef} className="space-y-1 text-xs" data-testid="database-panel">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or id…"
          aria-label="Filter switches and variables"
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
        onRemove={removeVariable}
      />
    </div>
  )
}
