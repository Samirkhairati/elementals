// The project's prefabs (project/prefabs.json, shared/prefabs.ts): one store for the whole editor, loaded on first use and
// saved through IPC shortly after a change. A project without the file shows the built-in prefabs; the first change
// writes them out together with it, so they can be renamed, updated and deleted like the author's own.

import { useSyncExternalStore } from 'react'
import { builtInPrefabs, cleanPrefabsFile, type NodePrefab, type PrefabsFile } from '../../../shared/prefabs'
import { runIpc } from '@/lib/opResult'
import { createSaveQueue, DEFAULT_SAVE_DELAY_MS } from '@/lib/saveQueue'

export interface PrefabLibrary {
  loaded: boolean
  /** The project has its own file (false: the built-in prefabs are shown). */
  stored: boolean
  file: PrefabsFile
  error: string | null
}

let state: PrefabLibrary = { loaded: false, stored: false, file: { prefabs: builtInPrefabs() }, error: null }
const listeners = new Set<() => void>()
let loading: Promise<void> | null = null
const queue = createSaveQueue({ delayMs: DEFAULT_SAVE_DELAY_MS })

function set(next: Partial<PrefabLibrary>): void {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export const getPrefabLibrary = (): PrefabLibrary => state

export function subscribePrefabLibrary(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Loads (once) the prefabs file. */
export function loadPrefabLibrary(force = false): Promise<void> {
  if (loading && !force) return loading
  loading = (async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.getPrefabs) {
      set({ loaded: true })
      return
    }
    const r = await runIpc(() => api.getPrefabs(), (res) => ({ prefabs: res.prefabs }))
    const raw = r.ok ? r.prefabs : null
    set({ loaded: true, stored: raw !== null, file: raw !== null ? cleanPrefabsFile(raw) : { prefabs: builtInPrefabs() }, error: r.ok ? null : r.error })
  })()
  return loading
}

/** The library, loading it on first use. */
export function usePrefabLibrary(): PrefabLibrary {
  const lib = useSyncExternalStore(subscribePrefabLibrary, getPrefabLibrary)
  if (!lib.loaded) void loadPrefabLibrary()
  return lib
}

/** Changes the prefabs and saves them shortly after. */
export function updatePrefabs(change: (prefabs: NodePrefab[]) => NodePrefab[]): void {
  set({ file: { prefabs: change(state.file.prefabs) }, stored: true })
  queue.schedule('prefabs', async () => {
    const r = await runIpc(() => window.electronAPI?.savePrefabs(state.file), () => ({}))
    set({ error: r.ok ? null : r.error })
  })
}

/** Adds a prefab, or replaces the one with its id. */
export function savePrefab(prefab: NodePrefab): void {
  updatePrefabs((list) => (list.some((p) => p.id === prefab.id) ? list.map((p) => (p.id === prefab.id ? prefab : p)) : [...list, prefab]))
}

export function renamePrefab(id: string, name: string): void {
  updatePrefabs((list) => list.map((p) => (p.id === id ? { ...p, name, node: { ...p.node, name } } : p)))
}

export function deletePrefab(id: string): void {
  updatePrefabs((list) => list.filter((p) => p.id !== id))
}

export function flushPrefabLibrary(): Promise<void> {
  return queue.flushAll()
}
