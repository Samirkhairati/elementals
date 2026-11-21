/* eslint-disable @typescript-eslint/no-explicit-any -- tests read nodes of a partial tree */
import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { PropertiesPanel } from './PropertiesPanel'
import { renderWithScene } from '@/test/sceneHarness'
import { makeEntity, makeGroup, makeLayer, makeMap, makePicture } from '@/test/helpers'
import { findNode, type SceneNode } from '../../../../../shared/sceneTree'
import { createDefaultEventProps } from '../../../../../shared/engine/components'

/** The panel on a real scene tree, with `select` picking a node as the Scene panel would. */
function setup(nodes: SceneNode[], selected?: string) {
  const r = renderWithScene(<PropertiesPanel />, makeMap({ width: 10, height: 8, nodes }))
  const select = (id: string) => act(() => r.harness().tree.select(id))
  if (selected) select(selected)
  const node = (id: string) => findNode(r.map().nodes, id) as any
  return { ...r, select, node }
}

const commit = (label: string, value: string) => {
  const input = screen.getByLabelText(label)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

const elder = (components: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  makeEntity('e1', { name: 'Elder', x: 80, y: 128, components: { Transform: { x: 80, y: 128, depth: 10 }, ...components }, ...extra })

describe('PropertiesPanel', () => {
  it('says what to do while nothing is selected', () => {
    setup([makeLayer('ground', { name: 'Ground' })])
    expect(screen.getByText(/Select a node in the Scene panel/)).toBeInTheDocument()
  })

  it('shows any node the same way: name, type, its fields; a TileMap has no transform', () => {
    setup([makeLayer('ground', { name: 'Ground', z: 2 })], 'ground')
    expect(screen.getByLabelText('Node name')).toHaveValue('Ground')
    expect(screen.getByText('TileMap')).toBeInTheDocument()
    expect(screen.getByLabelText('Layer z-index')).toHaveValue('2')
    expect(screen.queryByLabelText('Position X')).toBeNull()
  })

  it('renames on Enter / blur and ignores an empty name', () => {
    const { node } = setup([makeGroup('g', [], { name: 'Houses', x: 32, y: 64 })], 'g')
    const name = screen.getByLabelText('Node name')
    fireEvent.change(name, { target: { value: 'Shops' } })
    expect(node('g').name).toBe('Houses')
    fireEvent.blur(name)
    expect(node('g').name).toBe('Shops')
    fireEvent.change(screen.getByLabelText('Node name'), { target: { value: '  ' } })
    fireEvent.blur(screen.getByLabelText('Node name'))
    expect(node('g').name).toBe('Shops')
  })

  it("moving a Node carries what it holds; unlinked, only its anchor (its origin) moves", () => {
    const tree = [makeGroup('g', [makePicture('p', { x: 40, y: 70 }), elder()], { name: 'Town', x: 32, y: 64 })]
    const { node } = setup(tree, 'g')
    expect(screen.getByLabelText('Position X')).toHaveValue('32')
    commit('Position X', '42')
    expect(node('g')).toMatchObject({ x: 42, y: 64 })
    expect(node('p')).toMatchObject({ x: 50, y: 70 })
    expect(node('e1')).toMatchObject({ x: 90, y: 128 })
    expect(node('e1').components.Transform).toMatchObject({ x: 90, y: 128 })

    fireEvent.click(screen.getByRole('button', { name: 'Children follow' }))
    expect(screen.getByText('Origin')).toBeInTheDocument()
    commit('Position Y', '0')
    expect(node('g')).toMatchObject({ x: 42, y: 0 })
    expect(node('p')).toMatchObject({ x: 50, y: 70 }) // stayed
  })

  it('turns a Node and what it holds around its anchor', () => {
    const { node } = setup([makeGroup('g', [makePicture('p', { x: 32, y: 0 })], { x: 0, y: 0 })], 'g')
    commit('Rotation', '90')
    expect(node('g').rotation).toBe(90)
    expect(node('p')).toMatchObject({ x: 0, y: 32, rotation: 90 })
    expect(screen.getByRole('slider', { name: 'Rotation slider' })).toBeInTheDocument()
  })

  it("a sprite has its origin (3×3 picker and fields), flips, z and opacity here", () => {
    const { node } = setup([makeGroup('g', [makePicture('p', { name: 'Oak', x: 40, y: 70 })])], 'p')
    expect(screen.getByRole('radio', { name: 'Origin 0.5, 1' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Origin 0.5, 0.5' }))
    expect(node('p').originY).toBe(0.5)
    expect(node('p').originX).toBeUndefined() // the default is not stored
    fireEvent.click(screen.getByRole('switch', { name: 'Flip horizontally' }))
    expect(node('p').flipX).toBe(true)
    commit('Sprite z-index', '4')
    expect(node('p').z).toBe(4)
    commit('Sprite opacity', '1')
    expect(node('p').opacity).toBeUndefined()
  })

  it('a tag on a plain Node makes it an entity with a Tag; on an entity it edits the Tag, with a colour', () => {
    const { node } = setup([makeGroup('g', [], { name: 'Sign', x: 16, y: 32 })], 'g')
    commit('Tag', 'sign')
    expect(node('g').type).toBe('entity')
    expect(node('g').components.Tag).toMatchObject({ tag: 'sign' })
    fireEvent.click(screen.getByRole('radio', { name: 'Mint' }))
    expect(node('g').components.Tag).toMatchObject({ tag: 'sign', color: 'mint' })
  })

  it('an entity lists its components (not Transform or Tag: those are the fields above) and its depth', () => {
    setup([elder({ Event: createDefaultEventProps(), Movement: { controller: 'wander' }, Tag: { tag: 'npc' } })], 'e1')
    const cards = screen.getAllByTestId(/^component-card-/).map((c) => c.dataset.testid)
    expect(cards).toEqual(['component-card-Movement', 'component-card-Event'])
    const inspector = screen.getByTestId('node-inspector')
    expect(within(inspector).getAllByText('Event').length).toBeGreaterThan(0)
    expect(within(inspector).getAllByText('wander').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Depth')).toHaveValue('10')
    expect(screen.getByLabelText('Tag')).toHaveValue('npc')
  })

  it('a component node shows the entity it belongs to', () => {
    const tree = [elder({ Event: createDefaultEventProps() })]
    const { select, map } = setup(tree)
    const event = (map().nodes[0] as any).children.find((c: SceneNode) => c.type === 'event')
    select(event.id)
    expect(screen.getByLabelText('Node name')).toHaveValue('Elder')
  })

  it('Add component lists what the entity lacks and adds it', async () => {
    const { node } = setup([elder()], 'e1')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add component' }), { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: 'Add Collider' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Add Transform' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Add Tag' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add Event' }))
    expect(node('e1').children.some((c: SceneNode) => c.type === 'event')).toBe(true)
  })

  it("a Node's drawing fields: opacity 1 is the default and is not stored, pick as one", () => {
    const { node } = setup([makeGroup('g', [makePicture('p')], { name: 'Sky' })], 'g')
    fireEvent.click(screen.getByRole('switch', { name: 'Pick sprites as one' }))
    expect(node('g').pickAsOne).toBe(true)
    commit('Node opacity', '0.5')
    expect(node('g').opacity).toBe(0.5)
    commit('Node opacity', '1')
    expect(node('g').opacity).toBeUndefined()
  })
})
