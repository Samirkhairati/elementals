// What the Graphics table does with the library: rename, move and delete pictures and folders, each one planned
// first (so the dialog can show what gets rewritten) and applied through lib/assetOps.

import { allFolders, applyAssetPlan, canMoveFolder, folderChanges, folderOfId, graphicDeleteGuard, joinId, leafOfId, planGraphicChanges, summarizeReferences, type AssetPlan, type IdChange } from '@/lib/assetOps'
import type { OpResult } from '@/lib/opResult'
import type { DatabaseData } from './useDatabaseData'
import { saveMapFile } from './mapIo'

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
