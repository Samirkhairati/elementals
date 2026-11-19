/* eslint-disable @typescript-eslint/no-explicit-any -- tests build loose node trees */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, screen, within } from '@testing-library/react'
import { useEditorClipboard } from '@/store/editorClipboard'
import { polygonEditStore } from '@/lib/polygonEditStore'
import { makeEntity, makeGroup, makeImageLayer, makeLayer, makeMap, makePicture } from '@/test/helpers'
import { renderWithScene } from '@/test/sceneHarness'
import type { SceneNode } from '../../../../../shared/sceneTree'
import { findNode } from '../../../../../shared/sceneTree'
import { SceneTree, dropWhere } from './SceneTree'

// Draw order (the first node draws first, at the back). The panel lists it top first: Trees, Ground, Deco... see `order`.
const town = (): SceneNode[] => [
  makeLayer('deco', { name: 'Deco', z: -1 }),
  makeLayer('ground', { name: 'Ground' }),
  makeGroup('town', [makeEntity('npc', { name: 'Elder', components: { Transform: { x: 0, y: 0 }, Event: { states: [] } } }), makeLayer('roofs', { name: 'Roofs', z: 30 })], { name: 'Town' }),
  makeImageLayer('trees', [makePicture('oak', { name: 'Oak', graphicId: 'trees/oak.png', assetId: undefined }), makePicture('pine', { name: 'Pine', crop: { x: 0, y: 0, w: 8, h: 8 } })], { name: 'Trees', z: 5 }),
]

function setup(nodes: SceneNode[] = town(), options: { activeLayerId?: string; extra?: Record<string, unknown> } = {}) {
  const setConfirmDialog = vi.fn((c: { action: () => void }) => c)
  const r = renderWithScene(<SceneTree />, makeMap({ nodes }), { activeLayerId: options.activeLayerId, extra: { setConfirmDialog, ...options.extra } as any })
  const tree = () => r.map().nodes
  const node = (id: string) => findNode(tree(), id) as any
  const view = () => r.harness().tree.view
  return { ...r, tree, node, view, setConfirmDialog }
}

const row = (id: string) => screen.getByTestId(`scene-row-${id}`)
const order = () => screen.getAllByTestId(/^scene-row-/).map((r) => r.dataset.testid!.replace('scene-row-', ''))
const menu = (id: string) => fireEvent.contextMenu(row(id))
const item = (name: string | RegExp) => screen.getByRole('menuitem', { name })

/** A drag from one row onto the top (`fraction` < 0.5) or bottom half of another; jsdom has no layout, so the rect is made up. */
function drag(fromId: string, toId: string, fraction: number) {
  const data: Record<string, string> = {}
  const dataTransfer = { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k], effectAllowed: '', dropEffect: '' }
  const target = row(toId)
  target.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20, left: 0, right: 10, width: 10, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.dragStart(row(fromId), { dataTransfer })
  const over = createEvent.dragOver(target, { dataTransfer })
  Object.defineProperty(over, 'clientY', { value: fraction * 20 })
  fireEvent(target, over)
  fireEvent.drop(target, { dataTransfer })
  fireEvent.dragEnd(row(fromId), { dataTransfer })
}

afterEach(() => {
  act(() => polygonEditStore.set({ selectedShapeId: null, brush: 'tiles' }))
  useEditorClipboard.setState({ content: null } as never)
})

