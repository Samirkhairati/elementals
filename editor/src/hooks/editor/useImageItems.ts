// Everything about the pictures of image layers: the picture waiting to be placed, which pictures are picked (and the
// open group), and every edit of an image layer's pictures and groups. Part of the layer manager (`useLayerManager`
// composes it and hands it the layers and the one way layers are committed); the maths lives in lib/ (imageGroups,
// imageSelection, layerOrder, imageLayerEdit).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { imagePickName, type ImagePick } from '@/lib/graphicAssets'
import { pasteImageItems, selectImages, type SelectMode } from '@/lib/imageSelection'
import { createGroup, deleteGroup, expandLockedGroups, groupCopies, groupImages, moveItems, pruneGroups, setGroupOf, ungroupImages } from '@/lib/imageGroups'
import { editImageLayer, imageLayerState, withImagesAndGroups, type ImageLayerState } from '@/lib/imageLayerEdit'
import { snapshot, useEditorClipboard } from '@/store/editorClipboard'
import { nextImageName } from '@/lib/imageItems'
import { ARROW_DELTAS, nudgeStep } from '@/lib/imageNudge'
import { moveBlockInDrawOrder, moveInDrawOrder, moveInDrawOrderTo, sortedImages } from '@/lib/layerOrder'
import type { ImageGroup, ImageItem, Layer } from '@/types/editor'

export interface UseImageItemsOptions {
  /** The live layer list (read in event handlers). */
  layersRef: React.MutableRefObject<Layer[]>
  /** The layer manager's one way to change layers: one undo step, `onAfter` once the new layers are set. */
  commitNewLayers: (updater: (prev: Layer[]) => Layer[], onAfter?: (next: Layer[]) => void) => void
  activeLayerId: string | null
}

