// The project's look library: project/looks.json (profiles, start profile, the author's presets) and the user
// shaders (project/shaders/*.frag). One store for the whole editor, loaded on first use, saved through IPC (saving
// also refreshes the game's copies, see editor/electron/ipc/lookStore.ts).

import { useSyncExternalStore } from 'react'
import { cleanLooksFile } from '../../../../shared/look/schema'
import { parseShader, type ShaderInfo } from '../../../../shared/look/userShaders'
import type { LooksFile } from '../../../../shared/look/types'
import { runIpc } from '@/lib/opResult'
import { createSaveQueue, DEFAULT_SAVE_DELAY_MS } from '@/lib/saveQueue'

export interface LookLibrary {
  loaded: boolean
  file: LooksFile
  shaders: ShaderInfo[]
  error: string | null
}

let state: LookLibrary = { loaded: false, file: cleanLooksFile(null), shaders: [], error: null }
const listeners = new Set<() => void>()
let loading: Promise<void> | null = null
const queue = createSaveQueue({ delayMs: DEFAULT_SAVE_DELAY_MS })

function set(next: Partial<LookLibrary>): void {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export function getLookLibrary(): LookLibrary {
  return state
}

export function subscribeLookLibrary(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Loads (once) the looks file and the shaders. */
export function loadLookLibrary(force = false): Promise<void> {
  if (loading && !force) return loading
  loading = (async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.getLooks) {
      set({ loaded: true })
      return
    }
    const looks = await runIpc(() => api.getLooks(), (r) => ({ looks: r.looks }))
    const shaders = await runIpc(() => api.listShaders(), (r) => ({ shaders: r.shaders }))
    set({
      loaded: true,
      file: cleanLooksFile(looks.ok ? looks.looks : null),
      shaders: shaders.ok ? shaders.shaders.map((s) => parseShader(s.id, s.source)) : [],
      error: !looks.ok ? looks.error : !shaders.ok ? shaders.error : null,
    })
  })()
  return loading
}

/** The library, loading it on first use. */
export function useLookLibrary(): LookLibrary {
  const lib = useSyncExternalStore(subscribeLookLibrary, getLookLibrary)
  if (!lib.loaded) void loadLookLibrary()
  return lib
}

/** Changes the looks file (profiles, presets) and saves it shortly after. */
export function updateLooksFile(change: (file: LooksFile) => LooksFile): void {
  set({ file: change(state.file) })
  queue.schedule('looks', async () => {
    const r = await runIpc(() => window.electronAPI?.saveLooks(state.file), () => ({}))
    set({ error: r.ok ? null : r.error })
  })
}

export function flushLookLibrary(): Promise<void> {
  return queue.flushAll()
}

/** Writes a shader file (new or changed). */
export async function saveShader(id: string, source: string): Promise<string | null> {
  const r = await runIpc(() => window.electronAPI?.saveShader(id, source), () => ({}))
  if (!r.ok) return r.error
  const info = parseShader(id, source)
  const others = state.shaders.filter((s) => s.id !== id)
  set({ shaders: [...others, info].sort((a, b) => a.id.localeCompare(b.id)) })
  return null
}

export async function deleteShader(id: string): Promise<string | null> {
  const r = await runIpc(() => window.electronAPI?.deleteShader(id), () => ({}))
  if (!r.ok) return r.error
  set({ shaders: state.shaders.filter((s) => s.id !== id) })
  return null
}

export async function renameShader(id: string, newId: string): Promise<string | null> {
  const r = await runIpc(() => window.electronAPI?.renameShader(id, newId), () => ({}))
  if (!r.ok) return r.error
  set({ shaders: state.shaders.map((s) => (s.id === id ? parseShader(newId, s.source) : s)).sort((a, b) => a.id.localeCompare(b.id)) })
  return null
}

/** Tests: back to an empty, unloaded library. */
export function resetLookLibrary(next?: Partial<LookLibrary>): void {
  loading = next?.loaded ? Promise.resolve() : null
  state = { loaded: false, file: cleanLooksFile(null), shaders: [], error: null, ...next }
  for (const l of listeners) l()
}
