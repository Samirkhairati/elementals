// What the Graphics table does with the library: rename, move and delete pictures and folders, each one planned
// first (so the dialog can show what gets rewritten) and applied through lib/assetOps.

import { allFolders, applyAssetPlan, canMoveFolder, folderChanges, folderOfId, graphicDeleteGuard, joinId, leafOfId, planGraphicChanges, summarizeReferences, type AssetPlan, type IdChange } from '@/lib/assetOps'
import { describeSelection, topLevelOnly, type LibrarySelection } from '@/lib/librarySelection'
import type { OpResult } from '@/lib/opResult'
import type { DatabaseData } from './useDatabaseData'
import { saveMapFile } from './mapIo'
import { withBulkImport } from './importFlow'

export interface Outcome {
  ok: boolean
  error: string
  /** One line for the status area ("Moved 3 pictures; 2 references updated"). */
  message: string
}

export const FOLDER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export function graphicActions(data: DatabaseData) {
  const { graphics, characters, graphicFolders } = data.sprites
  const ids = graphics.map((g) => g.id)
  const existing = new Set(ids)
  const io = { saveCharacter: (id: string, def: Parameters<typeof data.sprites.saveCharacter>[1]) => data.sprites.saveCharacter(id, def), saveMap: saveMapFile }

  const plan = (changes: IdChange[]): AssetPlan => planGraphicChanges(data.refs, characters, data.maps, existing, changes)

  const run = async (p: AssetPlan, diskOp: () => Promise<OpResult>, what: string): Promise<Outcome> => {
    const r = await applyAssetPlan(p, diskOp, io)
    await data.reload()
    const refs = p.references.length
    return { ok: r.ok, error: r.error, message: r.ok ? `${what}${refs ? `; ${summarizeReferences(p.references)} updated` : ''}.` : '' }
  }

  return {
    folders: allFolders(ids, graphicFolders),
    plan,

    /** A picture gets a new id (rename, move, or both). */
    rename: (id: string, newId: string) => run(plan([{ from: id, to: newId }]), () => data.sprites.renameGraphic(id, newId), `Moved ${leafOfId(newId)}`),
    planMove: (id: string, folder: string) => plan([{ from: id, to: joinId(folder, leafOfId(id)) }]),

    /** The id changes if `folder` becomes `newPath`. */
    planFolder: (folder: string, newPath: string): AssetPlan => (newPath === folder ? { ...plan([]), ok: false, problem: 'That is where it is already.' } : plan(folderChanges(ids, folder, newPath))),
    /** Rename and/or move a folder; renames first, then moves (each one step on disk). */
    changeFolder: async (folder: string, newPath: string): Promise<Outcome> => {
      const p = plan(folderChanges(ids, folder, newPath))
      const renamed = joinId(folderOfId(folder), leafOfId(newPath))
      const diskOp = async (): Promise<OpResult> => {
        let at = folder
        if (leafOfId(newPath) !== leafOfId(folder)) {
          const r = await data.sprites.renameGraphicFolder(at, leafOfId(newPath))
          if (!r.ok) return r
          at = renamed
        }
        if (folderOfId(newPath) !== folderOfId(at)) return data.sprites.moveGraphicFolder(at, folderOfId(newPath) || null)
        return { ok: true }
      }
      return run(p, diskOp, `Moved folder ${leafOfId(newPath)}`)
    },
    canMoveFolder,

    /** The pictures and folders picked, without what a picked folder already carries. */
    topLevel: (sel: LibrarySelection): LibrarySelection => topLevelOnly(sel, folderOfId),
    /** Every picture a selection reaches (the picked ones and everything inside the picked folders). */
    reached: (sel: LibrarySelection): string[] => {
      const top = topLevelOnly(sel, folderOfId)
      return [...new Set([...top.items, ...top.folders.flatMap((f) => ids.filter((id) => id.startsWith(`${f}/`)))])]
    },
    /** Several pictures and folders into `target` at once: one plan, so sprites and maps are rewritten together. */
    moveMany: async (sel: LibrarySelection, target: string): Promise<Outcome> => {
      const top = topLevelOnly(sel, folderOfId)
      const items = top.items.filter((id) => folderOfId(id) !== target)
      const folders = top.folders.filter((f) => canMoveFolder(f, target))
      if (items.length + folders.length === 0) return { ok: true, error: '', message: '' }
      const changes = [...items.map((id) => ({ from: id, to: joinId(target, leafOfId(id)) })), ...folders.flatMap((f) => folderChanges(ids, f, joinId(target, leafOfId(f))))]
      const diskOp = (): Promise<OpResult> =>
        withBulkImport(2, async () => {
          for (const id of items) {
            const r = await data.sprites.renameGraphic(id, joinId(target, leafOfId(id)))
            if (!r.ok) return r
          }
          for (const f of folders) {
            const r = await data.sprites.moveGraphicFolder(f, target || null)
            if (!r.ok) return r
          }
          return { ok: true } as OpResult
        })
      return run(plan(changes), diskOp, `Moved ${describeSelection({ items, folders }, 'picture')}`)
    },
    /** Deletes the pictures and folders picked (the caller has checked the guard). */
    removeMany: async (sel: LibrarySelection): Promise<Outcome> => {
      const top = topLevelOnly(sel, folderOfId)
      const r = await withBulkImport(2, async (): Promise<OpResult> => {
        for (const id of top.items) {
          const done = await data.sprites.deleteGraphic(id)
          if (!done.ok) return done
        }
        for (const f of top.folders) {
          const done = await data.sprites.deleteGraphicFolder(f)
          if (!done.ok) return done
        }
        return { ok: true }
      })
      await data.reload()
      return r.ok ? { ok: true, error: '', message: `Deleted ${describeSelection(top, 'picture')}.` } : { ok: false, error: r.error, message: '' }
    },

    deleteGuard: (targets: string[]) => graphicDeleteGuard(data.refs, targets),
    remove: async (id: string): Promise<Outcome> => {
      const r = await data.sprites.deleteGraphic(id)
      await data.reload()
      return r.ok ? { ok: true, error: '', message: `Deleted ${leafOfId(id)}.` } : { ok: false, error: r.error, message: '' }
    },
    removeFolder: async (folder: string): Promise<Outcome> => {
      const r = await data.sprites.deleteGraphicFolder(folder)
      await data.reload()
      return r.ok ? { ok: true, error: '', message: `Deleted folder ${folder}.` } : { ok: false, error: r.error, message: '' }
    },
    createFolder: async (parent: string, name: string): Promise<Outcome> => {
      const r = await data.sprites.createGraphicFolder(parent || null, name)
      return r.ok ? { ok: true, error: '', message: `Created folder ${joinId(parent, name)}.` } : { ok: false, error: r.error, message: '' }
    },
  }
}

export type GraphicActions = ReturnType<typeof graphicActions>
