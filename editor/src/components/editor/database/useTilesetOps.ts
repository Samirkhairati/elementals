import { useMemo } from 'react'
import type { TilesetData } from '@/types/editor'
import { opError, type OpResult } from '@/lib/opResult'

export interface TilesetOps {
  /** Native file picker -> the chosen path (null when cancelled). */
  pickFile: () => Promise<OpResult<{ sourcePath: string | null; defaultName: string }>>
  /** Copies a PNG into the tileset library under `folder`; `fileStem` is the file name to use (the source's by default; a free one is picked). */
  importTileset: (sourcePath: string, name: string, folder: string | null, fileStem?: string) => Promise<OpResult<{ tileset: TilesetData }>>
  /** Runs several operations and re-reads the project once at the end instead of after each one. */
  batch: <T>(work: () => Promise<T>) => Promise<T>
  /** Changes the name shown in the editor (the file, and so the id maps use, stays). */
  setName: (folder: string | null, fileName: string, name: string) => Promise<OpResult>
  /** Renames the file, which is the id maps store. References are NOT rewritten (see lib/assetOps). */
  renameFile: (folder: string | null, fileName: string, newStem: string) => Promise<OpResult<{ fileName: string }>>
  move: (fileName: string, oldFolder: string | null, newFolder: string | null) => Promise<OpResult>
  remove: (folder: string | null, fileName: string) => Promise<OpResult>
  createFolder: (parent: string | null, name: string) => Promise<OpResult<{ folderPath: string }>>
  renameFolder: (folder: string, newName: string) => Promise<OpResult<{ newFolderPath: string }>>
  moveFolder: (folder: string, newParent: string | null) => Promise<OpResult<{ newFolderPath: string }>>
  deleteFolder: (folder: string) => Promise<OpResult>
}

const api = () => window.electronAPI

type Answer = { success: boolean; error?: string }

/** The tileset channels answer `{ success, error?, ...fields }` (not a discriminated union), so read the fields by hand. */
async function ipc<A extends Answer, T extends object>(call: () => Promise<A> | undefined, pick: (answer: A) => T): Promise<OpResult<T>> {
  try {
    const answer = await call()
    if (!answer) return { ok: false, error: 'The editor API is not available' }
    return answer.success ? { ok: true, ...pick(answer) } : { ok: false, error: answer.error ?? 'Operation failed' }
  } catch (e) {
    return opError(e)
  }
}

/** Tileset library operations; every successful one re-reads the project through `reload`. */
export function useTilesetOps(reload: () => Promise<void>): TilesetOps {
  return useMemo<TilesetOps>(() => {
    let batching = 0
    let dirty = false
    const then = async <T extends object>(p: Promise<OpResult<T>>): Promise<OpResult<T>> => {
      const r = await p
      if (r.ok) {
        if (batching > 0) dirty = true
        else await reload()
      }
      return r
    }
    return {
      batch: async (work) => {
        batching++
        try {
          return await work()
        } finally {
          batching--
          if (batching === 0 && dirty) {
            dirty = false
            await reload()
          }
        }
      },
      pickFile: async () => {
        try {
          const r = await api()?.pickTilesetFile()
          if (!r) return { ok: false, error: 'The editor API is not available' }
          if (r.success && r.sourcePath) return { ok: true, sourcePath: r.sourcePath, defaultName: r.defaultName ?? '' }
          if (r.canceled) return { ok: true, sourcePath: null, defaultName: '' }
          return { ok: false, error: r.error ?? 'Could not pick a file' }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      },
      importTileset: (sourcePath, name, folder, fileStem) => then(ipc(() => api()?.importTileset(sourcePath, name, folder, fileStem), (r) => ({ tileset: r.tileset as TilesetData }))),
      setName: (folder, fileName, name) => then(ipc(() => api()?.renameTileset(folder, fileName, name), () => ({}))),
      renameFile: (folder, fileName, newStem) => then(ipc(() => api()?.renameTilesetFile(folder, fileName, newStem), (r) => ({ fileName: r.fileName as string }))),
      move: (fileName, oldFolder, newFolder) => then(ipc(() => api()?.moveTileset(fileName, oldFolder, newFolder), () => ({}))),
      remove: (folder, fileName) => then(ipc(() => api()?.deleteTileset(folder, fileName), () => ({}))),
      createFolder: (parent, name) => then(ipc(() => api()?.createFolder(parent, name), (r) => ({ folderPath: r.folderPath as string }))),
      renameFolder: (folder, newName) => then(ipc(() => api()?.renameFolder(folder, newName), (r) => ({ newFolderPath: r.newFolderPath as string }))),
      moveFolder: (folder, newParent) => then(ipc(() => api()?.moveTilesetFolder(folder, newParent), (r) => ({ newFolderPath: r.newFolderPath as string }))),
      deleteFolder: (folder) => then(ipc(() => api()?.deleteFolder(folder), () => ({}))),
    }
  }, [reload])
}
