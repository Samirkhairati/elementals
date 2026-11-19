import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { makeMap } from '@/test/helpers'
import { renderWithScene } from '@/test/sceneHarness'
import { polygonEditStore } from '@/lib/polygonEditStore'
import type { CollisionLayerNode } from '../../../../../shared/sceneTree'
import { CollisionPanel } from './CollisionPanel'

const M = { tilesetId: '__collision__', x: 0, y: 0 }
const collision = (): CollisionLayerNode => ({
  id: 'c',
  type: 'collision',
  name: 'Walls',
  data: { 0: { ...M, group: 'g' }, 1: { ...M, group: 'g' } },
  children: [
    { id: 'g', type: 'collisionTiles', name: 'Tiles' },
    { id: 's', type: 'collisionShape', name: '', closed: true, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }] },
  ],
})

function setup(layer = collision(), selectedEntityId: string | null = null) {
  const r = renderWithScene(<CollisionPanel />, makeMap({ nodes: [layer] }), { activeLayerId: layer.id, extra: selectedEntityId ? { selectedEntityId } : {} })
  const current = () => r.map().nodes[0] as CollisionLayerNode
  return { current }
}

afterEach(() => act(() => polygonEditStore.set({ selectedShapeId: null, brush: 'tiles' })))

describe('CollisionPanel', () => {
  it('shows the picked item (the items themselves are rows of the Scene panel): its count, and for a shape its kind', () => {
    setup()
    expect(screen.queryByTestId('collision-picked')).toBeNull()
    act(() => polygonEditStore.set({ selectedShapeId: 'g', brush: 'tiles' }))
    expect(screen.getByTestId('collision-picked-count').textContent).toBe('2 tiles')
    expect(screen.getByTestId('collision-status').textContent).toBe('Painting into Tiles')
    act(() => polygonEditStore.set({ selectedShapeId: 's', brush: 'shape' }))
    expect(screen.getByTestId('collision-picked-count').textContent).toBe('3 points')
    expect(screen.getByRole('radio', { name: 'Closed' })).toHaveAttribute('aria-checked', 'true')
  })

  it('+ Tiles adds an empty tiles item and picks it; + Shape switches to drawing', () => {
    const { current } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'New tiles item' }))
    const tiles = current().children.filter((c) => c.type === 'collisionTiles')
    expect(tiles.map((g) => g.name)).toEqual(['Tiles', 'Tiles 2'])
    expect(polygonEditStore.get()).toMatchObject({ selectedShapeId: tiles[1].id, brush: 'tiles' })
    fireEvent.click(screen.getByRole('button', { name: 'New shape' }))
    expect(polygonEditStore.get()).toMatchObject({ selectedShapeId: null, brush: 'shape' })
  })

  it('deleting the picked tiles item removes its tiles', () => {
    const { current } = setup()
    act(() => polygonEditStore.set({ selectedShapeId: 'g', brush: 'tiles' }))
    fireEvent.click(screen.getByRole('button', { name: /Delete tiles item/ }))
    expect(current().children.map((c) => c.type)).toEqual(['collisionShape'])
    expect(current().data).toEqual({})
    expect(polygonEditStore.get().selectedShapeId).toBeNull()
  })

  it('says so while an entity is selected (the map edits the entity then)', () => {
    setup(collision(), 'e1')
    expect(screen.getByTestId('collision-status').textContent).toMatch(/entity is selected/)
  })
})
