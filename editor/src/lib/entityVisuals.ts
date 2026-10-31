// Pure geometry for how entities look and are edited on the canvas and in the inspector.
//
// Everything here is DOM/Konva free so it can be unit tested. Conventions (see docs/engine-design.md):
//  * Pixels in map space, tile = 32px. An entity's position is its ANCHOR: bottom-centre of its tile.
//  * "Local" rects are relative to the anchor (+x right, +y down); "world" rects add the anchor position.
//  * A collider box is bottom-centred on the anchor, then shifted by offsetX/offsetY.
//  * A sprite frame is drawn with its pivot on the anchor, shifted by the Sprite offsetX/offsetY.

import type { PropBag } from '@/types/editor'
import type { ColliderProps, SpriteAssetMeta, SpriteProps } from '../../../shared/engine/types'
import { TILE_SIZE, anchorToTile, tileToAnchor } from '../../../shared/engine/constants'
import { previewFrame, type PreviewFrame } from '../../../shared/engine/sprites'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type ColliderPatch = Pick<ColliderProps, 'width' | 'height' | 'offsetX' | 'offsetY'>

/** Collider handles: corners and edge midpoints. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Collider snapping step in px (Shift disables it). */
export const COLLIDER_SNAP = 4
/** Smallest collider edge while snapping / free. */
export const MIN_SNAPPED_SIZE = 4
export const MIN_FREE_SIZE = 1

// ── small maths ─────────────────────────────────────────────────────────────────────────────────

