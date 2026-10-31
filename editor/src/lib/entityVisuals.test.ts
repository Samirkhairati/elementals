/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import { describe, expect, it } from 'vitest'
import {
  FIT_TILE,
  colliderLocalRect,
  colliderWorldRect,
  entityBounds,
  entityIconName,
  fitColliderToSprite,
  fitZoom,
  handlePoint,
  hitTestCollider,
  hitTestEntities,
  moveRect,
  normalizeCollider,
  pxToTile,
  rectFromDrag,
  rectToColliderProps,
  resizeRect,
  snapTo,
  sortByDepth,
  spriteLocalRect,
  summarizeEntity,
  tileToPx,
  tileToPxClamped,
  type Rect,
} from './entityVisuals'

const meta = { frameWidth: 32, frameHeight: 48, pivotX: 0.5, pivotY: 1 }

describe('tiles <-> pixels', () => {
  it('maps a tile to its bottom-centre anchor and back', () => {
    expect(tileToPx(2, 3)).toEqual({ x: 80, y: 128 })
    expect(pxToTile(80, 128)).toEqual({ col: 2, row: 3 })
    expect(pxToTile(16, 32)).toEqual({ col: 0, row: 0 })
  })

  it('clamps edited tiles to the map', () => {
    expect(tileToPxClamped(99, 99, 10, 8)).toEqual(tileToPx(9, 7))
    expect(tileToPxClamped(-4, -1, 10, 8)).toEqual(tileToPx(0, 0))
    expect(tileToPxClamped(2.6, 1.2)).toEqual(tileToPx(3, 1))
  })

  it('snapTo rounds to the step and never returns -0', () => {
    expect(snapTo(5, 4)).toBe(4)
    expect(snapTo(6, 4)).toBe(8)
    expect(Object.is(snapTo(-1, 4), 0)).toBe(true)
    expect(snapTo(7.3, 0)).toBe(7.3)
  })
})

describe('collider geometry', () => {
  it('defaults to one solid tile', () => {
    expect(normalizeCollider(undefined)).toEqual({ width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true })
    expect(normalizeCollider({ width: 0, height: -3 })).toMatchObject({ width: 32, height: 32 })
    expect(normalizeCollider({ isSolid: false })).toMatchObject({ isSolid: false })
  })

  it('is bottom-centred on the anchor and shifted by the offsets', () => {
    expect(colliderLocalRect({ width: 32, height: 32, offsetX: 0, offsetY: 0 })).toEqual({ x: -16, y: -32, w: 32, h: 32 })
    expect(colliderLocalRect({ width: 16, height: 8, offsetX: 4, offsetY: -2 })).toEqual({ x: -4, y: -10, w: 16, h: 8 })
    expect(colliderWorldRect(80, 128, { width: 32, height: 32, offsetX: 0, offsetY: 0 })).toEqual({ x: 64, y: 96, w: 32, h: 32 })
  })

  it('rectToColliderProps is the inverse of colliderLocalRect', () => {
    const c = { width: 20, height: 12, offsetX: 6, offsetY: -4 }
    expect(rectToColliderProps(colliderLocalRect(c))).toEqual(c)
    const world = colliderWorldRect(80, 128, c)
    expect(rectToColliderProps(world, { x: 80, y: 128 })).toEqual(c)
  })

  it('FIT_TILE is the 32x32 default', () => {
    expect(rectToColliderProps({ x: -16, y: -32, w: 32, h: 32 })).toEqual(FIT_TILE)
  })
})

describe('sprite geometry', () => {
  it('puts the pivot on the anchor (bottom-centre by default)', () => {
    expect(spriteLocalRect(meta, {})).toEqual({ x: -16, y: -48, w: 32, h: 48 })
  })

  it('applies offset and scale', () => {
    expect(spriteLocalRect(meta, { offsetX: 2, offsetY: -4, scale: 2 })).toEqual({ x: -30, y: -100, w: 64, h: 96 })
  })

  it('mirrors around the pivot when flipped', () => {
    const asym = { ...meta, pivotX: 0.25 }
    expect(spriteLocalRect(asym, {}).x).toBe(-8)
    expect(spriteLocalRect(asym, { flipX: true }).x).toBe(-24)
  })

  it('fits a collider to the whole sprite frame', () => {
    expect(fitColliderToSprite(meta, {})).toEqual({ width: 32, height: 48, offsetX: 0, offsetY: 0 })
    expect(fitColliderToSprite(meta, { offsetX: 4, offsetY: 2 })).toEqual({ width: 32, height: 48, offsetX: 4, offsetY: 2 })
    expect(fitColliderToSprite({ ...meta, frameWidth: 24, frameHeight: 24 }, {})).toEqual({ width: 24, height: 24, offsetX: 0, offsetY: 0 })
  })
})

