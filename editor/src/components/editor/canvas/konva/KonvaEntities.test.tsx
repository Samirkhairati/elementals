/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { EntityData } from '@/types/editor'
import { DEFAULT_CANVAS_VIEW, type CanvasViewSettings } from '@/hooks/editor/canvas/canvasView'

// react-konva needs a real canvas; here its nodes are recorded and rendered as plain elements.
interface Recorded {
  kind: string
  props: Record<string, any>
}
const recorded: Recorded[] = []
vi.mock('react-konva', () => {
  const make = (kind: string) =>
    function Node({ children, ...props }: any) {
      recorded.push({ kind, props })
      return <div data-kind={kind} data-name={props.name}>{children}</div>
    }
  return { Group: make('Group'), Rect: make('Rect'), Shape: make('Shape') }
})

const drawn = vi.hoisted(() => ({ footprint: vi.fn(), badge: vi.fn(), label: vi.fn(), frame: vi.fn(), anchor: vi.fn(), ring: vi.fn(), hover: vi.fn(), placeholder: vi.fn() }))
vi.mock('./entityDraw', async (orig) => ({
  ...(await orig<typeof import('./entityDraw')>()),
  drawFootprint: drawn.footprint,
  drawBadge: drawn.badge,
  drawLabel: drawn.label,
  drawSelectionFrame: drawn.frame,
  drawAnchorCross: drawn.anchor,
  drawWanderRing: drawn.ring,
  drawHoverFrame: drawn.hover,
  drawPlaceholder: drawn.placeholder,
}))

import { KonvaEntities } from './KonvaEntities'
import { makeEntity, makeMap } from '@/test/helpers'

const fakeCtx = () => ({ _context: new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }) })
const stage = (scale: number) => ({ scaleX: () => scale, x: () => 0, y: () => 0, width: () => 2000, height: () => 2000 })

function renderEntities(entities: EntityData[], over: Partial<Omit<React.ComponentProps<typeof KonvaEntities>, 'view'>> & { view?: Partial<CanvasViewSettings> } = {}) {
  recorded.length = 0
  const { view, ...rest } = over
  return render(
    <KonvaEntities
      entities={entities}
      selectedEntityId={null}
      setSelectedEntityId={vi.fn()}
      moveEntity={vi.fn()}
      activeMap={makeMap({ width: 20, height: 20 })}
      view={{ ...DEFAULT_CANVAS_VIEW, ...view }}
      {...rest}
    />,
  )
}

const entity = (id: string, x: number, y: number, components: Record<string, any> = {}, extra: Partial<EntityData> = {}) =>
  makeEntity(id, { x, y, components: { Transform: { x, y, depth: 10 }, ...components }, ...extra })

const overlay = () => recorded.filter((r) => r.kind === 'Shape' && r.props.name === 'entity-overlays').at(-1)!
const runOverlay = (scale = 1) => overlay().props.sceneFunc(fakeCtx(), { getStage: () => stage(scale), getParent: () => null })
const nodes = () => recorded.filter((r) => r.kind === 'Group' && r.props.x !== undefined)

beforeEach(() => Object.values(drawn).forEach((f) => f.mockClear()))