/** Round to the nearest multiple of `step` (never -0). */
export function snapTo(value: number, step: number): number {
  if (!(step > 0)) return value
  const v = Math.round(value / step) * step
  return v === 0 ? 0 : v
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

// ── tiles <-> pixels ────────────────────────────────────────────────────────────────────────────

/** Tile (col,row) an anchor stands on. */
export function pxToTile(x: number, y: number): { col: number; row: number } {
  return anchorToTile(x, y)
}

/** Anchor of a tile in pixels. */
export function tileToPx(col: number, row: number): Point {
  return tileToAnchor(col, row)
}

/** Anchor position for a tile coordinate edited by the user (tiles are integers, clamped to the map). */
export function tileToPxClamped(col: number, row: number, mapCols?: number, mapRows?: number): Point {
  const c = Math.max(0, mapCols !== undefined ? Math.min(mapCols - 1, Math.round(col)) : Math.round(col))
  const r = Math.max(0, mapRows !== undefined ? Math.min(mapRows - 1, Math.round(row)) : Math.round(row))
  return tileToAnchor(c, r)
}

export const TILE_RECT_LOCAL: Rect = { x: -TILE_SIZE / 2, y: -TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }

export const FIT_TILE: ColliderPatch = { width: TILE_SIZE, height: TILE_SIZE, offsetX: 0, offsetY: 0 }

// ── rect helpers ────────────────────────────────────────────────────────────────────────────────

export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// ── collider <-> rect ───────────────────────────────────────────────────────────────────────────

/** Collider props with defaults filled in (a missing/zero size means one tile). */
export function normalizeCollider(raw: Record<string, unknown> | undefined | null): ColliderProps {
  const width = num(raw?.width, TILE_SIZE)
  const height = num(raw?.height, TILE_SIZE)
  return {
    width: width > 0 ? width : TILE_SIZE,
    height: height > 0 ? height : TILE_SIZE,
    offsetX: num(raw?.offsetX, 0),
    offsetY: num(raw?.offsetY, 0),
    isSolid: typeof raw?.isSolid === 'boolean' ? raw.isSolid : true,
  }
}

/** Collider box relative to the anchor. */
export function colliderLocalRect(c: Pick<ColliderProps, 'width' | 'height' | 'offsetX' | 'offsetY'>): Rect {
  return { x: c.offsetX - c.width / 2, y: c.offsetY - c.height, w: c.width, h: c.height }
}

/** Collider box in map space for an entity standing at (ax, ay). */
export function colliderWorldRect(ax: number, ay: number, c: Pick<ColliderProps, 'width' | 'height' | 'offsetX' | 'offsetY'>): Rect {
  return translateRect(colliderLocalRect(c), ax, ay)
}

/**
 * The collider props that produce `rect` (a rect relative to the anchor, or a world rect plus the anchor).
 * Sizes and offsets are whole pixels (the schema rounds them anyway), so an odd width in a free-form
 * rect can be off by half a pixel on the left edge.
 */
export function rectToColliderProps(rect: Rect, anchor: Point = { x: 0, y: 0 }): ColliderPatch {
  const width = Math.max(1, Math.round(rect.w))
  const height = Math.max(1, Math.round(rect.h))
  return {
    width,
    height,
    offsetX: Math.round(rect.x + rect.w / 2 - anchor.x),
    offsetY: Math.round(rect.y + rect.h - anchor.y),
  }
}

export function sameCollider(a: ColliderPatch, b: ColliderPatch): boolean {
  return a.width === b.width && a.height === b.height && a.offsetX === b.offsetX && a.offsetY === b.offsetY
}

export function formatColliderRect(c: ColliderPatch): string {
  return `${c.width}×${c.height}  offset ${c.offsetX},${c.offsetY}`
}

// ── sprite geometry ─────────────────────────────────────────────────────────────────────────────

type SpriteLike = Pick<SpriteProps, 'offsetX' | 'offsetY' | 'scale' | 'flipX'>

/** Where a sprite frame lands relative to the anchor (pivot on the anchor, then the Sprite offset). */
export function spriteLocalRect(
  meta: Pick<SpriteAssetMeta, 'frameWidth' | 'frameHeight' | 'pivotX' | 'pivotY'>,
  sprite: Partial<SpriteLike> = {},
): Rect {
  const scale = sprite.scale && sprite.scale > 0 ? sprite.scale : 1
  const w = meta.frameWidth * scale
  const h = meta.frameHeight * scale
  const ox = num(sprite.offsetX, 0)
  const oy = num(sprite.offsetY, 0)
  // Flipping mirrors the frame around its pivot, so the part left of the pivot ends up on the right.
  const left = sprite.flipX ? ox - (1 - meta.pivotX) * w : ox - meta.pivotX * w
  return { x: left, y: oy - meta.pivotY * h, w, h }
}

/** A collider that wraps the whole sprite frame (integer px). */
export function fitColliderToSprite(
  meta: Pick<SpriteAssetMeta, 'frameWidth' | 'frameHeight' | 'pivotX' | 'pivotY'>,
  sprite: Partial<SpriteLike> = {},
): ColliderPatch {
  return rectToColliderProps(spriteLocalRect(meta, sprite))
}

/** Frame to show for a Sprite at animation time `tick` (ms), via the shared maths the game uses. */
export function resolveSpriteFrame(
  meta: SpriteAssetMeta,
  sprite: Pick<SpriteProps, 'facing' | 'animation' | 'frame'>,
  tick: number,
  imageWidth?: (sheetFile: string) => number | undefined,
): PreviewFrame {
  const first = previewFrame(meta, sprite, tick)
  const w = imageWidth?.(first.sheetFile)
  return w ? previewFrame(meta, sprite, tick, w) : first
}

// ── gesture maths (collider handles, drawing) ───────────────────────────────────────────────────

export interface GestureOptions {
  /** Snap step in px; 0/undefined = free (whole pixels). */
  step?: number
  /** Minimum edge length. */
  min?: number
  /** Resize/draw symmetrically around the centre (Alt). */
  fromCenter?: boolean
}

const snapOrRound = (v: number, step: number | undefined) => (step && step > 0 ? snapTo(v, step) : Math.round(v))

/** Rect between two points: opposite corners, or centre + corner when `fromCenter`. Never smaller than `min`. */
export function rectFromDrag(a: Point, b: Point, opts: GestureOptions = {}): Rect {
  const min = opts.min ?? (opts.step ? MIN_SNAPPED_SIZE : MIN_FREE_SIZE)
  const sx = snapOrRound(b.x, opts.step)
  const sy = snapOrRound(b.y, opts.step)
  if (opts.fromCenter) {
    const cx = snapOrRound(a.x, opts.step)
    const cy = snapOrRound(a.y, opts.step)
    const hw = Math.max(min / 2, Math.abs(sx - cx))
    const hh = Math.max(min / 2, Math.abs(sy - cy))
    return { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 }
  }
  const ax = snapOrRound(a.x, opts.step)
  const ay = snapOrRound(a.y, opts.step)
  let x1 = Math.min(ax, sx)
  let x2 = Math.max(ax, sx)
  let y1 = Math.min(ay, sy)
  let y2 = Math.max(ay, sy)
  if (x2 - x1 < min) {
    if (sx >= ax) x2 = x1 + min
    else x1 = x2 - min
  }
  if (y2 - y1 < min) {
    if (sy >= ay) y2 = y1 + min
    else y1 = y2 - min
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/** Move a rect by (dx, dy); the top-left corner snaps to `step`. */
export function moveRect(start: Rect, dx: number, dy: number, opts: Pick<GestureOptions, 'step'> = {}): Rect {
  return { x: snapOrRound(start.x + dx, opts.step), y: snapOrRound(start.y + dy, opts.step), w: start.w, h: start.h }
}

const HANDLE_EDGES: Record<Handle, { l?: true; r?: true; t?: true; b?: true }> = {
  nw: { l: true, t: true },
  n: { t: true },
  ne: { r: true, t: true },
  e: { r: true },
  se: { r: true, b: true },
  s: { b: true },
  sw: { l: true, b: true },
  w: { l: true },
}

/**
 * Resize `start` by dragging `handle` by (dx, dy) from where it was grabbed. The edges that move snap
 * to `step` (absolute map coordinates), the opposite edges stay put (or mirror with `fromCenter`),
 * and an edge can be dragged across its opposite one - the rect just flips.
 */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, opts: GestureOptions = {}): Rect {
  const min = opts.min ?? (opts.step ? MIN_SNAPPED_SIZE : MIN_FREE_SIZE)
  const e = HANDLE_EDGES[handle]
  let left = start.x
  let right = start.x + start.w
  let top = start.y
  let bottom = start.y + start.h
  const cx = start.x + start.w / 2
  const cy = start.y + start.h / 2

  if (opts.fromCenter) {
    if (e.l || e.r) {
      const half = Math.max(min / 2, Math.abs(snapOrRound((e.r ? right : left) + dx, opts.step) - cx))
      left = cx - half
      right = cx + half
    }
    if (e.t || e.b) {
      const half = Math.max(min / 2, Math.abs(snapOrRound((e.b ? bottom : top) + dy, opts.step) - cy))
      top = cy - half
      bottom = cy + half
    }
    return { x: left, y: top, w: right - left, h: bottom - top }
  }

  if (e.l) left = snapOrRound(left + dx, opts.step)
  if (e.r) right = snapOrRound(right + dx, opts.step)
  if (e.t) top = snapOrRound(top + dy, opts.step)
  if (e.b) bottom = snapOrRound(bottom + dy, opts.step)

  if (right - left < min) {
    if (e.l) left = right - min
    else right = left + min
  }
  if (bottom - top < min) {
    if (e.t) top = bottom - min
    else bottom = top + min
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** Position of a handle on a rect. */
export function handlePoint(rect: Rect, handle: Handle): Point {
  const e = HANDLE_EDGES[handle]
  const x = e.l ? rect.x : e.r ? rect.x + rect.w : rect.x + rect.w / 2
  const y = e.t ? rect.y : e.b ? rect.y + rect.h : rect.y + rect.h / 2
  return { x, y }
}

/** CSS cursor for a handle. */
export function handleCursor(handle: Handle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'nw':
    case 'se':
      return 'nwse-resize'
    default:
      return 'nesw-resize'
  }
}

/**
 * What a pointer at `p` (map space) grabs on a collider rect shown at `scale`: a handle (square
 * `hitSize` screen px around it, corners win over edges), the body, or nothing.
 */
export function hitTestCollider(
  rect: Rect,
  p: Point,
  scale: number,
  opts: { hitSize?: number; includeBody?: boolean } = {},
): Handle | 'body' | null {
  const s = scale > 0 ? scale : 1
  const half = (opts.hitSize ?? 12) / s / 2
  // Small boxes: handles would overlap, so only offer the corners (a mid-edge handle needs 2 hit sizes of room).
  const small = rect.w < half * 4 || rect.h < half * 4
  const order: Handle[] = small ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w']
  for (const h of order) {
    const hp = handlePoint(rect, h)
    if (Math.abs(p.x - hp.x) <= half && Math.abs(p.y - hp.y) <= half) return h
  }
  if (opts.includeBody && pointInRect(p, rect)) return 'body'
  return null
}

// ── entity summaries (canvas badges, list rows, inspector) ──────────────────────────────────────

export interface EntityLike {
  id?: string
  name?: string
  x: number
  y: number
  visible?: boolean
  components: Partial<Record<string, PropBag>>
}

export interface EntitySummary {
  hasSprite: boolean
  hasEvent: boolean
  hasCollider: boolean
  /** true = solid collider, false = trigger zone, null = no collider */
  solid: boolean | null
  controller: 'none' | 'player' | 'wander' | null
  wanderRadius: number
  /** Sprite component says it is not drawn in the game. */
  spriteHidden: boolean
  depth: number
}

export function summarizeEntity(entity: EntityLike): EntitySummary {
  const c = entity.components
  const collider = c.Collider ? normalizeCollider(c.Collider) : null
  const controller = c.Movement ? (c.Movement.controller as 'none' | 'player' | 'wander') ?? 'none' : null
  return {
    hasSprite: !!c.Sprite,
    hasEvent: !!c.Event,
    hasCollider: !!collider,
    solid: collider ? collider.isSolid : null,
    controller,
    wanderRadius: num(c.Movement?.wanderRadius, 3),
    spriteHidden: c.Sprite?.visible === false,
    depth: num(c.Transform?.depth, 10),
  }
}

/** Icon name (see lib/iconPaths + lucide) that best describes an entity when it has no sprite. */
export function entityIconName(entity: EntityLike): string {
  const c = entity.components
  const tag = typeof c.Tag?.tag === 'string' ? c.Tag.tag : ''
  const pages = (c.Event?.pages as { commands?: { type?: string }[] }[] | undefined) ?? []
  const hasWarp = pages.some((p) => p?.commands?.some((cmd) => cmd?.type === 'warp'))
  if (tag === 'warp' || hasWarp) return 'door-open'
  if (tag === 'trainer') return 'swords'
  if (tag === 'npc' || c.Movement?.controller === 'wander' || c.Movement?.controller === 'player') return 'user'
  if (tag === 'sign') return 'signpost'
  if (tag === 'chest') return 'package'
  if (tag === 'item') return 'circle-dot'
  if (tag === 'trigger' || (c.Collider && c.Collider.isSolid === false)) return 'square-dashed'
  if (c.Event) return 'zap'
  return 'box'
}

/**
 * Draw order: Transform.depth, then lower on the map (larger y) draws on top, then list order.
 * Returns a new array; the input is not modified.
 */
export function sortByDepth<T extends EntityLike>(entities: readonly T[]): T[] {
  return entities
    .map((e, i) => ({ e, i, d: num(e.components.Transform?.depth, 10) }))
    .sort((a, b) => a.d - b.d || a.e.y - b.e.y || a.i - b.i)
    .map((o) => o.e)
}

/**
 * Bounds used for hover/selection frames: the sprite frame (when there is one) united with the tile
 * the entity stands on, in map space.
 */
export function entityBounds(entity: EntityLike, meta: SpriteAssetMeta | undefined): Rect {
  const tile = translateRect(TILE_RECT_LOCAL, entity.x, entity.y)
  const sprite = entity.components.Sprite
  if (!sprite || !meta) return tile
  const local = spriteLocalRect(meta, sprite as Partial<SpriteLike>)
  return unionRect(tile, translateRect(local, entity.x, entity.y))
}

/** Topmost entity whose bounds contain `p` (later in `sorted` = on top). */
export function hitTestEntities<T extends EntityLike>(sorted: readonly T[], p: Point, metaOf: (e: T) => SpriteAssetMeta | undefined): T | null {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (pointInRect(p, entityBounds(sorted[i], metaOf(sorted[i])))) return sorted[i]
  }
  return null
}

// ── zoom ────────────────────────────────────────────────────────────────────────────────────────

/** Largest integer zoom (1..max) at which `bounds` fits a viewport of the given size. */
export function fitZoom(bounds: Rect, viewW: number, viewH: number, opts: { pad?: number; max?: number } = {}): number {
  const pad = opts.pad ?? 16
  const max = opts.max ?? 6
  const zx = (viewW - pad * 2) / Math.max(1, bounds.w)
  const zy = (viewH - pad * 2) / Math.max(1, bounds.h)
  return Math.max(1, Math.min(max, Math.floor(Math.min(zx, zy))))
}