export function useImageItems({ layersRef, commitNewLayers, activeLayerId }: UseImageItemsOptions) {
  /** The sprite asset or picture waiting to be dropped on the map. */
  const [pendingImage, setPendingImage] = useState<ImagePick | null>(null)
  const [selectedImageId, setSelectedImageIdRaw] = useState<string | null>(null)
  /** Pictures picked besides `selectedImageId` (Ctrl/Cmd or Shift+click). Together they are the picked set. */
  const [extraImageIds, setExtraImageIds] = useState<string[]>([])
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

  /** Picks exactly these pictures, `primary` first. */
  const pickImages = useCallback((primary: string | null, ids: readonly string[]) => {
    setSelectedImageIdRaw(primary)
    setExtraImageIds(ids.filter(id => id !== primary))
  }, [])

  // ── placing ───────────────────────────────────────────────────────────────
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

  // ── single pictures ───────────────────────────────────────────────────────
  const addImage = useCallback(
    (layerId: string, item: Omit<ImageItem, 'id'>): string | null => {
      let createdId: string | null = null
      commitNewLayers(
        prev =>
          editImageLayer(prev, layerId, (layer, images) => {
            // With a group selected in the Images panel, what is placed goes into that group.
            const open = openImageGroupIdRef.current
            const intoGroup = !item.groupId && open && layer.groups?.some(g => g.id === open) ? open : undefined
            const image: ImageItem = { ...item, ...(intoGroup ? { groupId: intoGroup } : {}), id: crypto.randomUUID() }
            createdId = image.id
            return { ...layer, images: [...images, image] }
          }),
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
      commitNewLayers(prev =>
        editImageLayer(prev, layerId, (layer, images) => {
          const current = images.find(img => img.id === imageId)
          if (!current) return null
          const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(key => current[key] !== patch[key])
          return changed ? { ...layer, images: images.map(img => (img.id === imageId ? { ...img, ...patch } : img)) } : null
        })
      )
    },
    [commitNewLayers]
  )

  /** A copy of an image (same picture and crop), a tile down-right of the original and picked, named like its neighbours. */
  const duplicateImage = useCallback(
    (layerId: string, imageId: string): string | null => {
      let createdId: string | null = null
      commitNewLayers(
        prev =>
          editImageLayer(prev, layerId, (layer, images) => {
            const at = images.findIndex(img => img.id === imageId)
            if (at === -1) return null
            const source = images[at]
            const name = nextImageName(source.name || imagePickName(source), images.map(img => img.name || imagePickName(img)))
            const copy: ImageItem = { ...source, id: crypto.randomUUID(), name, x: source.x + 32, y: source.y + 32 }
            createdId = copy.id
            return { ...layer, images: [...images.slice(0, at + 1), copy, ...images.slice(at + 1)] }
          }),
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
      commitNewLayers(prev =>
        editImageLayer(prev, layerId, (layer, images) => {
          const ordered = moveInDrawOrderTo(images, imageId, targetId, position)
          // `groupAfter` (null = loose) when it was dropped beside a group's row rather than beside a picture.
          const targetGroup = groupAfter !== undefined ? groupAfter : images.find(i => i.id === targetId)?.groupId ?? null
          const regrouped = setGroupOf({ images: ordered, groups: layer.groups ?? [] }, [imageId], targetGroup)
          const moved = regrouped ? regrouped.images : ordered
          return moved === images ? null : { ...layer, images: moved }
        })
      )
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
      commitNewLayers(prev =>
        editImageLayer(prev, layerId, (layer, images) => {
          const moved = moveInDrawOrder(images, imageId, direction)
          return moved === images ? null : { ...layer, images: moved }
        })
      )
    },
    [commitNewLayers]
  )

  const deleteImage = useCallback(
    (layerId: string, imageId: string) => {
      commitNewLayers(
        prev => editImageLayer(prev, layerId, (layer, images) => (images.some(img => img.id === imageId) ? { ...layer, images: images.filter(img => img.id !== imageId) } : null)),
        () => setSelectedImageId(current => (current === imageId ? null : current))
      )
    },
    [commitNewLayers, setSelectedImageId]
  )

  // ── picking ───────────────────────────────────────────────────────────────
  /** Click on a picture of an image layer: replace the picked set, toggle it in (Ctrl/Cmd), or extend to it (Shift). */
  const selectImage = useCallback(
    (layerId: string, imageId: string, mode: SelectMode = 'replace') => {
      const layer = layersRef.current.find(l => l.id === layerId && l.type === 'image')
      if (!layer) return
      const gs = imageLayerState(layer)
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
        pickImages(nextPrimary, ids)
        return
      }
      const rowIds = sortedImages(layer.images).reverse().map(i => i.id)
      const next = selectImages({ ids: current, primary }, rowIds, imageId, mode)
      pickImages(next.primary, mode === 'range' ? expandLockedGroups(next.ids, gs, open) : next.ids)
    },
    [layersRef, pickImages]
  )

  /** Select a group's row: all its members are picked, and from here on they can be picked one by one even if it is locked. */
  const selectImageGroup = useCallback(
    (layerId: string, groupId: string) => {
      const layer = layersRef.current.find(l => l.id === layerId && l.type === 'image')
      if (!layer?.groups?.some(g => g.id === groupId)) return
      const members = sortedImages(layer.images).reverse().filter(i => i.groupId === groupId)
      // An empty group can be selected too: what is added next goes into it.
      pickImages(members[0]?.id ?? null, members.slice(1).map(i => i.id))
      setOpenImageGroupId(groupId)
    },
    [layersRef, pickImages]
  )

  // ── groups ────────────────────────────────────────────────────────────────
  /** Change one image layer's pictures and groups in one undo step (not on a locked layer). */
  const editGroups = useCallback(
    (layerId: string, edit: (state: ImageLayerState) => ImageLayerState | null, after?: () => void) => {
      commitNewLayers(
        prev =>
          editImageLayer(
            prev,
            layerId,
            layer => {
              const state = imageLayerState(layer)
              const result = edit(state)
              if (!result || (result.images === state.images && result.groups === state.groups)) return null
              return withImagesAndGroups(layer, result.images, result.groups)
            },
            { skipLocked: true }
          ),
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

  /** Applies `patch` to one group; nothing when the group is missing or `patch` returns it unchanged. */
  const editGroup = useCallback(
    (layerId: string, groupId: string, patch: (group: ImageGroup) => ImageGroup) => {
      editGroups(layerId, state => {
        const group = state.groups.find(g => g.id === groupId)
        if (!group) return null
        const next = patch(group)
        return next === group ? null : { ...state, groups: state.groups.map(g => (g.id === groupId ? next : g)) }
      })
    },
    [editGroups]
  )

  const renameImageGroup = useCallback(
    (layerId: string, groupId: string, name: string) => {
      const clean = name.trim()
      if (clean) editGroup(layerId, groupId, g => (g.name === clean ? g : { ...g, name: clean }))
    },
    [editGroup]
  )

  /** Locking a group the author is inside keeps it open; locking another one just locks it. */
  const setImageGroupLocked = useCallback(
    (layerId: string, groupId: string, locked: boolean) => {
      editGroup(layerId, groupId, g => {
        if (!!g.locked === locked) return g
        const { locked: _old, ...rest } = g
        return locked ? { ...rest, locked: true } : rest
      })
    },
    [editGroup]
  )

  /** Y-sort on, off or (undefined) following the layer for a picture group. */
  const setImageGroupYSort = useCallback(
    (layerId: string, groupId: string, value: boolean | undefined) => {
      editGroup(layerId, groupId, g => {
        if (g.ySort === value) return g
        const { ySort: _old, ...rest } = g
        return value === undefined ? rest : { ...rest, ySort: value }
      })
    },
    [editGroup]
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

  // ── several pictures ──────────────────────────────────────────────────────
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
        prev =>
          editImageLayer(prev, layerId, (layer, images) => {
            if (!images.some(img => gone.has(img.id))) return null
            const kept = pruneGroups({ images: images.filter(img => !gone.has(img.id)), groups: layer.groups ?? [] })
            return withImagesAndGroups(layer, kept.images, kept.groups)
          }),
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
        prev =>
          editImageLayer(
            prev,
            layerId,
            (layer, existing) => {
              const layerGroups = layer.groups ?? []
              // Copies of pictures that shared a group share a new group again; the originals' groups come from the layer or the clipboard.
              const into = intoGroupId && layerGroups.some(g => g.id === intoGroupId) ? intoGroupId : undefined
              const copied = into
                ? { items: pasteImageItems(items, existing, at).map(i => ({ ...i, groupId: into })), groups: [] as ImageGroup[] }
                : groupCopies(pasteImageItems(items, existing, at), sourceGroups ?? layerGroups, { images: existing, groups: layerGroups }, () => crypto.randomUUID())
              created = copied.items
              if (created.length === 0) return null
              const groups = [...layerGroups, ...copied.groups]
              return { ...layer, images: [...existing, ...created], ...(groups.length > 0 ? { groups } : {}) }
            },
            { skipLocked: true }
          ),
        () => {
          if (created.length > 0) pickImages(created[created.length - 1].id, created.slice(0, -1).map(i => i.id))
        }
      )
    },
    [commitNewLayers, pickImages]
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

  return {
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
  }
}
