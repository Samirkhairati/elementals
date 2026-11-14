// The selection of the scene tree: one set of node ids across every type (layers, groups, pictures, entities, collision
// items), with a primary node (the last one clicked, which the inspectors show), the group whose row is "open" and the
// last layer that was active. The old per-kind views (active layer, picked pictures, selected entity...) are derived from it.
// Everything here is pure: a transition takes the selection and the tree index and returns the next selection.

import { isLayerNode } from '../../../shared/sceneTree'
import { layerAbove, nodeOf, type SceneIndex } from './sceneIndex'
import { pictureIdsBelow } from './sceneOps'

export type SelectMode = 'replace' | 'toggle' | 'range'

export interface SceneSelection {
  /** Everything selected (the primary one included), in the order it was picked. */
  ids: string[]
  /** The node the inspectors show and the arrow keys move: the last one clicked. */
  primary: string | null
  /** Where a shift-click range starts. */
  anchor: string | null
  /** The group whose row is selected: its pictures can be picked one by one even when it is locked, and what is placed goes into it. */
  openGroupId: string | null
  /** The last layer (or group) that was active: it stays the active one while an entity is selected. */
  lastLayerId: string | null
}

export const NO_SELECTION: SceneSelection = { ids: [], primary: null, anchor: null, openGroupId: null, lastLayerId: null }

/** A group that sits inside an image layer: it holds pictures and is picked, moved and locked as a set of them. */
export function isPictureGroup(index: SceneIndex, id: string): boolean {
  const entry = index.byId.get(id)
  return !!entry && entry.node.type === 'group' && entry.ancestors.some((a) => a.type === 'image')
}

/**
 * The layer (or group) the panels treat as the active one for a node: a layer is itself, a picture, picture group or
 * collision item stands for its layer, a plain group is itself. Undefined for an entity or a node outside any layer.
 */
export function activeLayerFor(index: SceneIndex, id: string | null | undefined): string | undefined {
  const node = nodeOf(index, id)
  if (!node) return undefined
  const layer = layerAbove(index, node.id)
  if (layer) return layer.id
  return node.type === 'group' ? node.id : undefined
}

/** Ids a click on a picture should pick: the picture, or every picture of the outermost locked group it is in (unless that group is the open one or above it). */
export function expandPictureClick(index: SceneIndex, pictureId: string, openGroupId: string | null): string[] {
  const entry = index.byId.get(pictureId)
  if (!entry) return [pictureId]
  const groups = entry.ancestors.filter((a, i) => a.type === 'group' && entry.ancestors.slice(0, i).some((p) => p.type === 'image'))
  // Groups up to and including the open one do not hold the click together any more.
  const openAt = openGroupId ? groups.findIndex((g) => g.id === openGroupId) : -1
  const holding = groups.slice(openAt + 1).find((g) => g.locked === true)
  return holding ? pictureIdsBelow(holding) : [pictureId]
}

function withLayer(sel: SceneSelection, index: SceneIndex): SceneSelection {
  const layer = activeLayerFor(index, sel.primary)
  return layer && layer !== sel.lastLayerId ? { ...sel, lastLayerId: layer } : sel
}

/** What picking a node picks: itself, plus the pictures of a picture group or of a locked group it belongs to. */
function picksOf(index: SceneIndex, id: string, openGroupId: string | null): string[] {
  const node = nodeOf(index, id)
  if (!node) return []
  if (node.type === 'picture') return expandPictureClick(index, id, openGroupId)
  if (isPictureGroup(index, id)) return [id, ...pictureIdsBelow(node)]
  return [id]
}

/**
 * A click on a row or a picture. A plain click picks only it; Ctrl/Cmd (`toggle`) adds it or takes it out; Shift (`range`)
 * picks everything between the anchor and it in `rows` (the node ids in the order they are listed). Picking a picture group
 * picks its pictures too, and a picture of a locked group picks the whole group.
 */
export function selectNode(sel: SceneSelection, index: SceneIndex, id: string, mode: SelectMode = 'replace', rows: readonly string[] = []): SceneSelection {
  const node = nodeOf(index, id)
  if (!node) return sel
  if (mode === 'replace') {
    // Clicking a picture inside the open group keeps it open; anything else closes it.
    const open = sel.openGroupId && node.type === 'picture' && index.byId.get(id)?.ancestors.some((a) => a.id === sel.openGroupId) ? sel.openGroupId : isPictureGroup(index, id) ? id : null
    return withLayer({ ...sel, ids: picksOf(index, id, open), primary: id, anchor: id, openGroupId: open }, index)
  }
  if (mode === 'toggle') {
    const picks = picksOf(index, id, sel.openGroupId)
    const present = sel.ids.includes(id) || (picks.length > 1 && picks.every((p) => sel.ids.includes(p)))
    if (present) {
      const gone = new Set(picks)
      const ids = sel.ids.filter((x) => !gone.has(x))
      const primary = sel.primary && ids.includes(sel.primary) ? sel.primary : ids[ids.length - 1] ?? null
      return withLayer({ ...sel, ids, primary, anchor: primary, openGroupId: sel.openGroupId && ids.includes(sel.openGroupId) ? sel.openGroupId : null }, index)
    }
    return withLayer({ ...sel, ids: [...new Set([...sel.ids, ...picks])], primary: id, anchor: id, openGroupId: sel.openGroupId }, index)
  }
  const at = rows.indexOf(id)
  const from = sel.anchor && rows.includes(sel.anchor) ? rows.indexOf(sel.anchor) : at
  if (at === -1 || from === -1) return selectNode(sel, index, id, 'replace')
  const span = rows.slice(Math.min(from, at), Math.max(from, at) + 1)
  const ids = [...new Set(span.flatMap((rowId) => picksOf(index, rowId, null)))]
  return withLayer({ ...sel, ids, primary: id, anchor: sel.anchor ?? id, openGroupId: null }, index)
}

