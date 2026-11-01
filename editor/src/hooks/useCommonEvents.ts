import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CommonEvent } from '../../../shared/engine/common'
import type { EventGraph } from '../../../shared/engine/types'
import { createGraph } from '../../../shared/engine/graph'
import { createSaveQueue, DEFAULT_SAVE_DELAY_MS, type SaveQueue } from '@/lib/saveQueue'
import { runIpc } from '@/lib/opResult'
import { idFromName } from '@/hooks/useDatabase'

export interface UseCommonEventsOptions {
  delayMs?: number
  /** Inject a queue (tests). */
  queue?: SaveQueue
}

export interface UseCommonEvents {
  /** Sorted by id; empty until the first load finished. */
  events: CommonEvent[]
  loading: boolean
  error: string | null
  getEvent: (id: string | null | undefined) => CommonEvent | undefined
  /** Creates an empty common event and returns its id (ids come from the name and never change). */
  addEvent: (name?: string) => string
  renameEvent: (id: string, name: string) => void
  setEventGraph: (id: string, graph: EventGraph) => void
  setEventFolder: (id: string, folder: string) => void
  removeEvent: (id: string) => void
  flush: () => Promise<void>
}

const saveKey = (id: string) => `common:${id}`

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`
}

/**
 * The project's common events (`project/common/<id>.json`): each one is saved on its own after a short
 * debounce, deleted files are removed right away. Ids are file names, so they are slugs of the name at creation.
 */
export function useCommonEvents(options: UseCommonEventsOptions = {}): UseCommonEvents {
  const [events, setEvents] = useState<CommonEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<CommonEvent[]>([])

  const queue = useMemo(
    () => options.queue ?? createSaveQueue({ delayMs: options.delayMs ?? DEFAULT_SAVE_DELAY_MS }),
    // The queue identity must not change after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const result = await runIpc(
        () => window.electronAPI?.getCommonEvents(),
        (r) => ({ events: Array.isArray(r.events) ? r.events : [] })
      )
      if (!alive) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Edits made before the load finished win over what was on disk.
      const known = new Set(ref.current.map((e) => e.id))
      ref.current = [...ref.current, ...result.events.filter((e) => !known.has(e.id))].sort((a, b) => (a.id < b.id ? -1 : 1))
      setEvents(ref.current)
      setError(null)
    })()
    const flushAll = () => void queue.flushAll()
    window.addEventListener('beforeunload', flushAll)
    return () => {
      alive = false
      window.removeEventListener('beforeunload', flushAll)
      void queue.flushAll()
    }
  }, [queue])

  const persist = useCallback(
    (id: string) => {
      queue.schedule(saveKey(id), async () => {
        const ev = ref.current.find((e) => e.id === id)
        if (!ev || ev.name.trim() === '') return // invalid names never reach disk; the next edit retries
        const result = await runIpc(
          () => window.electronAPI?.saveCommonEvent(ev),
          () => ({})
        )
        setError(result.ok ? null : result.error)
      })
    },
    [queue]
  )

  const update = useCallback(
    (id: string, change: (e: CommonEvent) => CommonEvent) => {
      const cur = ref.current.find((e) => e.id === id)
      if (!cur) return
      const next = change(cur)
      if (next === cur) return
      ref.current = ref.current.map((e) => (e.id === id ? next : e))
      setEvents(ref.current)
      persist(id)
    },
    [persist]
  )

  const addEvent = useCallback(
    (name = '') => {
      const id = uniqueId(idFromName(name, 'common_event'), new Set(ref.current.map((e) => e.id)))
      const ev: CommonEvent = { version: 1, id, name: name.trim() || `Common event ${ref.current.length + 1}`, graph: createGraph() }
      ref.current = [...ref.current, ev].sort((a, b) => (a.id < b.id ? -1 : 1))
      setEvents(ref.current)
      persist(id)
      return id
    },
    [persist]
  )

  const renameEvent = useCallback((id: string, name: string) => update(id, (e) => (e.name === name ? e : { ...e, name })), [update])
  const setEventGraph = useCallback((id: string, graph: EventGraph) => update(id, (e) => (e.graph === graph ? e : { ...e, graph })), [update])
  const setEventFolder = useCallback(
    (id: string, folder: string) =>
      update(id, (e) => {
        const clean = folder
          .split('/')
          .map((p) => p.trim())
          .filter(Boolean)
          .join('/')
        if ((e.folder ?? '') === clean) return e
        const { folder: _old, ...rest } = e
        void _old
        return clean ? { ...rest, folder: clean } : rest
      }),
    [update]
  )

  const removeEvent = useCallback(
    (id: string) => {
      if (!ref.current.some((e) => e.id === id)) return
      queue.cancel(saveKey(id))
      ref.current = ref.current.filter((e) => e.id !== id)
      setEvents(ref.current)
      void runIpc(
        () => window.electronAPI?.deleteCommonEvent(id),
        () => ({})
      ).then((r) => setError(r.ok ? null : r.error))
    },
    [queue]
  )

  const getEvent = useCallback((id: string | null | undefined) => (id ? events.find((e) => e.id === id) : undefined), [events])
  const flush = useCallback(() => queue.flushAll(), [queue])

  return { events, loading, error, getEvent, addEvent, renameEvent, setEventGraph, setEventFolder, removeEvent, flush }
}
