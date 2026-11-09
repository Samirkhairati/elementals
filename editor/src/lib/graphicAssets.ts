// Plain pictures (project/graphics) as sprite-shaped assets, so the map canvas can draw an image-layer item the
// same way whether it is a sprite or a raw graphic. The key space is separate from character ids ("graphic:" has
// a colon, which no id can contain).

import { characterToAssetInfo, type GraphicInfo } from '../../../shared/engine/graphics'
import type { SpriteAssetInfo } from '../../../shared/engine/types'
import { newCharacter } from './characterEdit'

/** What an image-layer item points at: a sprite or a picture. */
export interface ImagePick {
  assetId?: string
  graphicId?: string
  /** Only this part of the picture (see EditorImageItem.crop). */
  crop?: { x: number; y: number; w: number; h: number }
  /** Look of the copies when placing several of an existing picture (see "Place multiple"); absent = the defaults. */
  scale?: number
  flipX?: boolean
  flipY?: boolean
  opacity?: number
}

export const graphicAssetKey = (graphicId: string): string => `graphic:${graphicId}`

/** Key of the item's picture in the canvas' asset map ('' when it points at nothing). Crops of one picture share its key. */
export const imagePickKey = (pick: ImagePick): string => (pick.graphicId ? graphicAssetKey(pick.graphicId) : pick.assetId ?? '')

/** Readable id of what an item shows (the sprite id or the graphic id, with its folders). */
export const imagePickLabel = (pick: ImagePick): string => pick.graphicId || pick.assetId || ''

/** The default name of an item: the picture's own name, not where it is (`images/city/dam-wall.png` -> `dam-wall`). */
export const imagePickName = (pick: ImagePick): string => {
  const id = imagePickLabel(pick)
  return id.slice(id.lastIndexOf('/') + 1).replace(/\.png$/i, '')
}

/** A picture as one still frame (the whole image) anchored bottom-centre. */
export function graphicAsset(graphic: GraphicInfo, url: string): SpriteAssetInfo {
  const name = graphic.id.slice(graphic.id.lastIndexOf('/') + 1).replace(/\.png$/i, '')
  const def = newCharacter('prop', name, graphic.id, graphic)
  return characterToAssetInfo({ id: graphicAssetKey(graphic.id), def, images: { [graphic.id]: url } }) as SpriteAssetInfo
}

export function graphicAssets(graphics: readonly GraphicInfo[], images: Record<string, string>): Record<string, SpriteAssetInfo> {
  const out: Record<string, SpriteAssetInfo> = {}
  for (const g of graphics) if (images[g.id]) out[graphicAssetKey(g.id)] = graphicAsset(g, images[g.id])
  return out
}