/** Exactly these nodes are selected, `primary` the main one (made, pasted or grouped nodes). */
export function selectMany(sel: SceneSelection, index: SceneIndex, primary: string | null, ids: readonly string[], openGroupId: string | null = null): SceneSelection {
  const present = ids.filter((id) => index.byId.has(id))
  const main = primary && present.includes(primary) ? primary : present[present.length - 1] ?? null
  return withLayer({ ...sel, ids: [...new Set(present)], primary: main, anchor: main, openGroupId: openGroupId && index.byId.has(openGroupId) ? openGroupId : null }, index)
}

/** Nothing selected (the last active layer is remembered). */
export const clearSelection = (sel: SceneSelection): SceneSelection => (sel.ids.length === 0 && sel.primary === null ? sel : { ...sel, ids: [], primary: null, anchor: null, openGroupId: null })

/** The selection without the ids that are no longer in the tree (after undo, delete, resize). */
export function pruneSelection(sel: SceneSelection, index: SceneIndex): SceneSelection {
  const ids = sel.ids.filter((id) => index.byId.has(id))
  const primary = sel.primary && ids.includes(sel.primary) ? sel.primary : ids[ids.length - 1] ?? null
  const anchor = sel.anchor && index.byId.has(sel.anchor) ? sel.anchor : primary
  const open = sel.openGroupId && index.byId.has(sel.openGroupId) ? sel.openGroupId : null
  const last = sel.lastLayerId && index.byId.has(sel.lastLayerId) ? sel.lastLayerId : null
  if (ids.length === sel.ids.length && primary === sel.primary && anchor === sel.anchor && open === sel.openGroupId && last === sel.lastLayerId) return sel
  return withLayer({ ...sel, ids, primary, anchor, openGroupId: open, lastLayerId: last }, index)
}

// ── the views the rest of the editor reads ─────────────────────────────────────────────────────────

export interface SelectionView {
  /** The node the inspectors show (the last one clicked), when it is in the tree. */
  primaryId: string | null
  /** The layer (or plain group) the tileset, images and collision panels and painting work on. */
  activeLayerId: string | null
  /** Layers picked besides the active one (Ctrl/Cmd+click). */
  selectedLayerIds: string[]
  selectedEntityId: string | null
  /** The picture the images panel shows: the primary node when it is a picture, else the first picked picture. */
  selectedImageId: string | null
  /** Every picked picture (the primary one first). */
  pickedImageIds: string[]
  openImageGroupId: string | null
  /** Every selected id that is in the tree. */
  ids: string[]
}

const NONE: string[] = []

export function viewOf(sel: SceneSelection, index: SceneIndex): SelectionView {
  const ids = sel.ids.filter((id) => index.byId.has(id))
  const primary = sel.primary && index.byId.has(sel.primary) ? sel.primary : null
  const primaryNode = nodeOf(index, primary)
  let activeLayerId: string | null = null
  if (primaryNode?.type === 'entity') activeLayerId = sel.lastLayerId && index.byId.has(sel.lastLayerId) ? sel.lastLayerId : null
  else activeLayerId = activeLayerFor(index, primary) ?? null

  const pictures = ids.filter((id) => index.byId.get(id)?.node.type === 'picture')
  const pickedImageIds = primary && pictures.includes(primary) ? [primary, ...pictures.filter((id) => id !== primary)] : pictures
  const layerIds = ids.filter((id) => {
    const n = index.byId.get(id)?.node
    return !!n && id !== activeLayerId && (isLayerNode(n) || (n.type === 'group' && !isPictureGroup(index, id)))
  })
  return {
    primaryId: primary,
    activeLayerId,
    selectedLayerIds: layerIds.length > 0 ? layerIds : NONE,
    selectedEntityId: primaryNode?.type === 'entity' ? primaryNode.id : null,
    selectedImageId: primaryNode?.type === 'picture' ? primaryNode.id : pickedImageIds[0] ?? null,
    pickedImageIds: pickedImageIds.length > 0 ? pickedImageIds : NONE,
    openImageGroupId: sel.openGroupId && index.byId.has(sel.openGroupId) ? sel.openGroupId : null,
    ids,
  }
}

/** Whether two views say the same (so a view can keep its identity while the tree changes under it). */
export function sameView(a: SelectionView | null | undefined, b: SelectionView): boolean {
  if (!a) return false
  const arrays: (keyof SelectionView)[] = ['selectedLayerIds', 'pickedImageIds', 'ids']
  for (const key of arrays) {
    const x = a[key] as string[]
    const y = b[key] as string[]
    if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false
  }
  return a.primaryId === b.primaryId && a.activeLayerId === b.activeLayerId && a.selectedEntityId === b.selectedEntityId && a.selectedImageId === b.selectedImageId && a.openImageGroupId === b.openImageGroupId
}
