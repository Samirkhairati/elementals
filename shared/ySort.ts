// Y-sorting: a picture that is y-sorted draws among the characters by how far down the screen its anchor (bottom-centre)
// stands, so a character walking behind a tree is hidden by it and one in front covers its trunk. The setting can be
// made on a folder, an image layer, a picture group or a single picture; the nearest one that says on or off wins
// (a picture's own setting over its group's, over its layer's, over the folder's). Nothing set anywhere = not sorted.
// Pure TypeScript, shared by the editor (list badges, canvas) and the exporter (one `ySort` flag per exported picture).

export interface YSortLayerLike {
  id: string
  type: string
  ySort?: boolean
  folderId?: string
  groups?: { id: string; ySort?: boolean }[]
}

/** The first of `values` that is set (true or false), else false. */
export function firstSet(...values: (boolean | undefined)[]): boolean {
  for (const v of values) if (v !== undefined) return v
  return false
}

/** Whether a layer is y-sorted: its own setting, else its folder's. */
export function layerYSort(layer: YSortLayerLike, layers: readonly YSortLayerLike[]): boolean {
  const folder = layer.folderId ? layers.find((l) => l.id === layer.folderId && l.type === 'folder') : undefined
  return firstSet(layer.ySort, folder?.ySort)
}

/** What a layer gets when it has no setting of its own (its folder's, else off): shown as "follows the folder". */
export function inheritedLayerYSort(layer: YSortLayerLike, layers: readonly YSortLayerLike[]): boolean {
  const folder = layer.folderId ? layers.find((l) => l.id === layer.folderId && l.type === 'folder') : undefined
  return firstSet(folder?.ySort)
}

/** Whether a picture group draws y-sorted when its pictures do not say otherwise. */
export function groupYSort(layer: YSortLayerLike, groupId: string | undefined, layers: readonly YSortLayerLike[]): boolean {
  const group = groupId ? layer.groups?.find((g) => g.id === groupId) : undefined
  return group?.ySort ?? layerYSort(layer, layers)
}

/** Whether one picture of `layer` draws y-sorted. */
export function itemYSort(item: { ySort?: boolean; groupId?: string }, layer: YSortLayerLike, layers: readonly YSortLayerLike[]): boolean {
  return firstSet(item.ySort, groupYSort(layer, item.groupId, layers))
}

/** What a picture gets when it has no setting of its own (its group's, layer's or folder's). */
export function inheritedItemYSort(item: { groupId?: string }, layer: YSortLayerLike, layers: readonly YSortLayerLike[]): boolean {
  return groupYSort(layer, item.groupId, layers)
}
