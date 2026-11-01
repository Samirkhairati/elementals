import React, { useState } from 'react'
import { Workflow } from 'lucide-react'
import type { EventState } from '../../../../../shared/engine/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useEventEnv } from './eventEnv'
import { EventEditor } from './EventEditor'
import { PortalContainerProvider } from './primitives'

interface EventEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  states: EventState[]
  onChange: (states: EventState[]) => void
}

/** The large modal (about 90vw x 85vh) hosting the full event editor. */
export function EventEditorDialog({ open, onOpenChange, states, onChange }: EventEditorDialogProps) {
  const env = useEventEnv()
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={setContent}
        // The editor has its own popovers (portalled into this element); Escape closes the innermost one first.
        onEscapeKeyDown={(e) => {
          if (document.querySelector('[data-ev-popover]')) e.preventDefault()
        }}
        className="flex h-[85vh] w-[90vw] max-w-none flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:outline-none sm:rounded-lg"
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          // Typing in the editor must not trigger the map editor's global shortcuts (tool keys, delete entity ...).
          onKeyDown={(e) => {
            if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
          }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/20 px-4 py-2.5 pr-12">
            <Workflow className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <DialogTitle className="shrink-0 text-sm font-semibold">Event editor{env.entityName ? ` · ${env.entityName}` : ''}</DialogTitle>
            <DialogDescription className="min-w-0 truncate text-[11px] text-muted-foreground" title="States decide when something runs; the node graph decides what happens. The last state whose conditions hold is the active one.">
              States decide <em className="not-italic text-foreground/80">when</em> it runs, the graph decides <em className="not-italic text-foreground/80">what</em> happens. The last state whose conditions hold wins.
            </DialogDescription>
          </header>
          <PortalContainerProvider value={content}>
            <EventEditor states={states} onChange={onChange} />
          </PortalContainerProvider>
        </div>
      </DialogContent>
    </Dialog>
  )
}
