import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { imagePickName, type ImagePick } from '@/lib/graphicAssets'
import { pasteImageItems, selectImages, type SelectMode } from '@/lib/imageSelection'
import { createGroup, deleteGroup, expandLockedGroups, groupCopies, groupImages, moveItems, pruneGroups, setGroupOf, ungroupImages } from '@/lib/imageGroups'
import { snapshot, useEditorClipboard } from '@/store/editorClipboard'
import { nextImageName } from '@/lib/imageItems'
import { Layer, LayerType, ImageItem, ImageGroup, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData } from '@/types/editor'
import { useSyncedState } from '@/hooks/useSyncedState'
import { ARROW_DELTAS, nudgeStep } from '@/lib/imageNudge'
import { layersToCopy, placeLayerCopies, setFolderFlag } from '@/lib/layerFolders'
import { clampEntitiesIndex, entitiesIndexAfterInsert, entitiesIndexAfterRemove, moveBlockInDrawOrder, moveInDrawOrder, moveInDrawOrderTo, sortedImages } from '@/lib/layerOrder'

interface UseLayerManagerOptions {
  /** Functional updates only: the manager never closes over the current map. */
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  /** Called once per committed layer mutation, after the new layers are readable via `getLayers()`. */
  onCommitHistory?: (layers: Layer[]) => void
}

