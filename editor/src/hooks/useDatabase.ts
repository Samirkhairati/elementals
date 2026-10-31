import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameDatabase, SwitchDef, VariableDef } from '../../../shared/engine/types'
import { createSaveQueue, DEFAULT_SAVE_DELAY_MS, type SaveQueue } from '@/lib/saveQueue'
import { runIpc } from '@/lib/opResult'

export interface UseDatabaseOptions {
  /** Debounce before a change is written. Default 300 ms (the map autosave delay). */
  delayMs?: number
  /** Inject a queue (tests). Default: a private queue per hook instance. */
  queue?: SaveQueue
}

export interface UseDatabase {
  /** null until the first load finished. */
  database: GameDatabase | null
  loading: boolean
  /** Last load/save failure, or null. */
  error: string | null
  /** True while a change waits for (or is in) the debounced save. */
  dirty: boolean
  switches: SwitchDef[]
  variables: VariableDef[]
  getSwitch: (id: string | null | undefined) => SwitchDef | undefined
  getVariable: (id: string | null | undefined) => VariableDef | undefined
  /** Each add returns the new id (ids are generated from the name and stay stable when the name changes). */
  addSwitch: (name?: string) => string
  renameSwitch: (id: string, name: string) => void
  removeSwitch: (id: string) => void
  addVariable: (name?: string, initial?: number) => string
  renameVariable: (id: string, name: string) => void
  setVariableInitial: (id: string, initial: number) => void
  removeVariable: (id: string) => void
  /** Write pending changes now. */
  flush: () => Promise<void>
  /** Discard local state and re-read from disk (pending changes are written first). */
  reload: () => Promise<void>
}

const SAVE_KEY = 'database'

/** `Badges earned` -> `badges_earned`; falls back to `fallback`. */
export function idFromName(name: string, fallback: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || fallback
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`
}

/** Invalid values never reach disk: the store would refuse them. Editing a name through "" is allowed locally. */
function isSavable(db: GameDatabase): boolean {
  return [...db.switches, ...db.variables].every((e) => e.name.trim() !== '')
}

/**
 * The project's global switches and variables (`project/database.json`) with debounced autosave through the same
 * `createSaveQueue` pattern as map autosave.
 */
export function useDatabase(options: UseDatabaseOptions = {}): UseDatabase {
  const [database, setDatabase] = useState<GameDatabase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const dbRef = useRef<GameDatabase | null>(null)
  // Latest-wins guard for async loads; bumped on unmount so late answers are ignored.
  const [requests] = useState(() => ({ latest: 0 }))

  const queue = useMemo(
    () =>
      options.queue ??
      createSaveQueue({ delayMs: options.delayMs ?? DEFAULT_SAVE_DELAY_MS }),
    // The queue identity must not change after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const save = useCallback(async () => {
    const db = dbRef.current
    if (!db || !isSavable(db)) {
      setDirty(false)
      return
    }
    const result = await runIpc(
      () => window.electronAPI?.saveDatabase(db),
      () => ({})
    )
    if (!result.ok) {
      setError(result.error) // stays dirty: the next edit (or flush) tries again
      return
    }
    if (dbRef.current === db) setDirty(false)
    setError(null)
  }, [])

  const load = useCallback(async () => {
    const id = ++requests.latest
    setLoading(true)
    const result = await runIpc(
      () => window.electronAPI?.getDatabase(),
      (r) => ({ database: r.database })
    )
    if (id !== requests.latest) return
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    dbRef.current = result.database
    setDatabase(result.database)
    setDirty(false)
    setError(null)
  }, [requests])

  useEffect(() => {
    void load()
    const flushAll = () => void queue.flushAll()
    window.addEventListener('beforeunload', flushAll)
    return () => {
      window.removeEventListener('beforeunload', flushAll)
      requests.latest++
      void queue.flushAll() // do not lose the last edit when the panel closes
    }
  }, [load, queue, requests])

  const update = useCallback(
    (change: (db: GameDatabase) => GameDatabase) => {
      const current = dbRef.current
      if (!current) return // not loaded yet: nothing to edit
      const next = change(current)
      if (next === current) return
      dbRef.current = next
      setDatabase(next)
      setDirty(true)
      queue.schedule(SAVE_KEY, save)
    },
    [queue, save]
  )

  const addSwitch = useCallback(
    (name = '') => {
      let id = ''
      update((db) => {
        id = uniqueId(idFromName(name, 'switch'), new Set(db.switches.map((s) => s.id)))
        return { ...db, switches: [...db.switches, { id, name: name.trim() || `Switch ${db.switches.length + 1}` }] }
      })
      return id
    },
    [update]
  )
  const renameSwitch = useCallback(
    (id: string, name: string) =>
      update((db) =>
        db.switches.some((s) => s.id === id && s.name !== name)
          ? { ...db, switches: db.switches.map((s) => (s.id === id ? { ...s, name } : s)) }
          : db
      ),
    [update]
  )
  const removeSwitch = useCallback(
    (id: string) => update((db) => (db.switches.some((s) => s.id === id) ? { ...db, switches: db.switches.filter((s) => s.id !== id) } : db)),
    [update]
  )

  const addVariable = useCallback(
    (name = '', initial = 0) => {
      let id = ''
      update((db) => {
        id = uniqueId(idFromName(name, 'variable'), new Set(db.variables.map((v) => v.id)))
        return { ...db, variables: [...db.variables, { id, name: name.trim() || `Variable ${db.variables.length + 1}`, initial }] }
      })
      return id
    },
    [update]
  )
  const renameVariable = useCallback(
    (id: string, name: string) =>
      update((db) =>
        db.variables.some((v) => v.id === id && v.name !== name)
          ? { ...db, variables: db.variables.map((v) => (v.id === id ? { ...v, name } : v)) }
          : db
      ),
    [update]
  )
  const setVariableInitial = useCallback(
    (id: string, initial: number) =>
      update((db) =>
        Number.isFinite(initial) && db.variables.some((v) => v.id === id && v.initial !== initial)
          ? { ...db, variables: db.variables.map((v) => (v.id === id ? { ...v, initial } : v)) }
          : db
      ),
    [update]
  )
  const removeVariable = useCallback(
    (id: string) => update((db) => (db.variables.some((v) => v.id === id) ? { ...db, variables: db.variables.filter((v) => v.id !== id) } : db)),
    [update]
  )

  const flush = useCallback(() => queue.flush(SAVE_KEY), [queue])
  const reload = useCallback(async () => {
    await queue.flushAll()
    await load()
  }, [queue, load])

  const getSwitch = useCallback((id: string | null | undefined) => (id ? database?.switches.find((s) => s.id === id) : undefined), [database])
  const getVariable = useCallback((id: string | null | undefined) => (id ? database?.variables.find((v) => v.id === id) : undefined), [database])

  return {
    database,
    loading,
    error,
    dirty,
    switches: database?.switches ?? EMPTY_SWITCHES,
    variables: database?.variables ?? EMPTY_VARIABLES,
    getSwitch,
    getVariable,
    addSwitch,
    renameSwitch,
    removeSwitch,
    addVariable,
    renameVariable,
    setVariableInitial,
    removeVariable,
    flush,
    reload,
  }
}

const EMPTY_SWITCHES: SwitchDef[] = []
const EMPTY_VARIABLES: VariableDef[] = []
