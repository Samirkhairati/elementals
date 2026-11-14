// Everything about the pictures of image layers that is not general tree editing: the picture waiting to be placed, the
// picture whose resize handles show, adding and editing pictures (`picture` nodes inside an image layer or a group of it),
// the arrow-key nudge and the draw order. Selecting, copying, grouping and deleting pictures are the tree's own operations
// (see `useLayerManager`). Part of the layer manager, which composes it so the editor sees one manager.

import { useCallback, useEffect, useRef, useState } from 'react'
import { imagePickName, type ImagePick } from '@/lib/graphicAssets'
import { ARROW_DELTAS, nudgeStep } from '@/lib/imageNudge'
import { movePictureStep, patchNode, setYSort } from '@/lib/sceneOps'
import { layerOf, pictureLocked, shown } from '@/lib/sceneIndex'
import { insertNode, findNode, type PictureNode, type SceneNode } from '../../../../shared/sceneTree'
import type { ImageItem } from '@/types/editor'
import type { SceneTreeApi } from './useSceneTree'

export function useImageItems(tree: SceneTreeApi) {
  const { commit, getIndex, getSelection, selectMany, view } = tree
  /** The sprite asset or picture waiting to be dropped on the map. */
  const [pendingImage, setPendingImage] = useState<ImagePick | null>(null)
  /** The picture whose resize handles show on the canvas (Images panel › Resize); only while it is the one picture picked. */
  const [resizingRaw, setResizingImageId] = useState<string | null>(null)
  const resizingImageId = resizingRaw && resizingRaw === view.selectedImageId && view.pickedImageIds.length === 1 ? resizingRaw : null
  useEffect(() => {
    if (resizingRaw && !resizingImageId) setResizingImageId(null)
  }, [resizingRaw, resizingImageId])

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
  /** Adds a picture to an image layer (into the open group of the layer when one is selected) and picks it. Returns its id. */
  const addImage = useCallback(
    (layerId: string, item: Omit<ImageItem, 'id' | 'type' | 'name'> & { name?: string }): string | null => {
      let createdId: string | null = null
      commit(
        (prev) => {
          const layer = findNode(prev, layerId)
          if (!layer || layer.type !== 'image') return prev
          const open = getSelection().openGroupId
          const parent = open && findNode([layer], open)?.type === 'group' ? open : layerId
          const picture: PictureNode = { ...item, id: crypto.randomUUID(), type: 'picture', name: item.name ?? imagePickName(item) }
          const next = insertNode(prev, parent, picture)
          if (next !== prev) createdId = picture.id
          return next
        },
        () => {
          if (createdId) selectMany(createdId, [createdId], getSelection().openGroupId)
        }
      )
      return createdId
    },
    [commit, getSelection, selectMany]
  )

  const updateImage = useCallback(
    (_layerId: string, imageId: string, patch: Partial<Omit<ImageItem, 'id' | 'type'>>) => {
      commit((prev) => patchNode(prev, imageId, patch as Record<string, unknown>))
    },
    [commit]
  )

  /** One step toward the front (+1) or back (-1) in the layer's draw order. */
  const reorderImage = useCallback(
    (layerId: string, imageId: string, direction: 1 | -1) => {
      commit((prev) => movePictureStep(prev, layerId, imageId, direction))
    },
    [commit]
  )

  /** Move several pictures by the same amount in one undo step (a dragged group). */
  const moveImages = useCallback(
    (_layerId: string, ids: readonly string[], dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return
      const wanted = new Set(ids)
      commit((prev) => {
        let next = prev
        for (const id of wanted) {
          const node = findNode(next, id)
          if (node?.type === 'picture') next = patchNode(next, id, { x: node.x + dx, y: node.y + dy })
        }
        return next
      })
    },
    [commit]
  )

  /** Y-sort on, off or (undefined) following the group / layer for some pictures or groups, in one undo step. */
  const setNodesYSort = useCallback(
    (ids: readonly string[], value: boolean | undefined) => {
      commit((prev) => ids.reduce((acc: SceneNode[], id) => setYSort(acc, id, value), prev))
    },
    [commit]
  )

  // Arrow keys move the picked picture (see lib/imageNudge). Not while typing, in a dialog, or while placing a new image.
  const nudgeRef = useRef({ view, pendingImage })
  nudgeRef.current = { view, pendingImage }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const delta = ARROW_DELTAS[e.key]
      const { view: v, pendingImage: placing } = nudgeRef.current
      if (!delta || e.ctrlKey || e.metaKey || e.altKey || placing || !v.selectedImageId) return
      const target = e.target as HTMLElement | null
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="slider"]')) return
      const index = getIndex()
      const node = index.byId.get(v.selectedImageId)?.node
      if (node?.type !== 'picture' || pictureLocked(index, node.id) || !shown(index, node.id)) return
      e.preventDefault()
      const step = nudgeStep(e.shiftKey)
      const layerId = index.byId.get(node.id)?.ancestors.find((a) => a.type === 'image')?.id ?? ''
      updateImage(layerId, node.id, { x: node.x + delta.dx * step, y: node.y + delta.dy * step })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [getIndex, updateImage])

  /** Start placing copies of a picture: it comes back as the placement preview with its crop, scale, flips and opacity, and each click adds one (Esc or a right-click ends it). */
  const placeMultiple = useCallback(
    (_layerId: string, imageId: string) => {
      const item = getIndex().byId.get(imageId)?.node
      if (item?.type !== 'picture') return
      const { assetId, graphicId, crop, scale, flipX, flipY, opacity } = item
      const pick: ImagePick = { assetId, graphicId, crop: crop && { ...crop }, scale, flipX, flipY, opacity }
      setPendingImage(Object.fromEntries(Object.entries(pick).filter(([, v]) => v !== undefined)) as ImagePick)
    },
    [getIndex]
  )

  /** The image layer a picture or group sits in (undefined when it is in none). */
  const imageLayerOf = useCallback(
    (id: string) => {
      const entry = getIndex().byId.get(id)
      const layer = entry && (entry.node.type === 'image' ? entry.node : entry.ancestors.find((a) => a.type === 'image'))
      return layer ? layerOf(getIndex(), layer.id) : undefined
    },
    [getIndex]
  )

  return {
    pendingImage,
    startImagePlacement,
    cancelImagePlacement,
    resizingImageId,
    setResizingImageId,
    addImage,
    updateImage,
    reorderImage,
    moveImages,
    setNodesYSort,
    placeMultiple,
    imageLayerOf,
  }
}