export function useLayerManager(options: UseLayerManagerOptions) {
  const { setActiveMap, onCommitHistory } = options

  const [layers, setLayers, layersRef] = useSyncedState<Layer[]>([])
  const [activeLayerId, setActiveLayerIdRaw] = useState<string | null>(null)
  /** Extra layers picked with Ctrl/Cmd+click. The active layer is always part of the working set on top of these. */
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  /** Pinned: a right-drag samples every selected layer (not just the active one) and painting writes back to all of them. */
  const [pinSelection, setPinSelection] = useState(false)
  /** Image layers: the sprite asset waiting to be dropped on the map, and the image picked on the canvas. */
  const [pendingImage, setPendingImage] = useState<ImagePick | null>(null)
  const [selectedImageId, setSelectedImageIdRaw] = useState<string | null>(null)
  /** Pictures picked besides `selectedImageId` (Ctrl/Cmd or Shift+click). Together they are the picked set. */
  const [extraImageIds, setExtraImageIds] = useState<string[]>([])
  /** The layer the last "new layer / folder" made (and how many were made), so the list can open its name for typing. */
  const [justCreatedLayer, setJustCreatedLayer] = useState<{ id: string; n: number } | null>(null)
  /** The group whose row is selected: its members can be picked one by one even if it is locked. */
  const [openImageGroupId, setOpenImageGroupId] = useState<string | null>(null)
  const openImageGroupIdRef = useRef<string | null>(null)
  openImageGroupIdRef.current = openImageGroupId
  /** Picks only this picture (or none) and drops the rest of the picked set. */
  const setSelectedImageId = useCallback((next: React.SetStateAction<string | null>) => {
    setSelectedImageIdRaw(next)
    setExtraImageIds([])
    if (next === null) setOpenImageGroupId(null)
  }, [])
  const selectedImageIdRef = useRef<string | null>(null)
  const pickedImageIdsRef = useRef<string[]>([])
  const pickedImageIds = useMemo(() => (selectedImageId ? [selectedImageId, ...extraImageIds.filter(id => id !== selectedImageId)] : []), [selectedImageId, extraImageIds])
  selectedImageIdRef.current = selectedImageId
  pickedImageIdsRef.current = pickedImageIds
  /** The picture whose resize handles show on the canvas (Images panel › Resize); only while it is the one picture picked. */
  const [resizingRaw, setResizingImageId] = useState<string | null>(null)
  const resizingImageId = resizingRaw && resizingRaw === selectedImageId && extraImageIds.length === 0 ? resizingRaw : null
  useEffect(() => {
    if (resizingRaw && !resizingImageId) setResizingImageId(null)
  }, [resizingRaw, resizingImageId])
  const [tileSelection, setTileSelection] = useState<TileSelection | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [paintMode, setPaintMode] = useState<PaintMode>('discontinuous')
  const [isPainting, setIsPainting] = useState(false)
  const [paintStartPos, setPaintStartPos] = useState<{ x: number; y: number } | null>(null)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  /** Activating a layer drops the multi-selection (use `selectLayer` with `additive` to extend it). */
  const setActiveLayerId = useCallback((next: React.SetStateAction<string | null>) => {
    setActiveLayerIdRaw(next)
    // Functional updates come from undo/redo, which keeps the selection (stale ids are ignored later).
    if (typeof next !== 'function') {
      setSelectedLayerIds([])
      setSelectedImageId(null)
    }
  }, [setSelectedImageId])

  /** Plain click: only this layer. Ctrl/Cmd+click: add it to (or remove it from) the multi-selection. Shift+click ('range'): everything from the active layer to it. */
  const selectLayer = useCallback(
    (id: string, additive: boolean | 'range' = false) => {
      if (!additive) {
        setActiveLayerId(id)
        return
      }
      setSelectedImageId(null)
      if (additive === 'range') {
        const rows = layersRef.current.filter(l => l.type !== 'folder').map(l => l.id)
        const from = activeLayerId ? rows.indexOf(activeLayerId) : -1
        const to = rows.indexOf(id)
        if (from === -1 || to === -1) {
          setActiveLayerId(id)
          return
        }
        setSelectedLayerIds(rows.slice(Math.min(from, to), Math.max(from, to) + 1))
        setActiveLayerIdRaw(id)
        return
      }
      setSelectedLayerIds(prev => {
        const set = new Set(prev)
        if (activeLayerId) set.add(activeLayerId)
        if (set.has(id)) set.delete(id)
        else set.add(id)
        return [...set]
      })
      setActiveLayerIdRaw(id)
    },
    [activeLayerId, setActiveLayerId, setSelectedImageId, layersRef]
  )

  /** Latest layers, readable synchronously (e.g. for history snapshots / paint ops). */
  const getLayers = useCallback(() => layersRef.current, [layersRef])

  // ── Collision Virtual Tile Effect ─────────────────────────────────────────
  const prevTileSelectionRef = useRef<TileSelection | null>(null)

  useEffect(() => {
    // A pinned (possibly multi-layer) selection is the user's; it is not swapped for the collision marker.
    if (pinSelection) return
    const layer = layersRef.current.find(l => l.id === activeLayerId)
    if (layer?.type === 'collision') {
      setTileSelection(current => {
        if (current?.tiles[0]?.tilesetId !== '__collision__') {
          prevTileSelectionRef.current = current
        }
        return { width: 1, height: 1, tiles: [{ tilesetId: '__collision__', x: 0, y: 0 }] }
      })
    } else if (layer?.type === 'tile') {
      setTileSelection(current => {
        if (current?.tiles[0]?.tilesetId === '__collision__') {
          return prevTileSelectionRef.current
        }
        return current
      })
    }
  }, [activeLayerId, layersRef, pinSelection])

  // ── Layer helpers ─────────────────────────────────────────────────────────
  const commitNewLayers = useCallback(
    (updater: (prev: Layer[]) => Layer[], onAfter?: (next: Layer[]) => void) => {
      // Computed from the ref, *outside* of any React updater: side effects below run exactly once.
      const prev = layersRef.current
      const next = updater(prev)
      if (next === prev) return
      setLayers(next)
      setActiveMap(m => (m ? { ...m, layers: next } : m))
      onCommitHistory?.(next)
      onAfter?.(next)
    },
    [layersRef, setLayers, setActiveMap, onCommitHistory]
  )

  /**
   * Where the Entities row sits among the layers is a map field (`entitiesIndex`: how many layers are above it).
   * It only gets written when it differs from the default, so untouched maps stay untouched.
   */
  const setEntitiesIndex = useCallback(
    (index: number) => {
      setActiveMap(m => {
        if (!m) return m
        const next = clampEntitiesIndex(index, m.layers.length)
        return clampEntitiesIndex(m.entitiesIndex, m.layers.length) === next ? m : { ...m, entitiesIndex: next }
      })
    },
    [setActiveMap]
  )

  /** Keeps the Entities row between the same layers when a layer is added or removed. */
  const shiftEntitiesIndex = useCallback(
    (shift: (current: number | undefined) => number) => {
      setActiveMap(m => {
        if (!m) return m
        const next = shift(m.entitiesIndex)
        return clampEntitiesIndex(m.entitiesIndex, Number.MAX_SAFE_INTEGER) === next ? m : { ...m, entitiesIndex: next }
      })
    },
    [setActiveMap]
  )

  const updateLayers = useCallback(
    (newLayers: Layer[]) => {
      commitNewLayers(() => newLayers)
    },
    [commitNewLayers]
  )

  const toggleLayerVisibility = useCallback(
    (id: string) => {
      commitNewLayers(prev => {
        const layer = prev.find(l => l.id === id)
        // A folder's eye sets the eye of the layers it holds too.
        if (layer?.type === 'folder') return setFolderFlag(prev, id, 'visible', !layer.visible)
        return prev.map(l => (l.id === id ? { ...l, visible: !l.visible } : l))
      })
    },
    [commitNewLayers]
  )

  const toggleLayerLock = useCallback(
    (id: string) => {
      commitNewLayers(prev => {
        const layer = prev.find(l => l.id === id)
        if (layer?.type === 'folder') return setFolderFlag(prev, id, 'locked', !layer.locked)
        return prev.map(l => (l.id === id ? { ...l, locked: !l.locked } : l))
      })
    },
    [commitNewLayers]
  )

  /** Y-sort on or off for a layer or folder; undefined goes back to following the folder (see shared/ySort.ts). */
  const setLayerYSort = useCallback(
    (id: string, value: boolean | undefined) => {
      commitNewLayers(prev => {
        const layer = prev.find(l => l.id === id)
        if (!layer || layer.ySort === value) return prev
        return prev.map(l => {
          if (l.id !== id) return l
          const { ySort: _old, ...rest } = l
          return value === undefined ? rest : { ...rest, ySort: value }
        })
      })
    },
    [commitNewLayers]
  )

  /** Opening or closing a folder in the list is a view change: it is saved with the map but is not an undo step. */
  const toggleFolderCollapsed = useCallback(
    (id: string) => {
      const prev = layersRef.current
      const next = prev.map(l => (l.id === id && l.type === 'folder' ? { ...l, collapsed: !l.collapsed } : l))
      setLayers(next)
      setActiveMap(m => (m ? { ...m, layers: next } : m))
    },
    [layersRef, setLayers, setActiveMap]
  )

  const handleCreateLayerOfType = useCallback(
    (type: LayerType, folderId?: string) => {
      let createdId: string | null = null
      let insertedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          // Special layer singleton check
          if (['collision', 'terrain', 'encounters'].includes(type) && prev.some(l => l.type === type)) {
            return prev
          }

          let name = ''
          if (type === 'tile') {
            let counter = 1
            while (prev.some(l => l.name === `Layer ${counter}`)) {
              counter++
            }
            name = `Layer ${counter}`
          } else if (type === 'collision') {
            name = 'Collision'
          } else if (type === 'terrain') {
            name = 'Terrain'
          } else if (type === 'encounters') {
            name = 'Encounters'
          } else if (type === 'image') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Images' : `Images ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Images' : `Images ${counter}`
          } else if (type === 'folder') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Folder' : `Folder ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Folder' : `Folder ${counter}`
          } else if (type === 'polygons') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Collision shapes' : `Collision shapes ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Collision shapes' : `Collision shapes ${counter}`
          } else if (type === 'objects') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Objects' : `Objects ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Objects' : `Objects ${counter}`
          }

          // Created from a folder's menu: a tile or image layer goes in as the folder's top layer, and the folder opens.
          const folderAt = folderId && (type === 'tile' || type === 'image') ? prev.findIndex(l => l.id === folderId && l.type === 'folder') : -1
          const newLayer: Layer = {
            id: crypto.randomUUID(),
            name,
            type,
            visible: true,
            locked: false,
            ...(type === 'image' ? { images: [] } : {}),
            ...(type === 'polygons' ? { shapes: [] } : {}),
            ...(folderAt >= 0 ? { folderId } : {}),
          }
          createdId = newLayer.id

          if (folderAt >= 0) {
            const next = prev.map((l, i) => (i === folderAt && l.collapsed ? { ...l, collapsed: false } : l))
            next.splice(folderAt + 1, 0, newLayer)
            // The Entities row is never between a folder and its layers: one sitting right below it ends up below the new layer.
            insertedAt = folderAt
            countBefore = prev.length
            return next
          }

          let insertIndex = 0
          if (type === 'tile' || type === 'image') {
            // Keep special layers on top of the drawn layers by default: insert them below the special layers at the top
            while (
              insertIndex < prev.length &&
              ['collision', 'terrain', 'encounters'].includes(prev[insertIndex].type)
            ) {
              insertIndex++
            }
          }
          const next = [...prev]
          next.splice(insertIndex, 0, newLayer)
          insertedAt = insertIndex
          countBefore = prev.length
          return next
        },
        () => {
          if (createdId) {
            setActiveLayerId(createdId)
            const id = createdId
            setJustCreatedLayer(prev => ({ id, n: (prev?.n ?? 0) + 1 }))
          }
          if (insertedAt >= 0) shiftEntitiesIndex(k => entitiesIndexAfterInsert(k, insertedAt, countBefore))
        }
      )
    },
    [commitNewLayers, setActiveLayerId, shiftEntitiesIndex]
  )

  const handleCreateLayer = useCallback(() => {
    handleCreateLayerOfType('tile')
  }, [handleCreateLayerOfType])

  const handleRenameLayer = useCallback(
    (id: string, newName: string) => {
      const cleanName = newName.trim()
      if (!cleanName) return
      commitNewLayers(prev => prev.map(l => (l.id === id ? { ...l, name: cleanName } : l)))
    },
    [commitNewLayers]
  )

  /** Insert copies of `source` layers (new ids, "Name Copy") next to the layer `afterId`, at its depth (see placeLayerCopies), in one undo step, and pick the last. */
  const insertLayerCopies = useCallback(
    (source: readonly Layer[], afterId: string | null) => {
      let placed: ReturnType<typeof placeLayerCopies> | null = null
      let countBefore = 0
      commitNewLayers(
        prev => {
          placed = placeLayerCopies(prev, source, afterId, () => crypto.randomUUID())
          countBefore = prev.length
          return placed.layers
        },
        () => {
          const done = placed as ReturnType<typeof placeLayerCopies> | null
          if (!done || done.count === 0) return
          if (done.lastId) setActiveLayerId(done.lastId)
          shiftEntitiesIndex(k => entitiesIndexAfterInsert(k, done.at, countBefore, done.count))
        }
      )
    },
    [commitNewLayers, setActiveLayerId, shiftEntitiesIndex]
  )

  /** Copy layers to the editor clipboard: tile and image layers, and folders with the layers they hold. */
  const copyLayers = useCallback(
    (ids: readonly string[]) => {
      const list = layersToCopy(layersRef.current, ids)
      if (list.length > 0) useEditorClipboard.getState().set({ kind: 'layers', layers: snapshot(list) })
      return list.length
    },
    [layersRef]
  )

  /** Duplicate several layers and folders at once (one undo step); the copies go below the lowest of them, at its depth. */
  const duplicateLayers = useCallback(
    (ids: readonly string[]) => {
      const list = layersToCopy(layersRef.current, ids)
      if (list.length === 0) return
      insertLayerCopies(list, list[list.length - 1].id)
    },
    [insertLayerCopies, layersRef]
  )

  const handleDuplicateLayer = useCallback((id: string) => duplicateLayers([id]), [duplicateLayers])

  /** Paste copied layers next to `afterId`, in its folder (see placeLayerCopies). */
  const pasteLayers = useCallback(
    (afterId: string | null) => {
      const content = useEditorClipboard.getState().content
      if (content?.kind === 'layers') insertLayerCopies(content.layers, afterId)
    },
    [insertLayerCopies]
  )

  const handleDeleteLayer = useCallback(
    (id: string) => {
      let removedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          removedAt = prev.findIndex(l => l.id === id)
          countBefore = prev.length
          // Deleting a folder keeps the layers it held: they just leave it.
          return prev
            .filter(l => l.id !== id)
            .map(l => {
              if (l.folderId !== id) return l
              const { folderId: _gone, ...rest } = l
              return rest
            })
        },
        next => {
          if (removedAt >= 0) shiftEntitiesIndex(k => entitiesIndexAfterRemove(k, removedAt, countBefore))
          setSelectedLayerIds(prev => prev.filter(other => other !== id))
          setActiveLayerIdRaw(current => (current === id ? (next.length > 0 ? next[0].id : null) : current))
        }
      )
    },
    [commitNewLayers, shiftEntitiesIndex]
  )

  /** Delete several layers in one undo step (folders among them release the layers they held). */
  const handleDeleteLayers = useCallback(
    (ids: readonly string[]) => {
      const gone = new Set(ids)
      let removedAt: number[] = []
      let countBefore = 0
      commitNewLayers(
        prev => {
          removedAt = prev.flatMap((l, i) => (gone.has(l.id) ? [i] : []))
          if (removedAt.length === 0) return prev
          countBefore = prev.length
          return prev
            .filter(l => !gone.has(l.id))
            .map(l => {
              if (!l.folderId || !gone.has(l.folderId)) return l
              const { folderId: _gone, ...rest } = l
              return rest
            })
        },
        next => {
          // Highest first, so the indices below stay valid while the count shrinks.
          let count = countBefore
          for (const at of [...removedAt].reverse()) {
            const n = count
            shiftEntitiesIndex(k => entitiesIndexAfterRemove(k, at, n))
            count--
          }
          setSelectedLayerIds(prev => prev.filter(other => !gone.has(other)))
          setActiveLayerIdRaw(current => (current && gone.has(current) ? (next.length > 0 ? next[0].id : null) : current))
        }
      )
    },
    [commitNewLayers, shiftEntitiesIndex]
  )

  const handleReorderLayers = useCallback(
    (newLayers: Layer[]) => {
      updateLayers(newLayers)
    },
    [updateLayers]
  )

  // ── Image layers ──────────────────────────────────────────────────────────
  const startImagePlacement = useCallback((pick: ImagePick) => setPendingImage(pick), [])
  const cancelImagePlacement = useCallback(() => setPendingImage(null), [])

  useEffect(() => {
    if (!pendingImage) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingImage(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingImage])

  const addImage = useCallback(
    (layerId: string, item: Omit<ImageItem, 'id'>): string | null => {
      let createdId: string | null = null
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1) return prev
          // With a group selected in the Images panel, what is placed goes into that group.
          const open = openImageGroupIdRef.current
          const intoGroup = !item.groupId && open && prev[index].groups?.some(g => g.id === open) ? open : undefined
          const image: ImageItem = { ...item, ...(intoGroup ? { groupId: intoGroup } : {}), id: crypto.randomUUID() }
          createdId = image.id
          const next = [...prev]
          next[index] = { ...prev[index], images: [...(prev[index].images || []), image] }
          return next
        },
        () => {
          if (createdId) setSelectedImageId(createdId)
        }
      )
      return createdId
    },
    [commitNewLayers, setSelectedImageId]
  )

  const updateImage = useCallback(
    (layerId: string, imageId: string, patch: Partial<Omit<ImageItem, 'id'>>) => {
      commitNewLayers(prev => {
        const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
        if (index === -1) return prev
        const images = prev[index].images || []
        const current = images.find(img => img.id === imageId)
        if (!current) return prev
        const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(key => current[key] !== patch[key])
        if (!changed) return prev
        const next = [...prev]
        next[index] = { ...prev[index], images: images.map(img => (img.id === imageId ? { ...img, ...patch } : img)) }
        return next
      })
    },
    [commitNewLayers]
  )

  /** A copy of an image (same picture and crop), a tile down-right of the original and picked, named like its neighbours. */
  const duplicateImage = useCallback(
    (layerId: string, imageId: string): string | null => {
      let createdId: string | null = null
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1) return prev
          const images = prev[index].images || []
          const at = images.findIndex(img => img.id === imageId)
          if (at === -1) return prev
          const source = images[at]
          const name = nextImageName(source.name || imagePickName(source), images.map(img => img.name || imagePickName(img)))
          const copy: ImageItem = { ...source, id: crypto.randomUUID(), name, x: source.x + 32, y: source.y + 32 }
          createdId = copy.id
          const next = [...prev]
          next[index] = { ...prev[index], images: [...images.slice(0, at + 1), copy, ...images.slice(at + 1)] }
          return next
        },
        () => {
          if (createdId) setSelectedImageId(createdId)
        }
      )
      return createdId
    },
    [commitNewLayers, setSelectedImageId]
  )

  /**
   * Dropped in front of (`top`) or behind (`bottom`) another image: the whole move is one undo step. The picture also joins the
   * group of the one it was dropped on, or leaves its group when that one has none (that is how a picture is dragged out).
   */
  const moveImageTo = useCallback(
    (layerId: string, imageId: string, targetId: string, position: 'top' | 'bottom', groupAfter?: string | null) => {
      commitNewLayers(prev => {
        const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
        if (index === -1) return prev
        const images = prev[index].images || []
        const ordered = moveInDrawOrderTo(images, imageId, targetId, position)
        // `groupAfter` (null = loose) when it was dropped beside a group's row rather than beside a picture.
        const targetGroup = groupAfter !== undefined ? groupAfter : images.find(i => i.id === targetId)?.groupId ?? null
        const regrouped = setGroupOf({ images: ordered, groups: prev[index].groups ?? [] }, [imageId], targetGroup)
        const moved = regrouped ? regrouped.images : ordered
        if (moved === images) return prev
        const next = [...prev]
        next[index] = { ...prev[index], images: moved }
        return next
      })
    },
    [commitNewLayers]
  )

  // Arrow keys move the picked image (see lib/imageNudge). Not while typing, in a dialog, or while placing a new image.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const delta = ARROW_DELTAS[e.key]
      if (!delta || e.ctrlKey || e.metaKey || e.altKey || pendingImage || !selectedImageId) return
      const target = e.target as HTMLElement | null
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="slider"]')) return
      const layer = layersRef.current.find(l => l.id === activeLayerId)
      const item = layer?.type === 'image' && !layer.locked ? layer.images?.find(i => i.id === selectedImageId) : undefined
      if (!layer || !item) return
      e.preventDefault()
      const step = nudgeStep(e.shiftKey)
      updateImage(layer.id, item.id, { x: item.x + delta.dx * step, y: item.y + delta.dy * step })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeLayerId, selectedImageId, pendingImage, layersRef, updateImage])

  /** One step toward the front (+1) or back (-1) in the layer's draw order. */
  const reorderImage = useCallback(
    (layerId: string, imageId: string, direction: 1 | -1) => {
      commitNewLayers(prev => {
        const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
        if (index === -1) return prev
        const images = prev[index].images || []
        const moved = moveInDrawOrder(images, imageId, direction)
        if (moved === images) return prev
        const next = [...prev]
        next[index] = { ...prev[index], images: moved }
        return next
      })
    },
    [commitNewLayers]
  )

  const deleteImage = useCallback(
    (layerId: string, imageId: string) => {
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1) return prev
          const images = prev[index].images || []
          if (!images.some(img => img.id === imageId)) return prev
          const next = [...prev]
          next[index] = { ...prev[index], images: images.filter(img => img.id !== imageId) }
          return next
        },
        () => setSelectedImageId(current => (current === imageId ? null : current))
      )
    },
    [commitNewLayers, setSelectedImageId]
  )

  /** Click on a picture of an image layer: replace the picked set, toggle it in (Ctrl/Cmd), or extend to it (Shift). */
  const selectImage = useCallback(
    (layerId: string, imageId: string, mode: SelectMode = 'replace') => {
      const layer = layersRef.current.find(l => l.id === layerId && l.type === 'image')
      if (!layer) return
      const gs = { images: layer.images ?? [], groups: layer.groups ?? [] }
      const clickedGroup = gs.images.find(i => i.id === imageId)?.groupId ?? null
      // Clicking a picture outside the open group closes it.
      const open = openImageGroupIdRef.current && openImageGroupIdRef.current === clickedGroup ? openImageGroupIdRef.current : null
      if (openImageGroupIdRef.current && !open) setOpenImageGroupId(null)

      const current = pickedImageIdsRef.current
      const primary = selectedImageIdRef.current
      const whole = mode === 'range' ? [imageId] : expandLockedGroups([imageId], gs, open)
      if (whole.length > 1) {
        // A click on a member of a locked group works on the whole group.
        const allPicked = whole.every(id => current.includes(id))
        const ids = mode === 'toggle' ? (allPicked ? current.filter(id => !whole.includes(id)) : [...new Set([...current, ...whole])]) : whole
        const nextPrimary = mode === 'toggle' && allPicked ? (primary && ids.includes(primary) ? primary : ids[ids.length - 1] ?? null) : imageId
        setSelectedImageIdRaw(nextPrimary)
        setExtraImageIds(ids.filter(id => id !== nextPrimary))
        return
      }
      const rowIds = sortedImages(layer.images).reverse().map(i => i.id)
      const next = selectImages({ ids: current, primary }, rowIds, imageId, mode)
      const ids = mode === 'range' ? expandLockedGroups(next.ids, gs, open) : next.ids
      setSelectedImageIdRaw(next.primary)
      setExtraImageIds(ids.filter(id => id !== next.primary))
    },
    [layersRef]
  )

  /** Select a group's row: all its members are picked, and from here on they can be picked one by one even if it is locked. */
  const selectImageGroup = useCallback(
    (layerId: string, groupId: string) => {
      const layer = layersRef.current.find(l => l.id === layerId && l.type === 'image')
      if (!layer?.groups?.some(g => g.id === groupId)) return
      const members = sortedImages(layer.images).reverse().filter(i => i.groupId === groupId)
      // An empty group can be selected too: what is added next goes into it.
      setSelectedImageIdRaw(members[0]?.id ?? null)
      setExtraImageIds(members.slice(1).map(i => i.id))
      setOpenImageGroupId(groupId)
    },
    [layersRef]
  )

  /** Change one image layer's pictures and groups in one undo step. */
  const editGroups = useCallback(
    (layerId: string, edit: (state: { images: ImageItem[]; groups: ImageGroup[] }) => { images: ImageItem[]; groups: ImageGroup[] } | null, after?: () => void) => {
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1 || prev[index].locked) return prev
          const state = { images: prev[index].images ?? [], groups: prev[index].groups ?? [] }
          const result = edit(state)
          if (!result || (result.images === state.images && result.groups === state.groups)) return prev
          const next = [...prev]
          const { groups, ...rest } = prev[index]
          void groups
          next[index] = { ...rest, images: result.images, ...(result.groups.length > 0 ? { groups: result.groups } : {}) }
          return next
        },
        after
      )
    },
    [commitNewLayers]
  )

  /** Put the picked pictures into a new group and select its row. */
  const groupPickedImages = useCallback(
    (layerId: string) => {
      const groupId = crypto.randomUUID()
      const ids = pickedImageIdsRef.current
      editGroups(
        layerId,
        state => groupImages(state, ids, groupId),
        () => setOpenImageGroupId(groupId)
      )
    },
    [editGroups]
  )

  /** A new group: empty, or holding `ids` (taken out of their groups). Returns its id, so its name can open for typing. */
  const createImageGroup = useCallback(
    (layerId: string, ids: readonly string[] = []) => {
      const groupId = crypto.randomUUID()
      let made: string | null = null
      editGroups(
        layerId,
        state => {
          const r = ids.length > 0 ? groupImages(state, ids, groupId) : createGroup(state, groupId)
          made = r ? r.groupId : null
          return r
        },
        () => ids.length > 0 && setOpenImageGroupId(groupId)
      )
      return made
    },
    [editGroups]
  )

  /** Move pictures into a group, or out of their group with null (they stay where they are on the map and in the list). */
  const setImagesGroup = useCallback(
    (layerId: string, ids: readonly string[], groupId: string | null) => {
      editGroups(layerId, state => setGroupOf(state, ids, groupId))
    },
    [editGroups]
  )

  /** Delete a group with every picture in it (an empty group just goes). */
  const deleteImageGroup = useCallback(
    (layerId: string, groupId: string) => {
      let removed: string[] = []
      editGroups(
        layerId,
        state => {
          const r = deleteGroup(state, groupId)
          removed = r.removed
          return { images: r.images, groups: r.groups }
        },
        () => {
          setOpenImageGroupId(current => (current === groupId ? null : current))
          if (removed.some(id => pickedImageIdsRef.current.includes(id))) setSelectedImageId(null)
        }
      )
    },
    [editGroups, setSelectedImageId]
  )

  const ungroupImageGroup = useCallback(
    (layerId: string, groupId: string) => {
      editGroups(
        layerId,
        state => ungroupImages(state, groupId),
        () => setOpenImageGroupId(current => (current === groupId ? null : current))
      )
    },
    [editGroups]
  )

  const renameImageGroup = useCallback(
    (layerId: string, groupId: string, name: string) => {
      const clean = name.trim()
      if (!clean) return
      editGroups(layerId, state => (state.groups.some(g => g.id === groupId && g.name !== clean) ? { ...state, groups: state.groups.map(g => (g.id === groupId ? { ...g, name: clean } : g)) } : null))
    },
    [editGroups]
  )

  const setImageGroupLocked = useCallback(
    (layerId: string, groupId: string, locked: boolean) => {
      editGroups(
        layerId,
        state => (state.groups.some(g => g.id === groupId && !!g.locked !== locked)
          ? { ...state, groups: state.groups.map(g => {
              if (g.id !== groupId) return g
              const { locked: _old, ...rest } = g
              return locked ? { ...rest, locked: true } : rest
            }) }
          : null),
        // Locking a group the author is inside keeps it open; locking another one just locks it.
        undefined
      )
    },
    [editGroups]
  )

  /** Y-sort on, off or (undefined) following the layer for a picture group. */
  const setImageGroupYSort = useCallback(
    (layerId: string, groupId: string, value: boolean | undefined) => {
      editGroups(layerId, state => {
        const group = state.groups.find(g => g.id === groupId)
        if (!group || group.ySort === value) return null
        return {
          ...state,
          groups: state.groups.map(g => {
            if (g.id !== groupId) return g
            const { ySort: _old, ...rest } = g
            return value === undefined ? rest : { ...rest, ySort: value }
          }),
        }
      })
    },
    [editGroups]
  )

  /** Y-sort on, off or (undefined) following the group / layer for some pictures, in one undo step. */
  const setImagesYSort = useCallback(
    (layerId: string, ids: readonly string[], value: boolean | undefined) => {
      const wanted = new Set(ids)
      editGroups(layerId, state => {
        if (!state.images.some(i => wanted.has(i.id) && i.ySort !== value)) return null
        return {
          ...state,
          images: state.images.map(i => {
            if (!wanted.has(i.id) || i.ySort === value) return i
            const { ySort: _old, ...rest } = i
            return value === undefined ? rest : { ...rest, ySort: value }
          }),
        }
      })
    },
    [editGroups]
  )

  /**
   * A whole group dragged in the pictures list: its pictures move as one block in front of (`top`) or behind (`bottom`)
   * a picture or another group (one undo step). They stay in their group.
   */
  const moveImageGroupTo = useCallback(
    (layerId: string, groupId: string, target: { kind: 'item' | 'group'; id: string }, position: 'top' | 'bottom') => {
      editGroups(layerId, state => {
        const ids = state.images.filter(i => i.groupId === groupId).map(i => i.id)
        const targetIds = target.kind === 'group' ? state.images.filter(i => i.groupId === target.id).map(i => i.id) : [target.id]
        const images = moveBlockInDrawOrder(state.images, ids, targetIds, position)
        return images === state.images ? null : { ...state, images }
      })
    },
    [editGroups]
  )

  /** Move several pictures by the same amount in one undo step (a dragged group). */
  const moveImages = useCallback(
    (layerId: string, ids: readonly string[], dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return
      editGroups(layerId, state => ({ ...state, images: moveItems(state.images, ids, dx, dy) }))
    },
    [editGroups]
  )

  /** Remove several pictures in one undo step. */
  const deleteImages = useCallback(
    (layerId: string, imageIds: readonly string[]) => {
      const gone = new Set(imageIds)
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1) return prev
          const images = prev[index].images || []
          if (!images.some(img => gone.has(img.id))) return prev
          const next = [...prev]
          const kept = pruneGroups({ images: images.filter(img => !gone.has(img.id)), groups: prev[index].groups ?? [] })
          const { groups: _old, ...rest } = prev[index]
          next[index] = { ...rest, images: kept.images, ...(kept.groups.length > 0 ? { groups: kept.groups } : {}) }
          return next
        },
        () => setSelectedImageId(null)
      )
    },
    [commitNewLayers, setSelectedImageId]
  )

  /** Put copies of `items` on the layer (one undo step) and pick them. `at` is where the first one goes (the cursor). */
  const addImageCopies = useCallback(
    (layerId: string, items: readonly ImageItem[], at: { x: number; y: number } | null, sourceGroups?: readonly ImageGroup[], intoGroupId?: string) => {
      let created: ImageItem[] = []
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1 || prev[index].locked) return prev
          const existing = prev[index].images || []
          const layerGroups = prev[index].groups ?? []
          // Copies of pictures that shared a group share a new group again; the originals' groups come from the layer or the clipboard.
          const into = intoGroupId && layerGroups.some(g => g.id === intoGroupId) ? intoGroupId : undefined
          const copied = into
            ? { items: pasteImageItems(items, existing, at).map(i => ({ ...i, groupId: into })), groups: [] as ImageGroup[] }
            : groupCopies(pasteImageItems(items, existing, at), sourceGroups ?? layerGroups, { images: existing, groups: layerGroups }, () => crypto.randomUUID())
          created = copied.items
          if (created.length === 0) return prev
          const next = [...prev]
          const groups = [...layerGroups, ...copied.groups]
          next[index] = { ...prev[index], images: [...existing, ...created], ...(groups.length > 0 ? { groups } : {}) }
          return next
        },
        () => {
          if (created.length === 0) return
          setSelectedImageIdRaw(created[created.length - 1].id)
          setExtraImageIds(created.slice(0, -1).map(i => i.id))
        }
      )
    },
    [commitNewLayers]
  )

  const imagesById = useCallback(
    (layerId: string, ids: readonly string[]): ImageItem[] => {
      const layer = layersRef.current.find(l => l.id === layerId && l.type === 'image')
      const wanted = new Set(ids)
      return sortedImages(layer?.images).filter(i => wanted.has(i.id))
    },
    [layersRef]
  )

  /** Start placing copies of a picture on the layer: it comes back as the placement preview with its crop, scale, flips and opacity, and each click adds one (Esc or a right-click ends it). */
  const placeMultiple = useCallback(
    (layerId: string, imageId: string) => {
      const item = imagesById(layerId, [imageId])[0]
      if (!item) return
      const { assetId, graphicId, crop, scale, flipX, flipY, opacity } = item
      const pick: ImagePick = { assetId, graphicId, crop: crop && { ...crop }, scale, flipX, flipY, opacity }
      setPendingImage(Object.fromEntries(Object.entries(pick).filter(([, v]) => v !== undefined)) as ImagePick)
    },
    [imagesById]
  )

  const duplicateImages = useCallback(
    (layerId: string, ids: readonly string[]) => addImageCopies(layerId, imagesById(layerId, ids), null),
    [addImageCopies, imagesById]
  )

  const copyImages = useCallback(
    (layerId: string, ids: readonly string[]) => {
      const items = imagesById(layerId, ids)
      const layer = layersRef.current.find(l => l.id === layerId && l.type === 'image')
      const used = new Set(items.map(i => i.groupId))
      const groups = (layer?.groups ?? []).filter(g => used.has(g.id))
      if (items.length > 0) useEditorClipboard.getState().set({ kind: 'images', items: snapshot(items), groups: snapshot(groups) })
      return items.length
    },
    [imagesById, layersRef]
  )

  /** Paste what was copied (pictures only) into the layer. */
  const pasteImages = useCallback(
    (layerId: string, at: { x: number; y: number } | null, intoGroupId?: string) => {
      const content = useEditorClipboard.getState().content
      if (content?.kind === 'images') addImageCopies(layerId, content.items, at, content.groups ?? [], intoGroupId)
    },
    [addImageCopies]
  )

  const activeLayerType = useMemo(
    () => layers.find(l => l.id === activeLayerId)?.type || null,
    [layers, activeLayerId]
  )

  return {
    layers,
    getLayers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    selectedLayerIds,
    selectLayer,
    pinSelection,
    setPinSelection,
    pendingImage,
    startImagePlacement,
    cancelImagePlacement,
    selectedImageId,
    resizingImageId,
    setResizingImageId,
    setSelectedImageId,
    pickedImageIds,
    selectImage,
    openImageGroupId,
    selectImageGroup,
    groupPickedImages,
    createImageGroup,
    setImagesGroup,
    deleteImageGroup,
    ungroupImageGroup,
    renameImageGroup,
    setImageGroupLocked,
    setImageGroupYSort,
    setImagesYSort,
    moveImageGroupTo,
    moveImages,
    deleteImages,
    duplicateImages,
    placeMultiple,
    copyImages,
    pasteImages,
    addImage,
    updateImage,
    deleteImage,
    duplicateImage,
    reorderImage,
    moveImageTo,
    tileSelection,
    setTileSelection,
    activeTool,
    setActiveTool,
    paintMode,
    setPaintMode,
    isPainting,
    setIsPainting,
    paintStartPos,
    setPaintStartPos,
    debugInfo,
    setDebugInfo,
    activeLayerType,
    updateLayers,
    setEntitiesIndex,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerYSort,
    toggleFolderCollapsed,
    justCreatedLayer,
    handleCreateLayer,
    handleCreateLayerOfType,
    handleRenameLayer,
    handleDuplicateLayer,
    copyLayers,
    duplicateLayers,
    pasteLayers,
    handleDeleteLayer,
    handleDeleteLayers,
    handleReorderLayers,
  }
}
