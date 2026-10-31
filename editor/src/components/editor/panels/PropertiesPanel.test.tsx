/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { PropertiesPanel } from './PropertiesPanel'
import { renderWithEditor } from '@/test/editorContext'
import { makeEntity } from '@/test/helpers'
import { createDefaultEventProps } from '../../../../../shared/engine/components'

function setup(components: Record<string, any>, x = 80, y = 128) {
  const entity = makeEntity('e1', { name: 'Elder', x, y, components: { Transform: { x, y, depth: 10 }, ...components } })
  const props = {
    layers: [],
    activeLayerId: null,
    updateLayers: vi.fn(),
    entities: [entity],
    selectedEntityId: 'e1',
    renameEntity: vi.fn(),
    moveEntity: vi.fn(),
    addComponent: vi.fn(),
    removeComponent: vi.fn(),
    updateComponentProp: vi.fn(),
    updateComponentProps: vi.fn(),
  }
  renderWithEditor(<PropertiesPanel {...props} />, { activeMap: { width: 10, height: 8 } as any })
  return props
}

describe('PropertiesPanel entity inspector', () => {
  it('shows the position as a tile with a pixel read-out', () => {
    setup({})
    expect(screen.getAllByLabelText('Tile column')[0]).toHaveValue('2')
    expect(screen.getAllByLabelText('Tile row')[0]).toHaveValue('3')
    expect(screen.getByTestId('pixel-readout')).toHaveTextContent('Anchor 80, 128 px')
  })

  it('moving by tile snaps to the tile anchor and clamps to the map', () => {
    const p = setup({})
    const col = screen.getAllByLabelText('Tile column')[0]
    fireEvent.change(col, { target: { value: '5' } })
    fireEvent.keyDown(col, { key: 'Enter' })
    expect(p.moveEntity).toHaveBeenCalledWith('e1', 176, 128)
    const row = screen.getAllByLabelText('Tile row')[0]
    fireEvent.change(row, { target: { value: '99' } })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(p.moveEntity).toHaveBeenLastCalledWith('e1', 80, 256) // row 7 of 8
  })

  it('renames on Enter/blur, not on every keystroke, and ignores an empty name', () => {
    const p = setup({})
    const name = screen.getByLabelText('Entity name')
    fireEvent.change(name, { target: { value: 'Mayor' } })
    expect(p.renameEntity).not.toHaveBeenCalled()
    fireEvent.blur(name)
    expect(p.renameEntity).toHaveBeenCalledWith('e1', 'Mayor')
    fireEvent.change(name, { target: { value: '  ' } })
    fireEvent.blur(name)
    expect(p.renameEntity).toHaveBeenCalledTimes(1)
  })

  it('shows badges for what the entity has', () => {
    setup({ Event: createDefaultEventProps(), Movement: { controller: 'wander' }, Collider: { isSolid: false } })
    const inspector = screen.getByTestId('entity-inspector')
    expect(within(inspector).getAllByText('Event').length).toBeGreaterThan(0)
    expect(within(inspector).getAllByText('wander').length).toBeGreaterThan(0)
    expect(within(inspector).getAllByText('trigger').length).toBeGreaterThan(0)
  })

  it('renders one card per component in schema order with accent headers; Transform cannot be removed', () => {
    setup({ Movement: { controller: 'none' }, Sprite: { asset: '' }, Collider: {} })
    const cards = screen.getAllByTestId(/^component-card-/).map((c) => c.dataset.testid)
    expect(cards).toEqual(['component-card-Transform', 'component-card-Sprite', 'component-card-Collider', 'component-card-Movement'])
    expect(screen.getByTestId('component-card-Sprite').style.getPropertyValue('--card-accent')).toBe('var(--accent-violet)')
    expect(within(screen.getByTestId('component-card-Transform')).queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(within(screen.getByTestId('component-card-Collider')).getByRole('button', { name: 'Remove Collider' })).toBeInTheDocument()
  })

  it('cards collapse and expand', () => {
    setup({ Tag: { tag: 'npc' } })
    const card = screen.getByTestId('component-card-Tag')
    expect(within(card).getByLabelText('Tag')).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Tag component' }))
    expect(within(card).queryByLabelText('Tag')).toBeNull()
  })

  it('Add component lists each missing component with icon and description, and hides present ones', async () => {
    const p = setup({ Sprite: { asset: '' } })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add component' }), { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: 'Add Collider' })).toHaveTextContent(/space the entity occupies/i)
    expect(screen.getByRole('menuitem', { name: 'Add Movement' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Add Sprite' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Add Transform' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add Collider' }))
    expect(p.addComponent).toHaveBeenCalledWith('e1', 'Collider')
  })

  it('Transform card: pixel fields with a tile read-out and depth', () => {
    const p = setup({})
    const card = screen.getByTestId('component-card-Transform')
    fireEvent.change(within(card).getByLabelText('Position X'), { target: { value: '112' } })
    fireEvent.keyDown(within(card).getByLabelText('Position X'), { key: 'Enter' })
    expect(p.updateComponentProp).toHaveBeenCalledWith('e1', 'Transform', 'x', 112)
    fireEvent.change(within(card).getByLabelText('Tile column'), { target: { value: '4' } })
    fireEvent.keyDown(within(card).getByLabelText('Tile column'), { key: 'Enter' })
    expect(p.updateComponentProps).toHaveBeenCalledWith('e1', 'Transform', { x: 144, y: 128 })
    fireEvent.change(within(card).getByLabelText('Depth'), { target: { value: '20' } })
    fireEvent.keyDown(within(card).getByLabelText('Depth'), { key: 'Enter' })
    expect(p.updateComponentProp).toHaveBeenCalledWith('e1', 'Transform', 'depth', 20)
  })

  it('the Event card still opens its editor from the window event while collapsed', async () => {
    setup({ Event: createDefaultEventProps() })
    const card = screen.getByTestId('component-card-Event')
    fireEvent.click(within(card).getByRole('button', { name: 'Event component' }))
    expect(within(card).getByRole('button', { name: 'Event component' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()
    window.dispatchEvent(new CustomEvent('editor:open-event-editor', { detail: 'e1' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('falls back to the layer view and then to the empty hint', () => {
    renderWithEditor(
      <PropertiesPanel layers={[{ id: 'l', name: 'Ground', type: 'tile', visible: true, locked: false }]} activeLayerId="l" updateLayers={vi.fn()} />,
      { activeMap: null as any },
    )
    expect(screen.getByLabelText('Layer name')).toHaveValue('Ground')
  })
})
