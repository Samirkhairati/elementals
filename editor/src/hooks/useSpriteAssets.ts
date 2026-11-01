import { useCallback, useEffect, useMemo, useState } from 'react'
import { characterToAssetInfo, type CharacterInfo, type GraphicInfo } from '../../../shared/engine/graphics'
import type { CharacterDef } from '../../../shared/engine/characters'
import type { SpriteAssetInfo } from '../../../shared/engine/types'
import { runIpc, type OpResult } from '@/lib/opResult'

export interface SpriteWarning {
  file: string
  error: string
}

export interface UseSpriteAssets {
  /** Every character by id (`characters/player`) in the `SpriteAssetInfo` view the map screens use. */
  assets: Record<string, SpriteAssetInfo>
  /** The same assets sorted by id (stable between renders while nothing changes). */
  list: SpriteAssetInfo[]
  /** Every character with its full v2 definition and pictures, by id. */
  characters: Record<string, CharacterInfo>
  /** Every image in project/graphics. */
  graphics: GraphicInfo[]
  /** data: URL of every graphic by id. */
  images: Record<string, string>
  /** Every folder under project/database/characters (ids like `characters/npcs`), empty ones included, sorted. */
  folders: string[]
  loading: boolean
  /** Last load/operation failure, or null. */
  error: string | null
  /** Files on disk that were skipped because they are invalid. */
  warnings: SpriteWarning[]
  getAsset: (id: string | null | undefined) => SpriteAssetInfo | undefined
  getCharacter: (id: string | null | undefined) => CharacterInfo | undefined
  /** Re-read everything from disk. */
  reload: () => Promise<void>
  /** Native file picker -> the chosen path (null when cancelled). */
  pickFile: () => Promise<OpResult<{ sourcePath: string | null; defaultName: string }>>
  /** Copies an image into project/graphics under `graphicId` (refuses to overwrite). */
  importGraphic: (sourcePath: string, graphicId: string) => Promise<OpResult<{ graphic: GraphicInfo; image: string }>>
  /** Creates or overwrites a character record. */
  saveCharacter: (id: string, def: CharacterDef) => Promise<OpResult<{ character: CharacterInfo }>>
  /** Rename and/or move to a new id. Refuses to overwrite. References are NOT rewritten (see the rename flow). */
  rename: (id: string, newId: string) => Promise<OpResult<{ id: string }>>
  remove: (id: string) => Promise<OpResult>
  createFolder: (parentId: string | null, name: string) => Promise<OpResult<{ folderId: string }>>
  renameFolder: (folderId: string, newName: string) => Promise<OpResult<{ folderId: string }>>
  moveFolder: (folderId: string, newParentId: string | null) => Promise<OpResult<{ folderId: string }>>
  deleteFolder: (folderId: string) => Promise<OpResult>
}

interface State {
  characters: Record<string, CharacterInfo>
  graphics: GraphicInfo[]
  images: Record<string, string>
  folders: string[]
  loading: boolean
  error: string | null
  warnings: SpriteWarning[]
}

const api = () => window.electronAPI
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Characters and graphics of the project (`project/database/characters`, `project/graphics`). Mutations go
 * through IPC first and update local state from the main process' answer, so the state mirrors the disk.
 */
