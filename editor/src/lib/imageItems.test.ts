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
    // flipping mirrors the frame around the anchor, and an edge still lands on a line
    const flipped = flippedItemBounds({ graphicId: 'sky/sheet.png', crop: { x: 0, y: 0, w: 48, h: 32 }, flipX: true }, assets)
    const at = snapImageAnchor(flipped, 70, 64)
    const left = at.x + flipped.x
    expect(left % 32 === 0 || (left + flipped.w) % 32 === 0).toBe(true)
  })

  describe('corner snapping', () => {
    // 100 wide, 50 tall, anchor bottom-centre: left = x - 50, right = x + 50, top = y - 50, bottom = y
    const wide = { x: -50, y: -50, w: 100, h: 50 }
    const edges = (a: { x: number; y: number }, b = wide) => ({ left: a.x + b.x, right: a.x + b.x + b.w, top: a.y + b.y, bottom: a.y + b.y + b.h })

    it('lands the right edge on a line when that edge is the nearer one', () => {
      // left edge at 69 (5 from 64... far from 96), right edge at 169 (7 from 160): the left is nearer, so it snaps
      const near = snapImageAnchor(wide, 119, 100)
      expect(edges(near).left % 32).toBe(0)
      // right edge 1 px from a line, left edge 13 px from one: the right edge snaps
      const right = snapImageAnchor(wide, 161 - 50 + 50, 100)
      expect(edges(right).right % 32).toBe(0)
    })

    it('snaps the top edge when it is nearer than the bottom edge', () => {
      const a = snapImageAnchor(wide, 96, 117) // top 67 (3 from 64), bottom 117 (11 from 128)
      expect(edges(a).top % 32).toBe(0)
      expect(edges(a).top).toBe(64)
    })

    it('always lands exactly one edge on a line per axis, for any position and odd sizes', () => {
      const odd = { x: -150.5, y: -202, w: 301, h: 202 }
      for (let x = 3000; x < 3040; x += 3) for (let y = 3800; y < 3840; y += 5) {
        const e = edges(snapImageAnchor(odd, x, y), odd)
        expect(e.left % 32 === 0 || e.right % 32 === 0).toBe(true)
        expect(e.top % 32 === 0 || e.bottom % 32 === 0).toBe(true)
      }
    })

    it('honours the grid size and offset', () => {
      const grid = { sizeX: 16, sizeY: 24, offsetX: 4, offsetY: 6 }
      const tile = { x: -8, y: -16, w: 16, h: 16 }
      const e = edges(snapImageAnchor(tile, 50, 70, grid), tile)
      expect((e.left - 4) % 16 === 0 || (e.right - 4) % 16 === 0).toBe(true)
      expect((e.top - 6) % 24 === 0 || (e.bottom - 6) % 24 === 0).toBe(true)
    })

    it('a number is a square grid without offset (the old signature)', () => {
      expect(snapImageAnchor({ x: -16, y: -32, w: 32, h: 32 }, 40, 50, 16)).toEqual({ x: 48, y: 48 })
    })

    it('a tie prefers the left and the bottom edge, like before', () => {
      // left edge 62 is 2 before the line 64, right edge 162 is 2 after the line 160: the left one wins
      expect(snapImageAnchor(wide, 112, 100).x).toBe(114)
    })
  })

  it('snaps with the size the game draws (rounded), so the edge is on the line in the game too', () => {
    const part = { graphicId: 'sky/sheet.png', crop: { x: 0, y: 0, w: 15, h: 15 }, scale: 1.5 }
    expect(flippedItemBounds(part, assets, true)).toMatchObject({ w: 23, h: 23, x: -11.5, y: -23 })
    // the editor still draws the exact size
    expect(flippedItemBounds(part, assets)).toMatchObject({ w: 22.5, h: 22.5 })
    const e = snapImageAnchor(flippedItemBounds(part, assets, true), 100, 100)
    const b = flippedItemBounds(part, assets, true)
    expect((e.x + b.x) % 32 === 0 || (e.x + b.x + b.w) % 32 === 0).toBe(true)
  })

  it('names copies Tree, Tree 2, Tree 3', () => {
    expect(nextImageName('Tree', [])).toBe('Tree')
    expect(nextImageName('Tree', ['Tree'])).toBe('Tree 2')
    expect(nextImageName('Tree 2', ['Tree', 'Tree 2'])).toBe('Tree 3')
    expect(nextImageName('Tree', ['Tree', 'Tree 3'])).toBe('Tree 2')
  })
})
