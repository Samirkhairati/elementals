import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import type { EditorContextValue } from '@/components/editor/layout/EditorContext'
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

let saveMap: ReturnType<typeof vi.fn>
let initialMap: MapData

beforeEach(() => {
  initialMap = makeMap({ width: 6, height: 6, layers: [makeLayer('L1')], entities: [] })
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
    expect(ctx.layers[0].data).toEqual({ 20: { tilesetId: 'ts', x: 1, y: 1 } })
    expect(ctx.historyLength).toBe(3) // initial, entity, paint
    expect(ctx.historyIndex).toBe(2)

    // First undo reverts the paint only; the entity survives.
    act(() => ctx.handleUndo())
    expect(ctx.layers[0].data).toBeUndefined()
    expect(ctx.entities.map(e => e.name)).toEqual(['Hero'])
    expect(ctx.activeMap?.layers[0].data).toBeUndefined()
    expect(ctx.activeMap?.entities).toHaveLength(1)

    // Nothing is written until the debounce elapses...
    expect(saveMap).not.toHaveBeenCalled()
    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1), { timeout: 1500 })
    const firstPayload = saveMap.mock.calls[0][2] as MapData
    expect(saveMap.mock.calls[0][0]).toBeNull()
    expect(saveMap.mock.calls[0][1]).toBe('test.json')
    expect(firstPayload.entities).toHaveLength(1)
    expect(firstPayload.layers[0].data).toBeUndefined()

    // Second undo removes the entity as well.
    act(() => ctx.handleUndo())
    expect(ctx.entities).toEqual([])
    expect(ctx.selectedEntityId).toBeNull()
    expect(ctx.historyIndex).toBe(0)

    // Redo brings both back in order.
    act(() => ctx.handleRedo())
    expect(ctx.entities.map(e => e.name)).toEqual(['Hero'])
    act(() => ctx.handleRedo())
    expect(ctx.layers[0].data).toEqual({ 20: { tilesetId: 'ts', x: 1, y: 1 } })

    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(2), { timeout: 1500 })
    const last = saveMap.mock.calls[1][2] as MapData
    expect(last.entities).toHaveLength(1)
    expect(last.layers[0].data).toEqual({ 20: { tilesetId: 'ts', x: 1, y: 1 } })
    await sleep(SAVE_DELAY + 100)
    expect(saveMap).toHaveBeenCalledTimes(2)
  })

  it('a burst of edits within the debounce window produces a single save', async () => {
    await mount()
    act(() => {
      ctx.handleCreateEntity('A', 0, 0)
      ctx.handleCreateEntity('B', 32, 0)
      ctx.handleCreateLayerOfType('objects')
    })
    expect(ctx.entities).toHaveLength(2)
    expect(ctx.layers).toHaveLength(2)
    expect(ctx.historyLength).toBe(4) // initial + 3 commits

    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1), { timeout: 1500 })
    await sleep(SAVE_DELAY + 100)
    expect(saveMap).toHaveBeenCalledTimes(1)
    const payload = saveMap.mock.calls[0][2] as MapData
    expect(payload.entities).toHaveLength(2)
    expect(payload.layers).toHaveLength(2)
  })

  it('entity folder changes are saved but are not undo steps', async () => {
    await mount()
    act(() => ctx.createEntityFolder('NPCs'))
    const folder = ctx.entityFolders[0]
    act(() => ctx.toggleEntityFolderExpanded(folder.id))
    expect(ctx.historyLength).toBe(1)
    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1), { timeout: 1500 })
    expect((saveMap.mock.calls[0][2] as MapData).entityFolders?.[0]).toMatchObject({ name: 'NPCs', expanded: false })
  })

  it('undoing an entity deletion restores the entity', async () => {
    await mount()
    act(() => ctx.handleCreateEntity('Hero', 0, 0))
    const id = ctx.entities[0].id
    act(() => ctx.handleDeleteEntity(id))
    expect(ctx.entities).toEqual([])
    act(() => ctx.handleUndo())
    expect(ctx.entities.map(e => e.id)).toEqual([id])
    expect(ctx.activeMap?.entities?.map(e => e.id)).toEqual([id])
  })
})
