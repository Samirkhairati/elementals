/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { EntitiesPanel } from './EntitiesPanel'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { renderWithEditor, assetMap, characterMeta, makeAsset } from '@/test/editorContext'
import { makeEntity } from '@/test/helpers'

const hero = makeAsset('characters/hero', characterMeta())

function setup(entities = [makeEntity('a', { name: 'Guard' })], over: Record<string, any> = {}) {
  const props = {
    hasActiveMap: true,
    entities,
    selectedEntityId: null,
    setSelectedEntityId: vi.fn(),
    createEntity: vi.fn(),
    duplicateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    renameEntity: vi.fn(),
    reorderEntities: vi.fn(),
    setConfirmDialog: vi.fn(),
    startPlacement: vi.fn(),
    toggleEntityVisibility: vi.fn(),
    createEntityFolder: vi.fn(),
    ...over,
  }
  renderWithEditor(<EntitiesPanel {...(props as any)} />, { spriteAssets: assetMap(hero), spriteList: [hero] })
  return props
}

describe('EntitiesPanel add menu', () => {
  it('lists Empty entity and every prefab with its description', async () => {
    setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add entity' }), { button: 0, ctrlKey: false })
    const menu = await screen.findByTestId('add-entity-menu')
    expect(within(menu).getByRole('menuitem', { name: 'Empty entity' })).toBeInTheDocument()
    for (const p of PRESET_PREFABS) {
      const item = within(menu).getByRole('menuitem', { name: p.name })
      expect(item).toHaveTextContent(p.description)
    }
  })

  it('choosing a prefab starts placement with its components', async () => {
    const props = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add entity' }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'NPC' }))
    expect(props.startPlacement).toHaveBeenCalledTimes(1)
    const arg = props.startPlacement.mock.calls[0][0]
    expect(arg.name).toBe('NPC')
    expect(arg.components.Sprite.asset).toBe('characters/player')
    expect(arg.components.Collider).toMatchObject({ width: 32, height: 32, isSolid: true })
    expect(props.createEntity).not.toHaveBeenCalled()
  })

  it('choosing Empty entity starts placement without components', async () => {
    const props = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add entity' }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Empty entity' }))
    expect(props.startPlacement).toHaveBeenCalledWith({ name: 'New Entity' })
  })
})

describe('EntitiesPanel Edit event', () => {
  it('offers "Edit event" only for entities with an Event: selects the entity, then asks the inspector card to open it', () => {
    vi.useFakeTimers()
    const opened: string[] = []
    const listener = (e: Event) => opened.push((e as CustomEvent<string>).detail)
    window.addEventListener('editor:open-event-editor', listener)
    const props = setup([makeEntity('ev', { name: 'Guard', components: { Event: { states: [] } } }), makeEntity('plain', { name: 'Rock' })])
    fireEvent.contextMenu(screen.getByTestId('entity-row-plain'))
    expect(screen.queryByRole('menuitem', { name: /Edit event/ })).toBeNull()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.contextMenu(screen.getByTestId('entity-row-ev'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Edit event/ }))
    expect(props.setSelectedEntityId).toHaveBeenCalledWith('ev')
    expect(opened).toEqual([])
    vi.advanceTimersByTime(100)
    expect(opened).toEqual(['ev'])
    window.removeEventListener('editor:open-event-editor', listener)
    vi.useRealTimers()
  })
})

describe('EntitiesPanel rows', () => {
  const rows = () => [
    makeEntity('npc', { name: 'Elder', components: { Sprite: { asset: 'characters/hero' }, Event: { states: [] }, Movement: { controller: 'wander' }, Collider: { isSolid: true } } }),
    makeEntity('zone', { name: 'Warp zone', components: { Collider: { isSolid: false }, Event: { states: [] } } }),
    makeEntity('plain', { name: 'Marker', components: {} }),
  ]

  it('shows name and badges: Event, Movement, solid / zone', () => {
    setup(rows())
    const elder = screen.getByTestId('entity-row-npc')
    expect(within(elder).getByText('Elder')).toBeInTheDocument()
    expect(within(elder).getByTitle('Has an Event')).toBeInTheDocument()
    expect(within(elder).getByTitle('Movement: wander')).toBeInTheDocument()
    expect(within(elder).getByTitle('Solid collider')).toBeInTheDocument()
    const zone = screen.getByTestId('entity-row-zone')
    expect(within(zone).getByTitle('Trigger zone (not solid)')).toBeInTheDocument()
    expect(within(zone).queryByTitle('Solid collider')).toBeNull()
    const plain = screen.getByTestId('entity-row-plain')
    expect(within(plain).queryByTitle('Has an Event')).toBeNull()
  })

  it('selects, marks the selection and keeps visibility toggling', () => {
    const props = setup(rows(), { selectedEntityId: 'zone' })
    fireEvent.click(screen.getByTestId('entity-row-npc'))
    expect(props.setSelectedEntityId).toHaveBeenCalledWith('npc')
    expect(screen.getByTestId('entity-row-zone')).toHaveAttribute('data-selected', 'true')
    fireEvent.click(within(screen.getByTestId('entity-row-npc')).getByRole('button', { name: 'Hide entity' }))
    expect(props.toggleEntityVisibility).toHaveBeenCalledWith('npc')
    expect(props.setSelectedEntityId).toHaveBeenCalledTimes(1) // the eye does not select
  })

  it('dims hidden entities and keeps folders working', () => {
    setup([makeEntity('h', { name: 'Hidden', visible: false }), makeEntity('in', { name: 'Inside', folder: 'f1' })], {
      entityFolders: [{ id: 'f1', name: 'Props', expanded: true, visible: true }],
    })
    expect(screen.getByTestId('entity-row-h')).toHaveAttribute('data-dim', 'true')
    expect(screen.getByText('Props')).toBeInTheDocument()
    expect(screen.getByTestId('entity-row-in')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    setup([])
    expect(screen.getByText('No entities yet.')).toBeInTheDocument()
  })
})
