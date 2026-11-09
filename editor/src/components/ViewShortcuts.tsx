import { useLocation, useNavigate } from '@tanstack/react-router'
import { useShortcuts, type ShortcutHandlers } from '@/hooks/useShortcuts'
import { MAIN_VIEWS, cycleView, viewAt } from '@/lib/views'

/** Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+1..9 between the main views. Renders nothing. */
export function ViewShortcuts() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const go = (url: string, e: KeyboardEvent) => {
    e.preventDefault()
    if (url !== pathname) void navigate({ to: url, search: {} as never })
  }
  const handlers: ShortcutHandlers = {
    'view.next': e => go(cycleView(pathname, 1).url, e),
    'view.prev': e => go(cycleView(pathname, -1).url, e),
  }
  for (let n = 1; n <= MAIN_VIEWS.length; n++) {
    const view = viewAt(n)
    if (view) handlers[`view.go${n}`] = e => go(view.url, e)
  }
  useShortcuts(handlers)
  return null
}
