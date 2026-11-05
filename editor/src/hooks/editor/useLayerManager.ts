import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { imagePickName, type ImagePick } from '@/lib/graphicAssets'
import { pasteImageItems, selectImages, type SelectMode } from '@/lib/imageSelection'
import { snapshot, useEditorClipboard } from '@/store/editorClipboard'
import { nextImageName } from '@/lib/imageItems'
import { Layer, LayerType, ImageItem, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData } from '@/types/editor'
import { useSyncedState } from '@/hooks/useSyncedState'
import { ARROW_DELTAS, nudgeStep } from '@/lib/imageNudge'
import { setFolderFlag } from '@/lib/layerFolders'
import { clampEntitiesIndex, entitiesIndexAfterInsert, entitiesIndexAfterRemove, moveInDrawOrder, moveInDrawOrderTo, sortedImages } from '@/lib/layerOrder'

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
  /** Picks only this picture (or none) and drops the rest of the picked set. */
  const setSelectedImageId = useCallback((next: React.SetStateAction<string | null>) => {
    setSelectedImageIdRaw(next)
    setExtraImageIds([])
  }, [])
  const selectedImageIdRef = useRef<string | null>(null)
  const pickedImageIdsRef = useRef<string[]>([])
  const pickedImageIds = useMemo(() => (selectedImageId ? [selectedImageId, ...extraImageIds.filter(id => id !== selectedImageId)] : []), [selectedImageId, extraImageIds])
  selectedImageIdRef.current = selectedImageId
  pickedImageIdsRef.current = pickedImageIds
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
  }, [])

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
    [activeLayerId, setActiveLayerId, layersRef]
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
          if (createdId) setActiveLayerId(createdId)
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

  const handleDuplicateLayer = useCallback(
    (id: string) => {
      let createdId: string | null = null
      let insertedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          const targetIndex = prev.findIndex(l => l.id === id)
          if (targetIndex === -1) return prev
          const targetLayer = prev[targetIndex]
          const newLayer: Layer = {
            ...targetLayer,
            id: crypto.randomUUID(),
            name: `${targetLayer.name} Copy`,
            data: targetLayer.data ? JSON.parse(JSON.stringify(targetLayer.data)) : undefined,
            images: targetLayer.images?.map(img => ({ ...img, id: crypto.randomUUID() })),
          }
          createdId = newLayer.id
          const next = [...prev]
          next.splice(targetIndex + 1, 0, newLayer)
          insertedAt = targetIndex + 1
          countBefore = prev.length
          return next
        },
        () => {
          if (createdId) setActiveLayerId(createdId)
          if (insertedAt >= 0) shiftEntitiesIndex(k => entitiesIndexAfterInsert(k, insertedAt, countBefore))
        }
      )
    },
    [commitNewLayers, setActiveLayerId, shiftEntitiesIndex]
  )

  /** The layers that can be copied: tile and image layers (folders and the gameplay layers are one-per-map or structural). */
  const copyableLayerIds = useCallback(
    (ids: readonly string[]) => layersRef.current.filter(l => ids.includes(l.id) && (l.type === 'tile' || l.type === 'image')).map(l => l.id),
    [layersRef]
  )

  /** Copy layers to the editor clipboard. */
  const copyLayers = useCallback(
    (ids: readonly string[]) => {
      const wanted = copyableLayerIds(ids)
      const list = layersRef.current.filter(l => wanted.includes(l.id))
      if (list.length > 0) useEditorClipboard.getState().set({ kind: 'layers', layers: snapshot(list) })
      return list.length
    },
    [copyableLayerIds, layersRef]
  )

  /** Insert copies of `source` layers (new ids, "Name Copy") above the layer `afterId`, in one undo step, and pick the last. */
  const insertLayerCopies = useCallback(
    (source: readonly Layer[], afterId: string | null) => {
      let createdId: string | null = null
      let insertedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          if (source.length === 0) return prev
          const taken = new Set(prev.map(l => l.name))
          const copies = source.map(layer => {
            let name = `${layer.name} Copy`
            for (let n = 2; taken.has(name); n++) name = `${layer.name} Copy ${n}`
            taken.add(name)
            const { folderId: _folder, ...rest } = layer
            return {
              ...rest,
              id: crypto.randomUUID(),
              name,
              data: layer.data ? JSON.parse(JSON.stringify(layer.data)) : undefined,
              images: layer.images?.map(img => ({ ...img, id: crypto.randomUUID() })),
            } as Layer
          })
          const at = afterId ? prev.findIndex(l => l.id === afterId) : -1
          insertedAt = at === -1 ? prev.length : at + 1
          countBefore = prev.length
          createdId = copies[copies.length - 1].id
          const next = [...prev]
          next.splice(insertedAt, 0, ...copies)
          return next
        },
        () => {
          if (createdId) setActiveLayerId(createdId)
          if (insertedAt >= 0) shiftEntitiesIndex(k => entitiesIndexAfterInsert(k, insertedAt, countBefore))
        }
      )
    },
    [commitNewLayers, setActiveLayerId, shiftEntitiesIndex]
  )

  /** Duplicate several layers at once (one undo step); the copies go above the highest of them. */
  const duplicateLayers = useCallback(
    (ids: readonly string[]) => {
      const wanted = copyableLayerIds(ids)
      const list = layersRef.current.filter(l => wanted.includes(l.id))
      if (list.length === 0) return
      insertLayerCopies(list, list[list.length - 1].id)
    },
    [copyableLayerIds, insertLayerCopies, layersRef]
  )

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
          const image: ImageItem = { ...item, id: crypto.randomUUID() }
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
    [commitNewLayers]
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
    [commitNewLayers]
  )

  /** Dropped in front of (`top`) or behind (`bottom`) another image: the whole move is one undo step. */
  const moveImageTo = useCallback(
    (layerId: string, imageId: string, targetId: string, position: 'top' | 'bottom') => {
      commitNewLayers(prev => {
        const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
        if (index === -1) return prev
        const images = prev[index].images || []
        const moved = moveInDrawOrderTo(images, imageId, targetId, position)
        if (moved === images) return prev
        const next = [...prev]
        next[index] = { ...prev[index], images: moved }
        return next
      })
    },
    [commitNewLayers]
  )

  // Arrow keys move the picked image (see lib/imageNudge). Not while typing, in a dialog, or while placing a new image.
  const repeatsRef = useRef(0)
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
      repeatsRef.current = e.repeat ? repeatsRef.current + 1 : 0
      const step = nudgeStep(e.shiftKey, repeatsRef.current)
      updateImage(layer.id, item.id, { x: item.x + delta.dx * step, y: item.y + delta.dy * step })
    }
    const onUp = () => {
      repeatsRef.current = 0
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
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
    [commitNewLayers]
  )

  /** Click on a picture of an image layer: replace the picked set, toggle it in (Ctrl/Cmd), or extend to it (Shift). */
  const selectImage = useCallback(
    (layerId: string, imageId: string, mode: SelectMode = 'replace') => {
      const layer = layersRef.current.find(l => l.id === layerId && l.type === 'image')
      if (!layer) return
      const rowIds = sortedImages(layer.images).reverse().map(i => i.id)
      const next = selectImages({ ids: pickedImageIdsRef.current, primary: selectedImageIdRef.current }, rowIds, imageId, mode)
      setSelectedImageIdRaw(next.primary)
      setExtraImageIds(next.ids.filter(id => id !== next.primary))
    },
    [layersRef]
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
          next[index] = { ...prev[index], images: images.filter(img => !gone.has(img.id)) }
          return next
        },
        () => setSelectedImageId(null)
      )
    },
    [commitNewLayers, setSelectedImageId]
  )

  /** Put copies of `items` on the layer (one undo step) and pick them. `at` is where the first one goes (the cursor). */
  const addImageCopies = useCallback(
    (layerId: string, items: readonly ImageItem[], at: { x: number; y: number } | null) => {
      let created: ImageItem[] = []
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1 || prev[index].locked) return prev
          const existing = prev[index].images || []
          created = pasteImageItems(items, existing, at)
          if (created.length === 0) return prev
          const next = [...prev]
          next[index] = { ...prev[index], images: [...existing, ...created] }
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

  const duplicateImages = useCallback(
    (layerId: string, ids: readonly string[]) => addImageCopies(layerId, imagesById(layerId, ids), null),
    [addImageCopies, imagesById]
  )

  const copyImages = useCallback(
    (layerId: string, ids: readonly string[]) => {
      const items = imagesById(layerId, ids)
      if (items.length > 0) useEditorClipboard.getState().set({ kind: 'images', items: snapshot(items) })
      return items.length
    },
    [imagesById]
  )

  /** Paste what was copied (pictures only) into the layer. */
  const pasteImages = useCallback(
    (layerId: string, at: { x: number; y: number } | null) => {
      const content = useEditorClipboard.getState().content
      if (content?.kind === 'images') addImageCopies(layerId, content.items, at)
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
    setSelectedImageId,
    pickedImageIds,
    selectImage,
    deleteImages,
    duplicateImages,
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
    toggleFolderCollapsed,
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
