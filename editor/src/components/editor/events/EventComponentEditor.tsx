// Inspector card for the Event component: a compact summary and a button that opens the full editor.

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import type { EventPage } from '../../../../../shared/engine/types'
import { TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { createDefaultEventPage } from '../../../../../shared/engine/components'
import { countCommands, getCommandDef, summarizeCommand } from '../../../../../shared/engine/commands'
import type { CustomEditorProps } from '../inspector/customEditors'
import { EditorEventEnvProvider, useEventEnv } from './eventEnv'
import { EventEditorDialog } from './EventEditorDialog'
import { buildSummaryContext, buildValidationContext, collectProblems, countBySeverity, defaultActivePageIndex, pageLabel } from './eventModel'
import { CommandIcon, PlannedBadge } from './commandStyle'
import { SmallButton } from './primitives'

/** Window event other parts of the editor can dispatch to open an entity's event editor: `detail = entity id`. */
export const OPEN_EVENT_EDITOR_EVENT = 'editor:open-event-editor'

const MAX_LINES = 4

export function EventSummary({ pages, onOpen }: { pages: EventPage[]; onOpen: () => void }) {
  const env = useEventEnv()
  const summaryCtx = useMemo(() => buildSummaryContext(env), [env])
  const problems = useMemo(() => collectProblems(pages, buildValidationContext(env)), [pages, env])
  const counts = countBySeverity(problems)
  const startIndex = defaultActivePageIndex(pages, env.variables)
  const shownIndex = startIndex >= 0 ? startIndex : 0
  const shown = pages[shownIndex]
  const lines = shown?.commands.slice(0, MAX_LINES) ?? []
  const extra = Math.max(0, (shown?.commands.length ?? 0) - lines.length)

  return (
    <div className="space-y-2" data-testid="event-summary">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium" data-testid="event-page-count">
          {pages.length} {pages.length === 1 ? 'page' : 'pages'}
        </span>
        {shown && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground" title={startIndex >= 0 ? 'The page that runs with no switch or variable set' : 'No page is eligible before something changes; showing page 1'}>
            {TRIGGER_LABELS[shown.trigger]}
          </span>
        )}
        <span className="ml-auto">
          {counts.errors > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-red-400" data-testid="event-validation" title={problems.filter((p) => p.severity === 'error').map((p) => p.message).join('\n')}>
              <AlertCircle className="h-3 w-3" /> {counts.errors} {counts.errors === 1 ? 'error' : 'errors'}
            </span>
          ) : counts.warnings > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400" data-testid="event-validation" title={problems.map((p) => p.message).join('\n')}>
              <AlertTriangle className="h-3 w-3" /> {counts.warnings} {counts.warnings === 1 ? 'warning' : 'warnings'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400" data-testid="event-validation">
              <CheckCircle2 className="h-3 w-3" /> OK
            </span>
          )}
        </span>
      </div>

      {shown && (
        <div className="rounded border border-border/60 bg-background/40 p-1.5">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {pageLabel(shown, shownIndex)}
            {shown.conditions.length > 0 && ` · ${shown.conditions.length} condition${shown.conditions.length > 1 ? 's' : ''}`}
          </div>
          {lines.length === 0 ? (
            <p className="text-[11px] italic text-muted-foreground">No commands yet</p>
          ) : (
            <ul className="space-y-0.5" data-testid="event-summary-lines">
              {lines.map((c) => {
                const def = getCommandDef(c.type)
                return (
                  <li key={c.id} className="flex items-center gap-1.5">
                    <CommandIcon icon={def?.icon} category={def?.category} />
                    <span className="min-w-0 flex-1 truncate text-[11px]" title={summarizeCommand(c, summaryCtx)}>
                      {summarizeCommand(c, summaryCtx)}
                    </span>
                    {def?.status === 'planned' && <PlannedBadge />}
                  </li>
                )
              })}
              {extra > 0 && <li className="pl-6 text-[10px] text-muted-foreground">+{extra} more ({countCommands(shown.commands)} in total)</li>}
            </ul>
          )}
        </div>
      )}

      <SmallButton variant="primary" className="w-full justify-center" onClick={onOpen}>
        <ExternalLink className="h-3 w-3" /> Open event editor
      </SmallButton>
    </div>
  )
}

function EventCardBody({ entityId, value, onChange }: CustomEditorProps) {
  const [open, setOpen] = useState(false)
  const pages = useMemo<EventPage[]>(() => {
    const list = Array.isArray(value?.pages) ? (value.pages as EventPage[]) : []
    return list.length > 0 ? list : [createDefaultEventPage()]
  }, [value])

  // Lets the canvas / entity list open the editor for an entity without importing this file.
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === entityId) setOpen(true)
    }
    window.addEventListener(OPEN_EVENT_EDITOR_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT_EDITOR_EVENT, handler)
  }, [entityId])

  return (
    <>
      <EventSummary pages={pages} onOpen={() => setOpen(true)} />
      {open && <EventEditorDialog open={open} onOpenChange={setOpen} pages={pages} onChange={(next) => onChange('pages', next)} />}
    </>
  )
}

/** Registered in `CUSTOM_EDITORS.Event`. */
export function EventComponentEditor(props: CustomEditorProps) {
  return (
    <EditorEventEnvProvider entityId={props.entityId}>
      <EventCardBody {...props} />
    </EditorEventEnvProvider>
  )
}