describe('drawing a collider', () => {
  it('snaps the drag corners to 4px', () => {
    expect(rectFromDrag({ x: 1, y: 1 }, { x: 22, y: 13 }, { step: 4 })).toEqual({ x: 0, y: 0, w: 24, h: 12 })
  })

  it('works in any drag direction', () => {
    expect(rectFromDrag({ x: 20, y: 20 }, { x: 4, y: 8 }, { step: 4 })).toEqual({ x: 4, y: 8, w: 16, h: 12 })
  })

  it('is free (whole pixels) without a step', () => {
    expect(rectFromDrag({ x: 1.2, y: 1.2 }, { x: 11.7, y: 6.4 }, {})).toEqual({ x: 1, y: 1, w: 11, h: 5 })
  })

  it('draws from the centre with Alt', () => {
    expect(rectFromDrag({ x: 40, y: 40 }, { x: 48, y: 44 }, { step: 4, fromCenter: true })).toEqual({ x: 32, y: 36, w: 16, h: 8 })
  })

  it('never produces a degenerate box', () => {
    const r = rectFromDrag({ x: 10, y: 10 }, { x: 10, y: 10 }, { step: 4 })
    expect(r.w).toBeGreaterThanOrEqual(4)
    expect(r.h).toBeGreaterThanOrEqual(4)
  })
})

describe('resizing a collider with handles', () => {
  const start: Rect = { x: 64, y: 96, w: 32, h: 32 }

  it('moves only the dragged edges and snaps them', () => {
    expect(resizeRect(start, 'e', 9, 5, { step: 4 })).toEqual({ x: 64, y: 96, w: 40, h: 32 })
    expect(resizeRect(start, 'n', 0, -12, { step: 4 })).toEqual({ x: 64, y: 84, w: 32, h: 44 })
    expect(resizeRect(start, 'se', 7, 7, { step: 4 })).toEqual({ x: 64, y: 96, w: 40, h: 40 })
    expect(resizeRect(start, 'nw', -8, -8, { step: 4 })).toEqual({ x: 56, y: 88, w: 40, h: 40 })
  })

  it('is free with Shift (no step)', () => {
    expect(resizeRect(start, 'e', 3, 0, {})).toEqual({ x: 64, y: 96, w: 35, h: 32 })
  })

  it('keeps a minimum size instead of inverting', () => {
    const r = resizeRect(start, 'e', -100, 0, { step: 4 })
    expect(r.x).toBe(64)
    expect(r.w).toBe(4)
  })

  it('resizes symmetrically around the centre with Alt', () => {
    expect(resizeRect(start, 'e', 8, 0, { step: 4, fromCenter: true })).toEqual({ x: 56, y: 96, w: 48, h: 32 })
    expect(resizeRect(start, 's', 0, 8, { step: 4, fromCenter: true })).toEqual({ x: 64, y: 88, w: 32, h: 48 })
  })

  it('moves the body with a snapped top-left corner', () => {
    expect(moveRect(start, 5, -9, { step: 4 })).toEqual({ x: 68, y: 88, w: 32, h: 32 })
    expect(moveRect(start, 1.4, 1.4, {})).toEqual({ x: 65, y: 97, w: 32, h: 32 })
  })

  it('knows where the handles are', () => {
    expect(handlePoint(start, 'nw')).toEqual({ x: 64, y: 96 })
    expect(handlePoint(start, 'e')).toEqual({ x: 96, y: 112 })
    expect(handlePoint(start, 's')).toEqual({ x: 80, y: 128 })
  })

  it('hit-tests handles in screen pixels and the body only when asked', () => {
    expect(hitTestCollider(start, { x: 65, y: 97 }, 1)).toBe('nw')
    expect(hitTestCollider(start, { x: 96, y: 112 }, 1)).toBe('e')
    expect(hitTestCollider(start, { x: 80, y: 112 }, 1)).toBeNull()
    expect(hitTestCollider(start, { x: 80, y: 112 }, 1, { includeBody: true })).toBe('body')
    // zoomed out the same handle is 4x bigger in map space
    expect(hitTestCollider(start, { x: 70, y: 100 }, 0.25)).toBe('nw')
    // tiny box: only corners are offered
    expect(hitTestCollider({ x: 0, y: 0, w: 6, h: 6 }, { x: 3, y: 0 }, 1)).not.toBe('n')
  })
})