describe('KonvaEntities', () => {
  it('draws entities back to front by depth, then by y', () => {
    renderEntities([
      entity('front', 48, 96, { Transform: { x: 48, y: 96, depth: 20 } }),
      entity('back', 80, 64, { Transform: { x: 80, y: 64, depth: 5 } }),
      entity('mid', 16, 32),
    ])
    expect(nodes().map((n) => n.props.x)).toEqual([80, 16, 48])
  })

  it('hides entities hidden in the list or in a hidden folder, and draws nothing when entities are off', () => {
    const { container } = renderEntities(
      [entity('a', 16, 32), entity('b', 48, 32, {}, { visible: false }), entity('c', 80, 32, {}, { folder: 'f1' })],
      { entityFolders: [{ id: 'f1', name: 'F', visible: false }] },
    )
    expect(nodes().map((n) => n.props.x)).toEqual([16])
    renderEntities([entity('a', 16, 32)], { showEntities: false })
    expect(container.querySelectorAll('[data-kind]').length).toBeGreaterThan(0)
    expect(nodes()).toHaveLength(0)
  })

  it('always draws an area for every visible entity (its collider, else its tile), but not for hidden ones', () => {
    const entities = [entity('a', 16, 32, { Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true } }), entity('b', 48, 32, { Collider: { width: 16, height: 8, isSolid: false } }), entity('c', 80, 32)]
    renderEntities(entities)
    runOverlay()
    expect(drawn.footprint).toHaveBeenCalledTimes(3)
    // (ctx, x, y, w, h, rgb, scale, strong): the collider's box, the 16x8 trigger, and the tile of the entity without a collider
    expect(drawn.footprint.mock.calls.map((c) => c.slice(1, 5))).toEqual([
      [0, 0, 32, 32],
      [40, 24, 16, 8],
      [64, 0, 32, 32],
    ])
    expect(drawn.footprint.mock.calls.every((c) => c[5] === '255,255,255' && c[7] === false)).toBe(true)

    drawn.footprint.mockClear()
    renderEntities([{ ...entities[0], visible: false }, entities[1]])
    runOverlay()
    expect(drawn.footprint).toHaveBeenCalledTimes(1)
  })

  it('shows the selected entity prominently: strong footprint, frame, anchor, and always its area', () => {
    const entities = [entity('a', 16, 32, { Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true } }), entity('b', 48, 32, { Collider: { width: 32, height: 32 } })]
    renderEntities(entities, { selectedEntityId: 'a' })
    runOverlay()
    expect(drawn.footprint).toHaveBeenCalledTimes(2)
    expect(drawn.footprint.mock.calls.filter((c) => c[7] === true)).toHaveLength(1) // only the selected one is strong
    expect(drawn.frame).toHaveBeenCalledTimes(1)
    expect(drawn.anchor).toHaveBeenCalledTimes(1)
  })

  it('shows the wander ring only for the selected wandering entity', () => {
    const wanderer = entity('w', 16, 32, { Movement: { controller: 'wander', wanderRadius: 4 } })
    renderEntities([wanderer], { selectedEntityId: 'w' })
    runOverlay()
    expect(drawn.ring).toHaveBeenCalledTimes(1)
    expect(drawn.ring.mock.calls[0].slice(1, 4)).toEqual([16, 32, 4])
    drawn.ring.mockClear()
    renderEntities([wanderer], { selectedEntityId: null })
    runOverlay()
    expect(drawn.ring).not.toHaveBeenCalled()
  })

  it('badges: Event lightning for everyone with an Event, movement arrows for the selected mover, hidden with the toggle', () => {
    const entities = [entity('e', 16, 32, { Event: { pages: [] } }), entity('m', 48, 32, { Movement: { controller: 'player' }, Event: { pages: [] } }), entity('p', 80, 32)]
    renderEntities(entities, { selectedEntityId: 'm', view: { badges: true } })
    runOverlay()
    const icons = drawn.badge.mock.calls.map((c) => c[1])
    expect(icons.filter((i) => i === 'zap')).toHaveLength(2)
    expect(icons.filter((i) => i === 'footprints')).toHaveLength(1)

    drawn.badge.mockClear()
    renderEntities(entities, { selectedEntityId: 'm', view: { badges: false } })
    runOverlay()
    expect(drawn.badge).not.toHaveBeenCalled()
  })

  it('labels: selected always, others only when zoomed in and "Labels" is on', () => {
    const entities = [entity('a', 16, 32), entity('b', 48, 32)]
    renderEntities(entities, { selectedEntityId: 'a' })
    runOverlay(1)
    expect(drawn.label.mock.calls.map((c) => c[1])).toEqual(['a'])

    drawn.label.mockClear()
    runOverlay(2)
    expect(drawn.label.mock.calls.map((c) => c[1])).toEqual(['a', 'b'])
    expect(drawn.label.mock.calls.map((c) => c[5])).toEqual(['selected', 'plain'])

    drawn.label.mockClear()
    renderEntities(entities, { selectedEntityId: 'a', view: { labels: false } })
    runOverlay(2)
    expect(drawn.label.mock.calls.map((c) => c[1])).toEqual(['a'])
  })

  it('hover highlights and labels the hovered entity', () => {
    renderEntities([entity('a', 16, 32), entity('b', 48, 32)])
    const nodeB = nodes().find((n) => n.props.x === 48)!
    nodeB.props.onMouseEnter({ target: { getStage: () => null, getLayer: () => null } })
    runOverlay()
    expect(drawn.hover).toHaveBeenCalledTimes(1)
    expect(drawn.label.mock.calls.map((c) => [c[1], c[5]])).toEqual([['b', 'hover']])
    nodeB.props.onMouseLeave({ target: { getStage: () => null, getLayer: () => null } })
    drawn.hover.mockClear()
    runOverlay()
    expect(drawn.hover).not.toHaveBeenCalled()
  })

  it('without a sprite an entity shows an icon placeholder; hidden sprites are dimmed', () => {
    renderEntities([entity('npc', 16, 32, { Tag: { tag: 'npc' } }), entity('ghost', 48, 32, { Sprite: { asset: 'missing/asset', visible: false } })])
    const spriteShapes = recorded.filter((r) => r.kind === 'Shape' && r.props.name === 'entity-sprite')
    for (const s of spriteShapes) s.props.sceneFunc(fakeCtx(), { getStage: () => null, getParent: () => null })
    expect(drawn.placeholder).toHaveBeenCalledTimes(2)
    expect(drawn.placeholder.mock.calls[0][1]).toBe('user')
    expect(drawn.placeholder.mock.calls.map((c) => c[3])).toEqual([1, 0.5])
  })

  it('entities can be dragged and receive presses', () => {
    renderEntities([entity('a', 16, 32), entity('b', 48, 32)], { selectedEntityId: 'a' })
    expect(nodes().every((n) => n.props.draggable === true && n.props.listening === true)).toBe(true)
  })

  it('moving an entity reports a snapped, clamped position once on drop', () => {
    const moveEntity = vi.fn()
    renderEntities([entity('a', 16, 32)], { moveEntity, snapEntityPos: (x, y) => ({ x: Math.floor(x / 32) * 32 + 16, y: Math.ceil(y / 32) * 32 }) })
    const node = nodes()[0]
    const target = { x: () => 150, y: () => 70, getStage: () => null }
    const setters: number[] = []
    node.props.onDragEnd({ cancelBubble: false, target: { ...target, x: (v?: number) => (v === undefined ? 150 : setters.push(v)), y: (v?: number) => (v === undefined ? 70 : setters.push(v)), getStage: () => null } })
    expect(moveEntity).toHaveBeenCalledTimes(1)
    expect(moveEntity).toHaveBeenCalledWith('a', 144, 96)
  })

  it('double-clicking an entity with an Event opens its event editor; others do nothing', () => {
    const onOpenEvent = vi.fn()
    renderEntities([entity('ev', 16, 32, { Event: { pages: [] } }), entity('plain', 48, 32)], { onOpenEvent })
    const ev = nodes().find((n) => n.props.x === 16)!
    const plain = nodes().find((n) => n.props.x === 48)!
    ev.props.onDblClick({ cancelBubble: false })
    expect(onOpenEvent).toHaveBeenCalledWith('ev')
    plain.props.onDblClick({ cancelBubble: false })
    plain.props.onDblTap({ cancelBubble: false })
    expect(onOpenEvent).toHaveBeenCalledTimes(1)
  })

  it("tints each entity's area with its Tag colour (unknown or empty = white)", () => {
    renderEntities([entity('a', 16, 32, { Tag: { tag: 'x', color: 'mint' } }), entity('b', 48, 32, { Tag: { tag: 'x', color: 'nope' } }), entity('c', 80, 32)], { selectedEntityId: 'a' })
    runOverlay()
    const byX = Object.fromEntries(drawn.footprint.mock.calls.map((c) => [c[1], c[5]]))
    expect(byX[0]).toBe('160,235,196')
    expect(byX[32]).toBe('255,255,255')
    expect(byX[64]).toBe('255,255,255')
  })
})
