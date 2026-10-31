// The full event editor: page tabs | page settings + command list | command inspector or problems.
// It is a pure function of `pages`; every edit calls `onChange(newPages)` exactly once.

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Redo2, Undo2 } from 'lucide-react'
import type { Command, EventPage } from '../../../../../shared/engine/types'
import { findCommand, getCommandDef } from '../../../../../shared/engine/commands'
import { createDefaultEventPage } from '../../../../../shared/engine/components'
import { TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { cn } from '@/lib/utils'
import { useEventEnv } from './eventEnv'
import {
  addPage,
  applyTemplate,
  buildValidationContext,
  collectProblems,
  countBySeverity,
  defaultActivePageIndex,
  deletePage,
  duplicatePage,
  groupIssuesByCommand,
  movePage,
  setCommandParams,
  updatePage,
  validatePage,
  type EventTemplate,
  type InsertTarget,
  type Problem,
} from './eventModel'
import { CommandList } from './CommandList'
import { PageTabs } from './PageTabs'
import { PageSettings } from './PageSettings'
import { ParamForm } from './ParamForm'
import { ProblemsList } from './ProblemsList'
import { CommandIcon, PlannedBadge } from './commandStyle'
import { IconButton } from './primitives'

export interface EventEditorProps {
  pages: EventPage[]
  /** Called once per user edit with the complete new page list. */
  onChange: (pages: EventPage[]) => void
  className?: string
}

export function EventEditor({ pages: pagesProp, onChange, className }: EventEditorProps) {
  const env = useEventEnv()
  const pages = useMemo(() => (pagesProp.length > 0 ? pagesProp : [createDefaultEventPage()]), [pagesProp])
  const pagesRef = useRef(pages)
  useLayoutEffect(() => {
    pagesRef.current = pages
  })

  const commit = useCallback(
    (next: EventPage[]) => {
      if (next === pagesRef.current) return
      pagesRef.current = next
      onChange(next)
    },
    [onChange],
  )

  const [selectedPageId, setSelectedPageId] = useState<string>(pages[0].id)
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'command' | 'problems'>('command')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const formRef = useRef<HTMLDivElement>(null)

  const page = pages.find((p) => p.id === selectedPageId) ?? pages[0]
  const pageIndex = pages.indexOf(page)
  const selected = selectedCommandId ? findCommand(page.commands, selectedCommandId) : null

  const vctx = useMemo(() => buildValidationContext(env), [env])
  const problems = useMemo(() => collectProblems(pages, vctx), [pages, vctx])
  const counts = countBySeverity(problems)
  const pageValidation = useMemo(() => validatePage(page, vctx), [page, vctx])
  const issuesByCommand = useMemo(() => groupIssuesByCommand(pageValidation.commandIssues), [pageValidation])
  const startIndex = defaultActivePageIndex(pages, env.variables)

  const commitCommands = useCallback(
    (pageId: string, commands: Command[]) => commit(updatePage(pagesRef.current, pageId, { commands })),
    [commit],
  )

  const onCommandsChange = useCallback(
    (next: Command[], select?: string | null) => {
      commitCommands(page.id, next)
      if (select !== undefined) setSelectedCommandId(select)
      if (select) setRightTab('command')
    },
    [commitCommands, page.id],
  )

  const onApplyTemplate = useCallback(
    (template: EventTemplate, target: InsertTarget) => {
      const result = applyTemplate(pagesRef.current, page.id, template, target)
      commit(result.pages)
      if (result.selectId) {
        setSelectedCommandId(result.selectId)
        setRightTab('command')
      }
    },
    [commit, page.id],
  )

  const selectPage = (id: string) => {
    setSelectedPageId(id)
    setSelectedCommandId(null)
  }

  const jumpToProblem = (p: Problem) => {
    setSelectedPageId(p.pageId)
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
      {/* pages */}
      <aside className="w-[210px] shrink-0 border-r border-border bg-muted/20">
        <PageTabs
          pages={pages}
          selectedId={page.id}
          startIndex={startIndex}
          problems={problems}
          onSelect={selectPage}
          onRename={(id, name) => commit(updatePage(pagesRef.current, id, { name }))}
          onAdd={() => {
            const r = addPage(pagesRef.current)
            commit(r.pages)
            selectPage(r.id)
          }}
          onDuplicate={(id) => {
            const r = duplicatePage(pagesRef.current, id)
            commit(r.pages)
            if (r.id) selectPage(r.id)
          }}
          onDelete={(id) => {
            const remaining = deletePage(pagesRef.current, id)
            commit(remaining)
            if (id === page.id) {
              const idx = Math.min(pageIndex, remaining.length - 1)
              selectPage(remaining[idx].id)
            }
          }}
          onMove={(id, delta) => commit(movePage(pagesRef.current, id, delta))}
        />
      </aside>

      {/* page content */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`Page ${pageIndex + 1}`}>
        <div className="shrink-0 border-b border-border">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            aria-expanded={settingsOpen}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent/40"
          >
            {settingsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="text-xs font-semibold">Page {pageIndex + 1}</span>
            <span className="truncate text-xs text-muted-foreground">
              {page.name.trim() ? `“${page.name.trim()}” · ` : ''}
              {TRIGGER_LABELS[page.trigger]}
              {page.conditions.length > 0 ? ` · ${page.conditions.length} condition${page.conditions.length > 1 ? 's' : ''}` : ' · always eligible'}
            </span>
          </button>
          {settingsOpen && (
            <div className="max-h-[36vh] overflow-y-auto border-t border-border/60">
              <PageSettings page={page} onChange={(patch) => commit(updatePage(pagesRef.current, page.id, patch))} />
            </div>
          )}
        </div>
        <CommandList
          commands={page.commands}
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
            <ProblemsList problems={problems} pages={pages} onJump={jumpToProblem} />
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
                  const cur = pagesRef.current.find((p) => p.id === page.id)
                  if (cur) commitCommands(page.id, setCommandParams(cur.commands, selected.command.id, patch, prune))
                }}
              />
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground" data-testid="no-selection">
              Select a command to edit its parameters.
              <br />
              <span className="text-[10px]">Pages with no commands can start from a template.</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