describe('entity summaries', () => {
  const entity = (components: Record<string, any>, extra = {}) => ({ x: 80, y: 128, components, ...extra })

  it('summarises components', () => {
    const s = summarizeEntity(entity({ Sprite: { visible: false }, Collider: { isSolid: false }, Movement: { controller: 'wander', wanderRadius: 5 }, Event: { states: [] }, Transform: { depth: 20 } }))
    expect(s).toMatchObject({ hasSprite: true, spriteHidden: true, hasEvent: true, solid: false, controller: 'wander', wanderRadius: 5, depth: 20 })
    expect(summarizeEntity(entity({}))).toMatchObject({ hasSprite: false, hasEvent: false, solid: null, controller: null, depth: 10 })
  })

  it('picks an icon that says what the entity is', () => {
    expect(entityIconName(entity({ Tag: { tag: 'npc' } }))).toBe('user')
    expect(entityIconName(entity({ Tag: { tag: 'sign' } }))).toBe('signpost')
    expect(entityIconName(entity({ Event: { states: [{ graph: { nodes: [{ type: 'warp' }] } }] } }))).toBe('door-open')
    expect(entityIconName(entity({ Collider: { isSolid: false } }))).toBe('square-dashed')
    expect(entityIconName(entity({ Event: { states: [] } }))).toBe('zap')
    expect(entityIconName(entity({}))).toBe('box')
  })

  it('sorts by depth, then y, keeping list order for ties, without mutating the input', () => {
    const list = [
      { id: 'a', x: 0, y: 64, components: { Transform: { depth: 20 } } },
      { id: 'b', x: 0, y: 32, components: { Transform: { depth: 20 } } },
      { id: 'c', x: 0, y: 96, components: { Transform: { depth: 5 } } },
      { id: 'd', x: 0, y: 32, components: { Transform: { depth: 20 } } },
    ]
    expect(sortByDepth(list).map((e) => e.id)).toEqual(['c', 'b', 'd', 'a'])
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('bounds cover the tile and the sprite frame; hit-testing finds the topmost entity', () => {
    const e = { id: 'e', x: 80, y: 128, components: { Sprite: { asset: 'x' } } }
    expect(entityBounds(e, undefined)).toEqual({ x: 64, y: 96, w: 32, h: 32 })
    expect(entityBounds(e, meta as any)).toEqual({ x: 64, y: 80, w: 32, h: 48 })
    const other = { id: 'o', x: 80, y: 128, components: {} }
    expect(hitTestEntities([e, other], { x: 80, y: 110 }, (x) => (x === e ? (meta as any) : undefined))?.id).toBe('o')
    expect(hitTestEntities([e, other], { x: 80, y: 85 }, (x) => (x === e ? (meta as any) : undefined))?.id).toBe('e')
    expect(hitTestEntities([e], { x: 0, y: 0 }, () => undefined)).toBeNull()
  })

  it('picks the largest zoom that fits', () => {
    expect(fitZoom({ x: 0, y: 0, w: 32, h: 48 }, 280, 200, { pad: 8 })).toBe(3)
    expect(fitZoom({ x: 0, y: 0, w: 400, h: 400 }, 280, 200)).toBe(1)
    expect(fitZoom({ x: 0, y: 0, w: 4, h: 4 }, 280, 200)).toBe(6)
  })
})
