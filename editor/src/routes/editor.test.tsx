import { StrictMode } from 'react'
import { SCHEMA_VERSION } from '../../../shared/engine/types'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import type { EditorContextValue } from '@/components/editor/layout/EditorContext'
import { walk, type TileLayerNode } from '../../../shared/sceneTree'
import { sceneIndex } from '@/lib/sceneIndex'
import { installElectronAPI, makeLayer, makeMap, uninstallElectronAPI } from '@/test/helpers'

// Dockview needs real layout; replace the shell with a probe that exposes the real context.
let ctx!: EditorContextValue
vi.mock('@/components/editor/layout/EditorDockview', async () => {
  const { useEditorContext } = await import('@/components/editor/layout/EditorContext')
  return {
    EditorDockview: () => {
      ctx = useEditorContext()
      return null
    },
  }
})
vi.mock('@/components/editor/layout/EditorDialogs', () => ({ EditorDialogs: () => null }))

import { EditorPage } from './editor'

const SAVE_DELAY = 300
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The layers of the open map, in draw order (the first one is at the back); the tree is the map's `nodes`. */
const layers = () => sceneIndex(ctx.activeMap!.nodes).layers
const ground = () => layers()[0] as TileLayerNode

let saveMap: ReturnType<typeof vi.fn>
let initialMap: MapData

beforeEach(() => {
  initialMap = makeMap({ width: 6, height: 6, nodes: [makeLayer('L1')] })
  saveMap = vi.fn(() => Promise.resolve({ success: true }))
  installElectronAPI({
    getTilesets: () => Promise.resolve({ success: true, folders: [], tilesets: [] }),
    getMaps: () => Promise.resolve({ success: true, folders: [], maps: [initialMap] }),
    saveMap,
  })
})

afterEach(() => {
  uninstallElectronAPI()
})

async function mount() {
  const utils = render(
    <StrictMode>
      <EditorPage />
    </StrictMode>
  )
  await waitFor(() => expect(ctx?.activeMap?.fileName).toBe('test.json'))
  return utils
}

