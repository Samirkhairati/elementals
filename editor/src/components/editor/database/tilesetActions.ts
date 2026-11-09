// What the Tilesets table does with the library. A tileset's id is its file name, so moving between folders never
// touches a map; only renaming the file does, and that goes through lib/assetOps like the graphics do.

import { applyAssetPlan, canMoveFolder, folderOfId, joinId, leafOfId, planTilesetRename, summarizeReferences, tilesetDeleteGuard, type AssetPlan } from '@/lib/assetOps'
import { describeSelection, topLevelOnly, type LibrarySelection } from '@/lib/librarySelection'
import type { OpResult } from '@/lib/opResult'
import type { TilesetData } from '@/types/editor'
import type { DatabaseData } from './useDatabaseData'
import type { Outcome } from './graphicActions'
import { saveMapFile } from './mapIo'

export const stemOf = (fileName: string): string => fileName.replace(/\.png$/i, '')
export const folderOfTileset = (t: Pick<TilesetData, 'folderPath'>): string => t.folderPath ?? ''
const orNull = (folder: string): string | null => folder || null

export interface TilesetEdit {
  name: string
  stem: string
  folder: string
}

export function tilesetActions(data: DatabaseData) {
  const { tilesets, tilesetFolders, tilesetOps: ops } = data
  const taken = new Set(tilesets.map((t) => t.fileName))
  const ok: Outcome = { ok: true, error: '', message: '' }
  const fail = (error: string): Outcome => ({ ok: false, error, message: '' })
  const none: AssetPlan = { ok: true, problem: '', changes: [], references: [], characters: [], maps: [] }

  const inFolder = (folder: string) => tilesets.filter((t) => folderOfTileset(t) === folder || folderOfTileset(t).startsWith(`${folder}/`))

  return {
    folders: [...new Set(tilesetFolders)].sort(),
    canMoveFolder,

    /** Maps are only rewritten when the file name (the id) changes. */
    plan: (tileset: TilesetData, edit: TilesetEdit): AssetPlan => (edit.stem === stemOf(tileset.fileName) ? none : planTilesetRename(data.refs, data.maps, taken, tileset.fileName, edit.stem)),

    /** Name, file name and folder in one go; the maps follow a file name change. */
    edit: async (tileset: TilesetData, edit: TilesetEdit): Promise<Outcome> => {
      const plan = edit.stem === stemOf(tileset.fileName) ? none : planTilesetRename(data.refs, data.maps, taken, tileset.fileName, edit.stem)
      const folder = orNull(folderOfTileset(tileset))
      const fileName = `${edit.stem}.png`
      const diskOp = async (): Promise<OpResult> => {
        if (edit.name.trim() && edit.name !== tileset.name) {
          const r = await ops.setName(folder, tileset.fileName, edit.name.trim())
          if (!r.ok) return r
        }
        if (fileName !== tileset.fileName) {
          const r = await ops.renameFile(folder, tileset.fileName, edit.stem)
          if (!r.ok) return r
        }
        if (edit.folder !== folderOfTileset(tileset)) return ops.move(fileName, folder, orNull(edit.folder))
        return { ok: true }
      }
      const r = await applyAssetPlan(plan, diskOp, { saveCharacter: async () => ({ ok: true }), saveMap: saveMapFile })
      await data.reload()
      return r.ok ? { ok: true, error: '', message: `Saved ${edit.name || edit.stem}${plan.references.length ? `; ${summarizeReferences(plan.references)} updated` : ''}.` } : fail(r.error)
    },

    move: async (tileset: TilesetData, folder: string): Promise<Outcome> => {
      const r = await ops.move(tileset.fileName, orNull(folderOfTileset(tileset)), orNull(folder))
      return r.ok ? { ...ok, message: `Moved ${tileset.name}.` } : fail(r.error)
    },
    moveFolder: async (folder: string, target: string): Promise<Outcome> => {
      const r = await ops.moveFolder(folder, orNull(target))
      return r.ok ? { ...ok, message: `Moved folder ${leafOfId(folder)}.` } : fail(r.error)
    },
    /** Rename and/or move a folder to the full path `newPath`. */
    changeFolder: async (folder: string, newPath: string): Promise<Outcome> => {
      let at = folder
      if (leafOfId(newPath) !== leafOfId(folder)) {
        const r = await ops.renameFolder(at, leafOfId(newPath))
        if (!r.ok) return fail(r.error)
        at = joinId(folderOfId(folder), leafOfId(newPath))
      }
      if (folderOfId(newPath) !== folderOfId(at)) {
        const r = await ops.moveFolder(at, orNull(folderOfId(newPath)))
        if (!r.ok) return fail(r.error)
      }
      return { ...ok, message: `Moved folder ${leafOfId(newPath)}.` }
    },
    createFolder: async (parent: string, name: string): Promise<Outcome> => {
      const r = await ops.createFolder(orNull(parent), name)
      return r.ok ? { ...ok, message: `Created folder ${joinId(parent, name)}.` } : fail(r.error)
    },

    deleteGuard: (fileNames: string[]) => {
      const references = fileNames.flatMap((f) => tilesetDeleteGuard(data.refs, f).references)
      return { allowed: references.length === 0, references }
    },
    inFolder,

    /** Tilesets are keyed by file name; this is the folder of one. */
    topLevel: (sel: LibrarySelection): LibrarySelection => topLevelOnly(sel, (key) => folderOfTileset(tilesets.find((t) => t.fileName === key) ?? { folderPath: null })),
    /** File names of every tileset a selection reaches (the picked ones and everything inside the picked folders). */
    reached: (sel: LibrarySelection): string[] => {
      const top = topLevelOnly(sel, (key) => folderOfTileset(tilesets.find((t) => t.fileName === key) ?? { folderPath: null }))
      return [...new Set([...top.items, ...top.folders.flatMap((f) => inFolder(f).map((t) => t.fileName))])]
    },
    /** Several tilesets and folders into `target` at once (file names are the ids, so no map changes). */
    moveMany: (sel: LibrarySelection, target: string): Promise<Outcome> =>
      ops.batch(async () => {
        const top = topLevelOnly(sel, (key) => folderOfTileset(tilesets.find((t) => t.fileName === key) ?? { folderPath: null }))
        const items = top.items.flatMap((key) => tilesets.filter((t) => t.fileName === key && folderOfTileset(t) !== target))
        const folders = top.folders.filter((f) => canMoveFolder(f, target))
        for (const t of items) {
          const r = await ops.move(t.fileName, orNull(folderOfTileset(t)), orNull(target))
          if (!r.ok) return fail(r.error)
        }
        for (const f of folders) {
          const r = await ops.moveFolder(f, orNull(target))
          if (!r.ok) return fail(r.error)
        }
        return items.length + folders.length === 0 ? ok : { ...ok, message: `Moved ${describeSelection({ items: items.map((t) => t.fileName), folders }, 'tileset')}.` }
      }),
    /** Deletes the tilesets and folders picked (the caller has checked the guard). */
    removeMany: (sel: LibrarySelection): Promise<Outcome> =>
      ops.batch(async () => {
        const top = topLevelOnly(sel, (key) => folderOfTileset(tilesets.find((t) => t.fileName === key) ?? { folderPath: null }))
        for (const key of top.items) {
          const t = tilesets.find((x) => x.fileName === key)
          if (!t) continue
          const r = await ops.remove(orNull(folderOfTileset(t)), t.fileName)
          if (!r.ok) return fail(r.error)
        }
        for (const f of top.folders) {
          const r = await ops.deleteFolder(f)
          if (!r.ok) return fail(r.error)
        }
        return { ...ok, message: `Deleted ${describeSelection(top, 'tileset')}.` }
      }),
    remove: async (tileset: TilesetData): Promise<Outcome> => {
      const r = await ops.remove(orNull(folderOfTileset(tileset)), tileset.fileName)
      return r.ok ? { ...ok, message: `Deleted ${tileset.name}.` } : fail(r.error)
    },
    removeFolder: async (folder: string): Promise<Outcome> => {
      const r = await ops.deleteFolder(folder)
      return r.ok ? { ...ok, message: `Deleted folder ${folder}.` } : fail(r.error)
    },
  }
}

export type TilesetActions = ReturnType<typeof tilesetActions>
