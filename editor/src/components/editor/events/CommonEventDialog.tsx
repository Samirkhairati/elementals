import React, { useCallback, useMemo, useState } from 'react'
import type { CommonEvent } from '../../../../../shared/engine/common'
import type { EventGraph, EventState } from '../../../../../shared/engine/types'
import { createDefaultEventState } from '../../../../../shared/engine/components'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { EventEnvProvider, EditorEventEnvProvider, useEventEnv } from './eventEnv'
import { EventEditor } from './EventEditor'
import { PortalContainerProvider } from './primitives'

interface CommonEventDialogProps {
  event: CommonEvent | undefined
  onClose: () => void
  onGraphChange: (id: string, graph: EventGraph) => void
}

/** Edits a common event on the same node canvas as an entity event, without states. */
export function CommonEventDialog({ event, onClose, onGraphChange }: CommonEventDialogProps) {
  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      {event && (
        <EditorEventEnvProvider entityId="">
          <CommonEventBody event={event} onGraphChange={onGraphChange} />
        </EditorEventEnvProvider>
      )}
    </Dialog>
  )
}

function CommonEventBody({ event, onGraphChange }: { event: CommonEvent; onGraphChange: (id: string, graph: EventGraph) => void }) {
  const outer = useEventEnv()
  // The editor-wide undo history belongs to the map, not to common events.
  const env = useMemo(() => ({ ...outer, undo: undefined, redo: undefined, canUndo: false, canRedo: false, entityName: undefined }), [outer])
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  // One state that only carries the graph; its id stays stable so the canvas keeps its selection.
  const states = useMemo<EventState[]>(() => [{ ...createDefaultEventState(), id: event.id, name: event.name, graph: event.graph }], [event.id, event.name, event.graph])
  const onChange = useCallback((next: EventState[]) => onGraphChange(event.id, next[0].graph), [event.id, onGraphChange])
  return (
    <EventEnvProvider value={env}>
      <DialogContent
        ref={setContent}
        onEscapeKeyDown={(e) => {
          if (document.querySelector('[data-ev-popover]')) e.preventDefault()
        }}
        className="flex h-[85vh] w-[90vw] max-w-none flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:outline-none sm:rounded-lg"
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          onKeyDown={(e) => {
            if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
          }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
            <DialogTitle className="text-sm font-semibold">Common event · {event.name}</DialogTitle>
            <DialogDescription className="text-xs">Runs for whoever calls it: “this event” and local flags are the caller’s. End returns to the caller.</DialogDescription>
          </header>
          <PortalContainerProvider value={content}>
            <EventEditor common states={states} onChange={onChange} />
          </PortalContainerProvider>
        </div>
      </DialogContent>
    </EventEnvProvider>
  )
}