describe('EditorPage wiring', () => {
  it('create entity, paint, undo twice: state follows history and one debounced save carries the final map', async () => {
    await mount()

    // Loading a map must not write it back.
    await sleep(SAVE_DELAY + 100)
    expect(saveMap).not.toHaveBeenCalled()

    act(() => ctx.handleCreateEntity('Hero', 32, 64))
    expect(ctx.entities.map(e => e.name)).toEqual(['Hero'])
    expect(ctx.selectedEntityId).toBe(ctx.entities[0].id)

    act(() => ctx.setTileSelection({ width: 1, height: 1, tiles: [{ tilesetId: 'ts', x: 1, y: 1 }] }))
    act(() => {
      ctx.handlePaint(2, 3)
      ctx.handleCommit() // stroke end
    })
    expect(ground().data).toEqual({ 20: { tilesetId: 'ts', x: 1, y: 1 } })
    expect(ctx.historyLength).toBe(3) // initial, entity, paint
    expect(ctx.historyIndex).toBe(2)

    // First undo reverts the paint only; the entity survives.
    act(() => ctx.handleUndo())
    expect(ground().data).toBeUndefined()
    expect(ctx.entities.map(e => e.name)).toEqual(['Hero'])
    expect(ctx.activeMap?.nodes).toHaveLength(2)

    // Nothing is written until the debounce elapses...
    expect(saveMap).not.toHaveBeenCalled()
    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1), { timeout: 1500 })
    const firstPayload = saveMap.mock.calls[0][2] as MapData
    expect(saveMap.mock.calls[0][0]).toBeNull()
    expect(saveMap.mock.calls[0][1]).toBe('test.json')
    // the tree is what is written, no layers / entities next to it
    expect(firstPayload.schemaVersion).toBe(SCHEMA_VERSION)
    expect(firstPayload).not.toHaveProperty('layers')
    expect(firstPayload).not.toHaveProperty('entities')
    expect(firstPayload.nodes.filter(n => n.type === 'entity')).toHaveLength(1)
    expect((firstPayload.nodes[0] as TileLayerNode).data).toBeUndefined()

    // Second undo removes the entity as well.
    act(() => ctx.handleUndo())
    expect(ctx.entities).toEqual([])
    expect(ctx.selectedEntityId).toBeNull()
    expect(ctx.historyIndex).toBe(0)

    // Redo brings both back in order.
    act(() => ctx.handleRedo())
    expect(ctx.entities.map(e => e.name)).toEqual(['Hero'])
    act(() => ctx.handleRedo())
    expect(ground().data).toEqual({ 20: { tilesetId: 'ts', x: 1, y: 1 } })

    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(2), { timeout: 1500 })
    const last = saveMap.mock.calls[1][2] as MapData
    expect(last.nodes.filter(n => n.type === 'entity')).toHaveLength(1)
    expect((last.nodes[0] as TileLayerNode).data).toEqual({ 20: { tilesetId: 'ts', x: 1, y: 1 } })
    await sleep(SAVE_DELAY + 100)
    expect(saveMap).toHaveBeenCalledTimes(2)
  })

  it('a burst of edits within the debounce window produces a single save', async () => {
    await mount()
    act(() => {
      ctx.handleCreateEntity('A', 0, 0)
      ctx.handleCreateEntity('B', 32, 0)
      ctx.createNode('objects')
    })
    expect(ctx.entities).toHaveLength(2)
    expect(layers()).toHaveLength(2)
    expect(ctx.historyLength).toBe(4) // initial + 3 commits

    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1), { timeout: 1500 })
    await sleep(SAVE_DELAY + 100)
    expect(saveMap).toHaveBeenCalledTimes(1)
    const payload = saveMap.mock.calls[0][2] as MapData
    expect(walk(payload.nodes).filter((e) => e.node.type === 'entity')).toHaveLength(2) // B went inside A: A was selected
    expect(walk(payload.nodes).filter((e) => e.node.type === 'objects' || e.node.type === 'tile')).toHaveLength(2)
  })

  it('opening or closing a group is saved but is not an undo step', async () => {
    await mount()
    act(() => ctx.createNode('group', null))
    const group = ctx.activeMap!.nodes.find(n => n.type === 'group')!
    const steps = ctx.historyLength
    act(() => ctx.toggleCollapsed(group.id))
    expect(ctx.historyLength).toBe(steps)
    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1), { timeout: 1500 })
    expect((saveMap.mock.calls[0][2] as MapData).nodes.find(n => n.type === 'group')).toMatchObject({ name: 'Node', collapsed: true })
  })

  it('moving an entity into a group and undoing it', async () => {
    await mount()
    act(() => ctx.handleCreateEntity('Hero', 0, 0))
    act(() => ctx.createNode('group', null))
    const group = ctx.activeMap!.nodes.find(n => n.type === 'group')!
    const hero = ctx.entities[0]
    act(() => ctx.moveNodes([hero.id], group.id, 'inside'))
    expect(sceneIndex(ctx.activeMap!.nodes).byId.get(hero.id)?.ancestors.map(a => a.id)).toEqual([group.id])
    act(() => ctx.handleUndo())
    expect(sceneIndex(ctx.activeMap!.nodes).byId.get(hero.id)?.ancestors).toEqual([])
  })

  it('undoing an entity deletion restores the entity', async () => {
    await mount()
    act(() => ctx.handleCreateEntity('Hero', 0, 0))
    const id = ctx.entities[0].id
    act(() => ctx.handleDeleteEntity(id))
    expect(ctx.entities).toEqual([])
    act(() => ctx.handleUndo())
    expect(ctx.entities.map(e => e.id)).toEqual([id])
    expect(ctx.activeMap?.nodes.map(n => n.id)).toContain(id)
  })

  describe('keyboard shortcuts', () => {
    const press = (key: string, init: KeyboardEventInit = {}) =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
      })

    it('Ctrl+N makes a layer and Ctrl+Shift+N a group, each one undo step, and the list is told to open its name', async () => {
      await mount()
      const before = ctx.activeMap!.nodes.length
      press('n', { ctrlKey: true })
      await waitFor(() => expect(ctx.activeMap!.nodes).toHaveLength(before + 1))
      const top = () => ctx.activeMap!.nodes[ctx.activeMap!.nodes.length - 1]
      expect(top()).toMatchObject({ type: 'tile' })
      expect(ctx.justCreatedLayer?.id).toBe(top().id)
      press('N', { ctrlKey: true, shiftKey: true })
      await waitFor(() => expect(ctx.activeMap!.nodes).toHaveLength(before + 2))
      expect(top()).toMatchObject({ type: 'group', name: 'Node' })
      expect(ctx.justCreatedLayer?.id).toBe(top().id)
      expect(ctx.justCreatedLayer?.n).toBe(2)
    })

    it('does not fire while typing in a field', async () => {
      await mount()
      const before = ctx.activeMap!.nodes.length
      const input = document.createElement('input')
      document.body.appendChild(input)
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      input.remove()
      expect(ctx.activeMap!.nodes).toHaveLength(before)
    })
  })
})
