import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SpriteAssetInfo, SpriteAssetMeta } from '../../../shared/engine/types'
import type { ImportSpriteOptions } from '@/types/electron'
import { runIpc, type OpResult } from '@/lib/opResult'

export interface SpriteWarning {
  file: string
  error: string
}

export interface UseSpriteAssets {
  /** Every sprite asset by id (`characters/player`). */
  assets: Record<string, SpriteAssetInfo>
  /** The same assets sorted by id (stable between renders while nothing changes). */
  list: SpriteAssetInfo[]
  loading: boolean
  /** Last load/operation failure, or null. */
  error: string | null
  /** Assets on disk that were skipped because they are invalid. */
  warnings: SpriteWarning[]
  getAsset: (id: string | null | undefined) => SpriteAssetInfo | undefined
  /** Re-read everything from disk. */
  reload: () => Promise<void>
  /** Native file picker -> the chosen path (null when cancelled). */
  pickFile: () => Promise<OpResult<{ sourcePath: string | null; defaultName: string }>>
  importSprite: (sourcePath: string, options: ImportSpriteOptions) => Promise<OpResult<{ asset: SpriteAssetInfo }>>
  saveMeta: (id: string, meta: SpriteAssetMeta) => Promise<OpResult<{ meta: SpriteAssetMeta }>>
  /** Rename and/or move to a new id (directory path). Refuses to overwrite. */
  rename: (id: string, newId: string) => Promise<OpResult<{ id: string }>>
  remove: (id: string) => Promise<OpResult>
}

interface State {
  assets: Record<string, SpriteAssetInfo>
  loading: boolean
  error: string | null
  warnings: SpriteWarning[]
}

const api = () => window.electronAPI

/**
 * Sprite assets of the project (`project/sprites`). Mutations go through IPC first and update local state from
 * the main process' answer, so the state always mirrors what is on disk.
 */
export function useSpriteAssets(): UseSpriteAssets {
  const [state, setState] = useState<State>({ assets: {}, loading: true, error: null, warnings: [] })
  // Latest-wins guard for async loads; bumped on unmount so late answers are ignored.
  const [requests] = useState(() => ({ latest: 0 }))

  const reload = useCallback(async () => {
    const id = ++requests.latest
    setState((s) => ({ ...s, loading: true }))
    const result = await runIpc(
      () => api()?.getSprites(),
      (r) => ({ assets: r.assets ?? [], warnings: r.warnings ?? [] })
    )
    if (id !== requests.latest) return // a newer reload (or unmount) superseded this one
    if (!result.ok) {
      setState((s) => ({ ...s, loading: false, error: result.error }))
      return
    }
    setState({
      assets: Object.fromEntries(result.assets.map((a) => [a.id, a])),
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

  const importSprite = useCallback<UseSpriteAssets['importSprite']>(
    async (sourcePath, options) => {
      const result = await runIpc(
        () => api()?.importSprite(sourcePath, options),
        (r) => ({ asset: r.asset })
      )
      if (result.ok) setState((s) => ({ ...s, error: null, assets: { ...s.assets, [result.asset.id]: result.asset } }))
      return setFailure(result) as OpResult<{ asset: SpriteAssetInfo }>
    },
    [setFailure]
  )

  const saveMeta = useCallback<UseSpriteAssets['saveMeta']>(
    async (id, meta) => {
      const result = await runIpc(
        () => api()?.saveSpriteMeta(id, meta),
        (r) => ({ meta: r.meta })
      )
      if (result.ok) {
        setState((s) => {
          const current = s.assets[id]
          if (!current) return s
          return { ...s, error: null, assets: { ...s.assets, [id]: { ...current, meta: result.meta } } }
        })
      }
      return setFailure(result) as OpResult<{ meta: SpriteAssetMeta }>
    },
    [setFailure]
  )

  const rename = useCallback<UseSpriteAssets['rename']>(
    async (id, newId) => {
      const result = await runIpc(
        () => api()?.renameSprite(id, newId),
        (r) => ({ id: r.id })
      )
      if (result.ok) {
        setState((s) => {
          const current = s.assets[id]
          if (!current) return s
          const { [id]: _removed, ...rest } = s.assets
          return { ...s, error: null, assets: { ...rest, [result.id]: { ...current, id: result.id } } }
        })
      }
      return setFailure(result) as OpResult<{ id: string }>
    },
    [setFailure]
  )

  const remove = useCallback<UseSpriteAssets['remove']>(
    async (id) => {
      const result = await runIpc(
        () => api()?.deleteSprite(id),
        () => ({})
      )
      if (result.ok) {
        setState((s) => {
          const { [id]: _removed, ...rest } = s.assets
          return { ...s, error: null, assets: rest }
        })
      }
      return setFailure(result)
    },
    [setFailure]
  )

  const list = useMemo(
    () => Object.values(state.assets).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    [state.assets]
  )
  const getAsset = useCallback(
    (id: string | null | undefined) => (id ? state.assets[id] : undefined),
    [state.assets]
  )

  return {
    assets: state.assets,
    list,
    loading: state.loading,
    error: state.error,
    warnings: state.warnings,
    getAsset,
    reload,
    pickFile,
    importSprite,
    saveMeta,
    rename,
    remove,
  }
}
