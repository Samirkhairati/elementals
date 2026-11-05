import { useEffect, useRef } from 'react'
import { isTypingTarget, matchActions, resolveBindings, shortcutAction } from '@/lib/shortcuts'
import { useShortcutStore } from '@/store/shortcutStore'

export type ShortcutHandlers = Record<string, ((e: KeyboardEvent) => void) | undefined>

/**
 * Runs the handler of every registered action whose binding matches the key press (see lib/shortcuts for the catalogue).
 * A handler may call `e.preventDefault()`; it is called with the latest closure, so no dependency list is needed.
 * Plain keys do not fire while typing in a field or inside a dialog; combos marked `inTextFields` do.
 * Pass `enabled: false` to pause the whole set (a modal mode, say).
 */
export function useShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  const latest = useRef(handlers)
  latest.current = handlers
  const overrides = useShortcutStore(s => s.overrides)

  useEffect(() => {
    if (!enabled) return
    const bindings = resolveBindings(overrides)
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const hits = matchActions(e, bindings)
      if (hits.length === 0) return
      const typing = isTypingTarget(e.target)
      for (const id of hits) {
        const handler = latest.current[id]
        if (!handler) continue
        if (typing && !shortcutAction(id)?.inTextFields) continue
        handler(e)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overrides, enabled])
}