describe('SceneTree: what it lists', () => {
  it('lists the tree top first (the top row draws on top), a container\'s children under it, indented', () => {
    setup()
    expect(order()).toEqual(['trees', 'pine', 'oak', 'town', 'roofs', 'npc', 'ground', 'deco'])
    expect(row('pine').style.marginLeft).toBe('14px')
    expect(row('trees').style.marginLeft).toBe('0px')
  })

  it('says so with no map, and with an empty map', () => {
    renderWithScene(<SceneTree />, makeMap({ nodes: [] }), { extra: { activeMap: null } as any })
    expect(screen.getByText(/Select a map/)).toBeInTheDocument()
    setup([])
    expect(screen.getByText('Nothing in this map yet.')).toBeInTheDocument()
  })

  it('shows the z of layers, the count of containers and a crop badge on cropped pictures', () => {
    setup()
    expect(within(row('roofs')).getByTestId('layer-z')).toHaveTextContent('z 30')
    expect(within(row('ground')).getByTestId('layer-z')).toHaveTextContent('z 0')
    expect(within(row('trees')).getByTestId('node-count')).toHaveTextContent('2')
    expect(within(row('town')).getByTestId('node-count')).toHaveTextContent('2')
    expect(within(row('town')).queryByTestId('layer-z')).toBeNull()
    expect(within(row('pine')).getByText('crop')).toBeInTheDocument()
    expect(within(row('oak')).queryByText('crop')).toBeNull()
  })

  it('an entity shows its badges; collision items are rows of their layer', () => {
    const shape = { id: 's', type: 'collisionShape', name: 'Fence', closed: false, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }] }
    setup([{ id: 'c', type: 'collision', name: 'Walls', data: {}, children: [{ id: 'g', type: 'collisionTiles', name: 'Houses' }, shape] } as any, ...town()])
    expect(within(row('npc')).getByTitle('Has an Event')).toBeInTheDocument()
    expect(within(row('s')).getByText('2 pts')).toBeInTheDocument()
    expect(within(row('c')).getByTestId('node-count')).toHaveTextContent('2')
    // collision items have no eye or lock of their own
    expect(within(row('g')).queryByRole('button', { name: /Hide|Lock/ })).toBeNull()
  })

  it('a closed container hides its children; its button opens it again, without selecting it', () => {
    const { node, view } = setup()
    fireEvent.click(within(row('town')).getByRole('button', { name: 'Close Town' }))
    expect(node('town').collapsed).toBe(true)
    expect(screen.queryByTestId('scene-row-roofs')).toBeNull()
    expect(view().ids).toEqual([])
    fireEvent.click(within(row('town')).getByRole('button', { name: 'Open Town' }))
    expect(screen.getByTestId('scene-row-roofs')).toBeInTheDocument()
  })
})

describe('SceneTree: selection', () => {
  it('a click selects one node, Ctrl/Cmd+click adds, Shift+click picks the range', () => {
    const { view } = setup()
    fireEvent.click(row('ground'))
    expect(view()).toMatchObject({ primaryId: 'ground', ids: ['ground'], activeLayerId: 'ground' })
    expect(row('ground').dataset.selected).toBe('true')
    fireEvent.click(row('deco'), { ctrlKey: true })
    expect(view().ids).toEqual(['ground', 'deco'])
    expect(row('ground').dataset.multi).toBe('true')
    fireEvent.click(row('deco'), { metaKey: true })
    expect(view().ids).toEqual(['ground'])
    fireEvent.click(row('town'), { shiftKey: true })
    expect([...view().ids].sort()).toEqual(['ground', 'npc', 'roofs', 'town'].sort())
  })

  it('clicking the only selected layer again deselects it; a picture stays picked', () => {
    const { view } = setup()
    fireEvent.click(row('ground'))
    fireEvent.click(row('ground'))
    expect(view().ids).toEqual([])
    fireEvent.click(row('oak'))
    fireEvent.click(row('oak'))
    expect(view()).toMatchObject({ primaryId: 'oak', activeLayerId: 'trees', selectedImageId: 'oak' })
  })

  it('a picture or an entity selects with its own kind: the picture\'s layer becomes the active one', () => {
    const { view } = setup()
    fireEvent.click(row('pine'))
    expect(view()).toMatchObject({ selectedImageId: 'pine', activeLayerId: 'trees', selectedEntityId: null })
    fireEvent.click(row('npc'))
    expect(view()).toMatchObject({ selectedEntityId: 'npc', selectedImageId: null })
  })

  it('a collision item picks its layer and becomes the item the Collision panel works on', () => {
    setup([{ id: 'c', type: 'collision', name: 'Walls', data: {}, children: [{ id: 'g', type: 'collisionTiles', name: 'Houses' }] } as any])
    fireEvent.click(row('g'))
    expect(polygonEditStore.get()).toMatchObject({ selectedShapeId: 'g', brush: 'tiles' })
    expect(row('g').dataset.selected).toBe('true')
  })
})

