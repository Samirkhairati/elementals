import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { renderWithEditor } from '@/test/editorContext'
import { makeLayer } from '@/test/helpers'
import { polygonEditStore } from '@/lib/polygonEditStore'
import type { Layer } from '@/types/editor'
import { CollisionPanel } from './CollisionPanel'

const M = { tilesetId: '__collision__', x: 0, y: 0 }
const collision = (): Layer =>
  makeLayer('c', {
    type: 'collision',
    name: 'Walls',
    data: { 0: M, 1: M },
    tileGroups: [{ id: 'g', name: 'Tiles' }],
    shapes: [{ id: 's', closed: true, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }] }],
  })

function setup(layer = collision(), selectedEntityId: string | null = null) {
  const updateLayers = vi.fn()
  renderWithEditor(<CollisionPanel />, { layers: [layer], activeLayerId: layer.id, updateLayers, selectedEntityId } as never)
  return { updateLayers }
}

afterEach(() => act(() => polygonEditStore.set({ selectedShapeId: null, brush: 'tiles' })))

describe('CollisionPanel', () => {
  it('lists the tiles items (with their tile count) and the shapes', () => {
    setup()
    const rows = screen.getAllByTestId('collision-item').map((r) => r.textContent)
    expect(rows).toEqual(['Tiles2 tiles', 'Polygon 13 pts'])
  })

  it('picking an item picks its brush: a tiles item paints, a shape is edited', () => {
    setup()
    fireEvent.click(screen.getAllByTestId('collision-item')[1])
    expect(polygonEditStore.get()).toMatchObject({ selectedShapeId: 's', brush: 'shape' })
    fireEvent.click(screen.getAllByTestId('collision-item')[0])
    expect(polygonEditStore.get()).toMatchObject({ selectedShapeId: 'g', brush: 'tiles' })
  })

  it('+ Tiles adds an empty tiles item and picks it; + Shape switches to drawing', () => {
    const { updateLayers } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'New tiles item' }))
    const next = updateLayers.mock.calls[0][0][0] as Layer
    expect(next.tileGroups!.map((g) => g.name)).toEqual(['Tiles', 'Tiles 2'])
    expect(polygonEditStore.get()).toMatchObject({ selectedShapeId: next.tileGroups![1].id, brush: 'tiles' })
    fireEvent.click(screen.getByRole('button', { name: 'New shape' }))
    expect(polygonEditStore.get()).toMatchObject({ selectedShapeId: null, brush: 'shape' })
  })

  it('deleting a tiles item from its menu removes its tiles', () => {
    const { updateLayers } = setup()
    fireEvent.contextMenu(screen.getAllByTestId('collision-item')[0])
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete tiles item/ }))
    const next = updateLayers.mock.calls[0][0][0] as Layer
    expect(next.tileGroups).toEqual([])
    expect(next.data).toEqual({})
    expect(next.shapes).toHaveLength(1)
  })

  it('says so while an entity is selected (the map edits the entity then)', () => {
    setup(collision(), 'e1')
    expect(screen.getByTestId('collision-status').textContent).toMatch(/entity is selected/)
  })
})