export function useSpriteAssets(): UseSpriteAssets {
  const [state, setState] = useState<State>({ characters: {}, graphics: [], images: {}, folders: [], loading: true, error: null, warnings: [] })
  // Latest-wins guard for async loads; bumped on unmount so late answers are ignored.
  const [requests] = useState(() => ({ latest: 0 }))

  const reload = useCallback(async () => {
    const id = ++requests.latest
    setState((s) => ({ ...s, loading: true }))
    const result = await runIpc(
      () => api()?.getCharacters(),
      (r) => ({ characters: r.characters ?? [], graphics: r.graphics ?? [], images: r.images ?? {}, folders: r.folders ?? [], warnings: r.warnings ?? [] })
    )
    if (id !== requests.latest) return // a newer reload (or unmount) superseded this one
    if (!result.ok) {
      setState((s) => ({ ...s, loading: false, error: result.error }))
      return
    }
    setState({
      characters: Object.fromEntries(result.characters.map((c) => [c.id, c])),
      graphics: result.graphics,
      images: result.images,
      folders: result.folders,
      loading: false,
      error: null,
      warnings: result.warnings,
    })
  }, [requests])

  useEffect(() => {
    void reload()
    return () => {
      requests.latest++ // ignore answers that arrive after unmount
    }
  }, [reload, requests])

  const setFailure = useCallback((result: OpResult<object>) => {
    if (!result.ok) setState((s) => ({ ...s, error: result.error }))
    return result
  }, [])

  const pickFile = useCallback<UseSpriteAssets['pickFile']>(async () => {
    try {
      const r = await api()?.pickSpriteFile()
      if (!r) return { ok: false, error: 'The editor API is not available' }
      if (r.success) return { ok: true, sourcePath: r.sourcePath, defaultName: r.defaultName }
      if (r.canceled) return { ok: true, sourcePath: null, defaultName: '' }
      return { ok: false, error: r.error }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, [])

  const importGraphic = useCallback<UseSpriteAssets['importGraphic']>(
    async (sourcePath, graphicId) => {
      const result = await runIpc(
        () => api()?.importGraphic(sourcePath, graphicId),
        (r) => ({ graphic: r.graphic, image: r.image })
      )
      if (result.ok) setState((s) => ({ ...s, error: null, graphics: [...s.graphics.filter((g) => g.id !== result.graphic.id), result.graphic].sort(byId), images: { ...s.images, [result.graphic.id]: result.image } }))
      return setFailure(result) as OpResult<{ graphic: GraphicInfo; image: string }>
    },
    [setFailure]
  )

  const saveCharacter = useCallback<UseSpriteAssets['saveCharacter']>(
    async (id, def) => {
      const result = await runIpc(
        () => api()?.saveCharacter(id, def),
        (r) => ({ character: r.character })
      )
      if (result.ok) setState((s) => ({ ...s, error: null, characters: { ...s.characters, [id]: result.character } }))
      return setFailure(result) as OpResult<{ character: CharacterInfo }>
    },
    [setFailure]
  )

  const rename = useCallback<UseSpriteAssets['rename']>(
    async (id, newId) => {
      const result = await runIpc(
        () => api()?.renameCharacter(id, newId),
        (r) => ({ id: r.id })
      )
      if (result.ok) {
        setState((s) => {
          const current = s.characters[id]
          if (!current) return s
          const { [id]: _removed, ...rest } = s.characters
          return { ...s, error: null, characters: { ...rest, [result.id]: { ...current, id: result.id } } }
        })
      }
      return setFailure(result) as OpResult<{ id: string }>
    },
    [setFailure]
  )

  const remove = useCallback<UseSpriteAssets['remove']>(
    async (id) => {
      const result = await runIpc(
        () => api()?.deleteCharacter(id),
        () => ({})
      )
      if (result.ok) {
        setState((s) => {
          const { [id]: _removed, ...rest } = s.characters
          return { ...s, error: null, characters: rest }
        })
      }
      return setFailure(result)
    },
    [setFailure]
  )

  // Folder operations can change the ids of many characters at once, so they re-read the project afterwards.
  const folderOp = useCallback(
    <T extends object>(call: () => Promise<unknown> | undefined, pick: (r: never) => T) =>
      (async () => {
        const result = await runIpc(call as never, pick as never)
        if (result.ok) await reload()
        return setFailure(result as OpResult<object>) as OpResult<T>
      })(),
    [reload, setFailure]
  )
  const createFolder = useCallback<UseSpriteAssets['createFolder']>((parentId, name) => folderOp(() => api()?.createCharacterFolder(parentId, name), (r: { folderId: string }) => ({ folderId: r.folderId }) as never), [folderOp])
  const renameFolder = useCallback<UseSpriteAssets['renameFolder']>((folderId, newName) => folderOp(() => api()?.renameCharacterFolder(folderId, newName), (r: { folderId: string }) => ({ folderId: r.folderId }) as never), [folderOp])
  const moveFolder = useCallback<UseSpriteAssets['moveFolder']>((folderId, newParentId) => folderOp(() => api()?.moveCharacterFolder(folderId, newParentId), (r: { folderId: string }) => ({ folderId: r.folderId }) as never), [folderOp])
  const deleteFolder = useCallback<UseSpriteAssets['deleteFolder']>((folderId) => folderOp(() => api()?.deleteCharacterFolder(folderId), () => ({}) as never), [folderOp])

  const assets = useMemo(() => Object.fromEntries(Object.values(state.characters).map((c) => [c.id, characterToAssetInfo(c) as SpriteAssetInfo])), [state.characters])
  const list = useMemo(() => Object.values(assets).sort(byId), [assets])
  const getAsset = useCallback((id: string | null | undefined) => (id ? assets[id] : undefined), [assets])
  const getCharacter = useCallback((id: string | null | undefined) => (id ? state.characters[id] : undefined), [state.characters])

  return {
    assets,
    list,
    characters: state.characters,
    graphics: state.graphics,
    images: state.images,
    folders: state.folders,
    loading: state.loading,
    error: state.error,
    warnings: state.warnings,
    getAsset,
    getCharacter,
    reload,
    pickFile,
    importGraphic,
    saveCharacter,
    rename,
    remove,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
  }
}
