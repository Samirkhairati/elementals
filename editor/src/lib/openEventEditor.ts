import { OPEN_EVENT_EDITOR_EVENT } from '@/components/editor/events/EventComponentEditor'

/**
 * Asks the event editor dialog of an entity to open (the Event card of the inspector listens for it).
 * The entity must be the selected one so its inspector card is mounted; `delay` (ms) leaves room for a
 * selection change made in the same tick to render first.
 */
export function openEventEditor(entityId: string, delay = 0): void {
  const fire = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT_EDITOR_EVENT, { detail: entityId }))
  if (delay > 0) setTimeout(fire, delay)
  else fire()
}
