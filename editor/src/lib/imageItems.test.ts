import { describe, expect, it } from 'vitest'
import type { SpriteAssetInfo } from '../../../shared/engine/types'
import { flippedItemBounds, itemBounds, itemSourceSize, nextImageName, snapImageAnchor } from './imageItems'

const sheet = {
  id: 'graphic:sky/sheet.png',
  meta: { version: 1, name: 'sheet', kind: 'object', frameWidth: 64, frameHeight: 32, margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1 },
  sheets: { 'sheet.png': 'data:image/png;base64,AA==' },
} as unknown as SpriteAssetInfo
const assets = { 'graphic:sky/sheet.png': sheet }

describe('imageItems', () => {
  it('a whole picture is its frame; a crop is its rectangle, both standing on the bottom-centre', () => {
    const whole = { graphicId: 'sky/sheet.png' }
    expect(itemSourceSize(whole, assets)).toEqual({ w: 64, h: 32 })
    expect(itemBounds(whole, assets)).toEqual({ x: -32, y: -32, w: 64, h: 32 })

    const part = { graphicId: 'sky/sheet.png', crop: { x: 32, y: 0, w: 16, h: 8 }, scale: 2 }
    expect(itemSourceSize(part, assets)).toEqual({ w: 16, h: 8 })
    expect(itemBounds(part, assets)).toEqual({ x: -16, y: -16, w: 32, h: 16 })
  })

  it('a scaled item keeps its exact size in the editor (the game rounds)', () => {
    const part = { graphicId: 'sky/sheet.png', crop: { x: 0, y: 0, w: 15, h: 15 }, scale: 1.5 }
    const b = itemBounds(part, assets)
    expect(b).toEqual({ x: -11.25, y: -22.5, w: 22.5, h: 22.5 })
    expect(itemBounds({ graphicId: 'sky/sheet.png', scale: 0.5 }, assets)).toMatchObject({ w: 32, h: 16 })
  })

  it('every crop of a picture uses the one asset, so nothing is copied per crop', () => {
    const a = itemBounds({ graphicId: 'sky/sheet.png', crop: { x: 0, y: 0, w: 8, h: 8 } }, assets)
    const b = itemBounds({ graphicId: 'sky/sheet.png', crop: { x: 8, y: 8, w: 8, h: 8 } }, assets)
    expect(a).toEqual(b)
    expect(Object.keys(assets)).toHaveLength(1)
  })

  it('falls back to a tile-sized box when the picture is unknown', () => {
    expect(itemBounds({ graphicId: 'gone.png' }, assets)).toEqual({ x: -16, y: -32, w: 32, h: 32 })
    expect(itemSourceSize({ graphicId: 'gone.png' }, assets)).toBeNull()
  })

  it('snapping puts the picture\'s edges on the grid, so a two-tile picture is not half a tile off', () => {
    // 64x32 picture: anchor is the bottom-centre, so the anchor must sit on a tile line (x multiple of 32), not on a tile centre
    const b = flippedItemBounds({ graphicId: 'sky/sheet.png' }, assets)
    expect(snapImageAnchor(b, 101, 70)).toEqual({ x: 96, y: 64 })
    expect(snapImageAnchor(b, 120, 90)).toEqual({ x: 128, y: 96 })
    // a one-tile picture keeps the old behaviour: anchor at the tile's bottom-centre
    const tile = { x: -16, y: -32, w: 32, h: 32 }
    expect(snapImageAnchor(tile, 40, 50)).toEqual({ x: 48, y: 64 })
    // flipping mirrors the frame around the anchor, and the left edge still lands on the line
    const flipped = flippedItemBounds({ graphicId: 'sky/sheet.png', crop: { x: 0, y: 0, w: 48, h: 32 }, flipX: true }, assets)
    const at = snapImageAnchor(flipped, 70, 64)
    expect((at.x + flipped.x) % 32).toBe(0)
  })

  it('names copies Tree, Tree 2, Tree 3', () => {
    expect(nextImageName('Tree', [])).toBe('Tree')
    expect(nextImageName('Tree', ['Tree'])).toBe('Tree 2')
    expect(nextImageName('Tree 2', ['Tree', 'Tree 2'])).toBe('Tree 3')
    expect(nextImageName('Tree', ['Tree', 'Tree 3'])).toBe('Tree 2')
  })
})