describe('SceneTree: eye, lock and rename', () => {
  it('the eye hides and shows a node; what is inside a hidden group dims', () => {
    const { node } = setup()
    fireEvent.click(within(row('town')).getByRole('button', { name: 'Hide Town' }))
    expect(node('town').visible).toBe(false)
    expect(row('roofs').dataset.dim).toBe('true')
    expect(node('roofs').visible).toBeUndefined()
    fireEvent.click(within(row('town')).getByRole('button', { name: 'Show Town' }))
    expect(node('town').visible).toBeUndefined()
  })

  it('the lock locks a node; what is inside shows the lock of the group above and cannot be dragged', () => {
    const { node } = setup()
    fireEvent.click(within(row('town')).getByRole('button', { name: 'Lock Town' }))
    expect(node('town').locked).toBe(true)
    expect(within(row('roofs')).getByRole('button', { name: 'Locked by a group above' })).toBeInTheDocument()
    expect(row('roofs').getAttribute('draggable')).toBe('false')
    fireEvent.click(within(row('town')).getByRole('button', { name: 'Unlock Town' }))
    expect(node('town').locked).toBeUndefined()
  })

  it('double-click renames: Enter keeps the new name, Esc keeps the old one', () => {
    const { node } = setup()
    fireEvent.doubleClick(row('ground'))
    const input = within(row('ground')).getByLabelText('Tile Layer name')
    fireEvent.change(input, { target: { value: 'Grass' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(node('ground').name).toBe('Grass')
    fireEvent.doubleClick(row('oak'))
    const again = within(row('oak')).getByLabelText('Picture name')
    fireEvent.change(again, { target: { value: 'Nope' } })
    fireEvent.keyDown(again, { key: 'Escape' })
    expect(node('oak').name).toBe('Oak')
  })

  it('a node that was just created opens its name for typing', async () => {
    vi.useFakeTimers()
    try {
      const { tree } = setup()
      menu('deco')
      fireEvent.click(item(/New Group/))
      act(() => vi.advanceTimersByTime(100))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('Group')
      fireEvent.change(input, { target: { value: 'Scenery' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(tree().some((n) => n.name === 'Scenery' && n.type === 'group')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SceneTree: menus', () => {
  it('New Layer and New Group from a row in a group make the node in that group', () => {
    const { node } = setup()
    menu('roofs')
    fireEvent.click(item(/New Layer/))
    fireEvent.click(item('Tile Layer'))
    expect(node('town').children.map((c: SceneNode) => c.type)).toEqual(['entity', 'tile', 'tile'])
  })

  it('the New Layer submenu greys out a second terrain; collision layers can be many', () => {
    setup([makeLayer('t', { type: 'terrain', name: 'Terrain' }), makeLayer('g', { name: 'Ground' })])
    menu('g')
    fireEvent.click(item(/New Layer/))
    expect(item('Terrain Layer')).toHaveAttribute('data-disabled')
    expect(item('Collision Layer')).not.toHaveAttribute('data-disabled')
  })

  it('the empty space of the panel makes layers and groups at the top of the map', () => {
    const { tree } = setup([makeLayer('g', { name: 'Ground' })])
    fireEvent.contextMenu(screen.getByTestId('scene-tree'))
    fireEvent.click(item(/New Group/))
    expect(tree().map((n) => n.type)).toEqual(['tile', 'group'])
  })

  it('Group puts the selection in one new group in its place; Ungroup puts it back', () => {
    const { tree, node } = setup()
    fireEvent.click(row('ground'))
    fireEvent.click(row('deco'), { ctrlKey: true })
    menu('ground')
    fireEvent.click(item('Group 2 nodes'))
    const group = tree()[0] as any
    expect(group.type).toBe('group')
    expect(group.children.map((c: SceneNode) => c.id)).toEqual(['deco', 'ground'])
    menu(group.id)
    fireEvent.click(item(/^Ungroup/))
    expect(tree().slice(0, 2).map((n) => n.id)).toEqual(['deco', 'ground'])
    expect(node(group.id)).toBeUndefined()
  })

  it('Copy then Paste inside a group puts a copy with new ids in it; Duplicate copies next to the node', () => {
    const { node, tree } = setup()
    menu('ground')
    fireEvent.click(item(/^Copy/))
    menu('town')
    fireEvent.click(item(/Paste inside/))
    const kids = node('town').children as SceneNode[]
    expect(kids).toHaveLength(3)
    expect(kids.filter((k) => k.type === 'tile' && k.id !== 'roofs').every((k) => k.id !== 'ground')).toBe(true)
    menu('deco')
    fireEvent.click(item(/^Duplicate/))
    expect(tree().filter((n) => n.type === 'tile').length).toBe(3)
  })

  it('Delete asks first for a layer or a group (saying what is inside), not for a picture', () => {
    const { node, setConfirmDialog } = setup()
    vi.useFakeTimers()
    try {
      menu('town')
      fireEvent.click(item(/Delete Group/))
      act(() => vi.advanceTimersByTime(10))
    } finally {
      vi.useRealTimers()
    }
    const asked = setConfirmDialog.mock.calls[0][0] as unknown as { title: string; description: string; action: () => void }
    expect(asked.title).toBe('Delete Group')
    expect(asked.description).toMatch(/the 2 nodes inside it/)
    expect(node('town')).toBeDefined()
    act(() => asked.action())
    expect(node('town')).toBeUndefined()

    menu('oak')
    fireEvent.click(item(/^Delete/))
    expect(node('oak')).toBeUndefined()
  })

  it('a picture\'s menu reorders it, places more copies and y-sorts it', () => {
    const placeMultiple = vi.fn()
    const { node } = setup(town(), { extra: { placeMultiple } })
    menu('oak')
    expect(item('Send backward')).toHaveAttribute('data-disabled')
    fireEvent.click(item('Bring forward'))
    expect(node('trees').children.map((c: SceneNode) => c.id)).toEqual(['pine', 'oak'])
    menu('oak')
    fireEvent.click(item(/Place more copies/))
    expect(placeMultiple).toHaveBeenCalledWith('trees', 'oak')
    menu('oak')
    fireEvent.click(item(/Enable Y-sort/))
    expect(node('oak').ySort).toBe(true)
  })

  it('pictures of a y-sorted layer show the badge and can be taken out of it', () => {
    const nodes = town()
    ;(nodes[3] as any).ySort = true
    const { node } = setup(nodes)
    expect(within(row('oak')).getByTestId('ysort-badge')).toBeInTheDocument()
    menu('oak')
    fireEvent.click(item(/Disable Y-sort/))
    expect(node('oak').ySort).toBe(false)
  })

  it('a picture group offers Add picture inside, and its lock means "pick as one"', () => {
    const { node } = setup([makeImageLayer('trees', [makeGroup('wall', [makePicture('a')], { name: 'Dam wall' }) as any], { name: 'Trees' })])
    menu('wall')
    expect(item(/Add picture inside/)).toBeInTheDocument()
    fireEvent.click(item('Lock'))
    expect(node('wall').locked).toBe(true)
    // the members are not locked by it: no "locked by a group above" on them
    expect(within(row('a')).queryByRole('button', { name: 'Locked by a group above' })).toBeNull()
  })

  it('Edit event is offered only on entities with an Event', () => {
    setup([...town(), makeEntity('plain', { name: 'Plain' })])
    menu('npc')
    expect(item(/Edit event/)).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    menu('plain')
    expect(screen.queryByRole('menuitem', { name: /Edit event/ })).toBeNull()
  })
})

describe('SceneTree: drag and drop', () => {
  it('reads the top half of a row as above, the bottom half as below, and the lower half of a container as inside', () => {
    const leaf = makeLayer('l')
    const group = makeGroup('g')
    expect(dropWhere(leaf, 0.2)).toBe('above')
    expect(dropWhere(leaf, 0.8)).toBe('below')
    expect(dropWhere(group, 0.2)).toBe('above')
    expect(dropWhere(group, 0.8)).toBe('inside')
  })

  it('dropping a layer above another moves it there and changes nothing else (no z change)', () => {
    const { tree, node } = setup()
    drag('deco', 'ground', 0.2)
    expect(tree().map((n) => n.id)).toEqual(['ground', 'deco', 'town', 'trees'])
    expect(node('deco').z).toBe(-1)
  })

  it('dropping on the lower half of a group puts the node inside it, on top', () => {
    const { node, tree } = setup()
    drag('ground', 'town', 0.8)
    expect(node('town').children.map((c: SceneNode) => c.id)).toEqual(['npc', 'roofs', 'ground'])
    expect(tree().map((n) => n.id)).toEqual(['deco', 'town', 'trees'])
  })

  it('refuses places the rules do not allow: a picture outside an image layer, a layer into an image layer', () => {
    const { tree } = setup()
    const before = JSON.stringify(tree())
    drag('oak', 'ground', 0.2)
    drag('ground', 'trees', 0.8)
    expect(JSON.stringify(tree())).toBe(before)
  })

  it('an entity moves between groups like any node, so it draws there', () => {
    const { node, tree } = setup()
    drag('npc', 'deco', 0.8)
    expect(node('town').children.map((c: SceneNode) => c.id)).toEqual(['roofs'])
    expect(tree().map((n) => n.id)).toEqual(['npc', 'deco', 'ground', 'town', 'trees'])
  })
})
