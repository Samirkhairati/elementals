import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameDatabase, StageDef, SwitchDef, VariableDef } from '../../../shared/engine/types'
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
  stages: StageDef[]
  getSwitch: (id: string | null | undefined) => SwitchDef | undefined
  getVariable: (id: string | null | undefined) => VariableDef | undefined
  getStage: (id: string | null | undefined) => StageDef | undefined
  /** Each add returns the new id (ids are generated from the name and stay stable when the name changes). */
  addSwitch: (name?: string) => string
  renameSwitch: (id: string, name: string) => void
  removeSwitch: (id: string) => void
  addVariable: (name?: string, initial?: number) => string
  renameVariable: (id: string, name: string) => void
  setVariableInitial: (id: string, initial: number) => void
  removeVariable: (id: string) => void
  /** A new stage starts with two values ("Not started", "Done"); returns its id. */
  addStage: (name?: string) => string
  renameStage: (id: string, name: string) => void
  removeStage: (id: string) => void
  /** Returns the id of the new value ('' when the stage does not exist). */
  addStageValue: (stageId: string, name?: string) => string
  renameStageValue: (stageId: string, valueId: string, name: string) => void
  /** A stage keeps at least one value; removing the initial one makes the first value the initial. */
  removeStageValue: (stageId: string, valueId: string) => void
  /** Moves a value one step earlier (-1) or later (1); conditions compare by this order. */
  moveStageValue: (stageId: string, valueId: string, delta: -1 | 1) => void
  setStageInitial: (stageId: string, valueId: string) => void
  /** Groups an entry in the Database panel ("Quests/Lost cat"); '' removes the folder. */
  setFolder: (kind: 'switch' | 'variable' | 'stage', id: string, folder: string) => void
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
  return (
    [...db.switches, ...db.variables, ...db.stages].every((e) => e.name.trim() !== '') &&
    db.stages.every((st) => st.values.every((v) => v.name.trim() !== ''))
  )
}

const withFolder = <T extends { folder?: string }>(entry: T, folder: string): T => {
  const { folder: _old, ...rest } = entry
  void _old
  const clean = folder
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
  return (clean ? { ...rest, folder: clean } : rest) as T
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

  const addStage = useCallback(
    (name = '') => {
      let id = ''
      update((db) => {
        id = uniqueId(idFromName(name, 'stage'), new Set(db.stages.map((s) => s.id)))
        const stage: StageDef = {
          id,
          name: name.trim() || `Stage ${db.stages.length + 1}`,
          values: [
            { id: 'not_started', name: 'Not started' },
            { id: 'done', name: 'Done' },
          ],
          initial: 'not_started',
        }
        return { ...db, stages: [...db.stages, stage] }
      })
      return id
    },
    [update]
  )
  const patchStage = useCallback(
    (id: string, change: (stage: StageDef) => StageDef) =>
      update((db) => {
        const stage = db.stages.find((s) => s.id === id)
        if (!stage) return db
        const next = change(stage)
        return next === stage ? db : { ...db, stages: db.stages.map((s) => (s.id === id ? next : s)) }
      }),
    [update]
  )
  const renameStage = useCallback((id: string, name: string) => patchStage(id, (s) => (s.name === name ? s : { ...s, name })), [patchStage])
  const removeStage = useCallback(
    (id: string) => update((db) => (db.stages.some((s) => s.id === id) ? { ...db, stages: db.stages.filter((s) => s.id !== id) } : db)),
    [update]
  )
  const addStageValue = useCallback(
    (stageId: string, name = '') => {
      let valueId = ''
      patchStage(stageId, (s) => {
        valueId = uniqueId(idFromName(name, 'value'), new Set(s.values.map((v) => v.id)))
        return { ...s, values: [...s.values, { id: valueId, name: name.trim() || `Value ${s.values.length + 1}` }] }
      })
      return valueId
    },
    [patchStage]
  )
  const renameStageValue = useCallback(
    (stageId: string, valueId: string, name: string) =>
      patchStage(stageId, (s) =>
        s.values.some((v) => v.id === valueId && v.name !== name) ? { ...s, values: s.values.map((v) => (v.id === valueId ? { ...v, name } : v)) } : s
      ),
    [patchStage]
  )
  const removeStageValue = useCallback(
    (stageId: string, valueId: string) =>
      patchStage(stageId, (s) => {
        if (s.values.length <= 1 || !s.values.some((v) => v.id === valueId)) return s
        const values = s.values.filter((v) => v.id !== valueId)
        return { ...s, values, initial: s.initial === valueId ? values[0].id : s.initial }
      }),
    [patchStage]
  )
  const moveStageValue = useCallback(
    (stageId: string, valueId: string, delta: -1 | 1) =>
      patchStage(stageId, (s) => {
        const from = s.values.findIndex((v) => v.id === valueId)
        const to = from + delta
        if (from < 0 || to < 0 || to >= s.values.length) return s
        const values = s.values.slice()
        const [moved] = values.splice(from, 1)
        values.splice(to, 0, moved)
        return { ...s, values }
      }),
    [patchStage]
  )
  const setStageInitial = useCallback(
    (stageId: string, valueId: string) =>
      patchStage(stageId, (s) => (s.initial !== valueId && s.values.some((v) => v.id === valueId) ? { ...s, initial: valueId } : s)),
    [patchStage]
  )
  const setFolder = useCallback(
    (kind: 'switch' | 'variable' | 'stage', id: string, folder: string) =>
      update((db) => {
        const key = kind === 'switch' ? 'switches' : kind === 'variable' ? 'variables' : 'stages'
        const list = db[key] as { id: string; folder?: string }[]
        const entry = list.find((e) => e.id === id)
        if (!entry) return db
        const next = withFolder(entry, folder)
        return (next.folder ?? '') === (entry.folder ?? '') ? db : { ...db, [key]: list.map((e) => (e.id === id ? next : e)) }
      }),
    [update]
  )

  const flush = useCallback(() => queue.flush(SAVE_KEY), [queue])
  const reload = useCallback(async () => {
    await queue.flushAll()
    await load()
  }, [queue, load])

  const getSwitch = useCallback((id: string | null | undefined) => (id ? database?.switches.find((s) => s.id === id) : undefined), [database])
  const getVariable = useCallback((id: string | null | undefined) => (id ? database?.variables.find((v) => v.id === id) : undefined), [database])
  const getStage = useCallback((id: string | null | undefined) => (id ? database?.stages.find((s) => s.id === id) : undefined), [database])

  return {
    database,
    loading,
    error,
    dirty,
    switches: database?.switches ?? EMPTY_SWITCHES,
    variables: database?.variables ?? EMPTY_VARIABLES,
    stages: database?.stages ?? EMPTY_STAGES,
    getSwitch,
    getVariable,
    getStage,
    addSwitch,
    renameSwitch,
    removeSwitch,
    addVariable,
    renameVariable,
    setVariableInitial,
    removeVariable,
    addStage,
    renameStage,
    removeStage,
    addStageValue,
    renameStageValue,
    removeStageValue,
    moveStageValue,
    setStageInitial,
    setFolder,
    flush,
    reload,
  }
}

const EMPTY_SWITCHES: SwitchDef[] = []
const EMPTY_VARIABLES: VariableDef[] = []
const EMPTY_STAGES: StageDef[] = []
