/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithEditor } from '@/test/editorContext'
import { resetLookLibrary } from '@/lib/look/lookLibrary'
import { getLookView, resetLookView } from '@/lib/look/lookView'
import { LookPanel } from './LookPanel'

// Draw order: the Node of sprites draws over the TileMap.
const nodes = [
  { id: 'i1', name: 'Sky', type: 'group', children: [{ id: 'pic', type: 'picture', graphicId: 'sky/a.png', x: 0, y: 0, name: 'Cloud', children: [] }] },
  { id: 't1', name: 'Ground', type: 'tile', children: [] },
]
const mapWith = (n: unknown[]) => ({ name: 'Town', fileName: 'town', width: 10, height: 8, tileWidth: 32, tileHeight: 32, nodes: n })
const map = mapWith(nodes)

function setup(over: Record<string, unknown> = {}) {
  const setLook = vi.fn()
  renderWithEditor(<LookPanel />, { activeMap: map, activeLayerId: 't1', selectedImageId: null, spriteAssets: {}, setLook, ...over } as any)
  return setLook
}

const exposure = () => screen.getByRole('slider', { name: 'Exposure' })

describe('LookPanel', () => {
  beforeEach(() => {
    resetLookLibrary({ loaded: true, file: { version: 1, profiles: [{ id: 'day', name: 'Day' }, { id: 'night', name: 'Night' }] }, shaders: [] })
    resetLookView()
  })

  it('says so when no map is open', () => {
    setup({ activeMap: null })
    expect(screen.getByText('No map open')).toBeInTheDocument()
  })

  it('edits the active tile layer: the exposure slider writes the layer default look', () => {
    const setLook = setup()
    fireEvent.keyDown(exposure(), { key: 'ArrowRight' })
    expect(setLook).toHaveBeenCalledTimes(1)
    const [ref, set, done] = setLook.mock.calls[0]
    expect(ref).toEqual({ kind: 'layer', layerId: 't1' })
    expect(set.default.adjust.exposure).toBeCloseTo(0.01)
    expect(done).toBe(true)
  })

  it('a profile tab edits that profile, copied from the default, not the default', () => {
    // (the TileMap's look is its Look child)
    const withDefault = [nodes[0], { ...nodes[1], children: [{ id: 't1:look', type: 'look', name: 'Look', look: { default: { adjust: { exposure: 1, contrast: 7 } } } }] }]
    const setLook = setup({ activeMap: mapWith(withDefault) })
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }))
    expect(getLookView().profile).toBe('night')
    expect(screen.getByText('= Default')).toBeInTheDocument()
    fireEvent.keyDown(exposure(), { key: 'ArrowRight' })
    const [, set] = setLook.mock.calls[0]
    expect(set.default).toEqual({ adjust: { exposure: 1, contrast: 7 } })
    expect(set.profiles.night.adjust.contrast).toBe(7)
    expect(set.profiles.night.adjust.exposure).toBeCloseTo(1.01)
  })

  it('the Masks tab New mask menu adds a mask', () => {
    const setLook = setup()
    fireEvent.click(screen.getByRole('radio', { name: /Masks/ }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'New mask' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Everything' }))
    const [ref, set, done] = setLook.mock.calls[0]
    expect(ref).toEqual({ kind: 'layer', layerId: 't1' })
    expect(set.default.masks).toHaveLength(1)
    expect(set.default.masks[0].name).toBe('Mask 1')
    expect(set.default.masks[0].components[0].type).toBe('all')
    expect(done).toBe(true)
  })

  it('with nothing selected (the Scene panel\'s map row) it edits the map look', () => {
    const setLook = setup({ activeLayerId: null })
    expect(screen.getByText('Look · Town')).toBeInTheDocument()
    fireEvent.keyDown(exposure(), { key: 'ArrowRight' })
    expect(setLook.mock.calls[0][0]).toEqual({ kind: 'map' })
  })

  it('a node that has no look says which nodes do', () => {
    setup({ activeMap: mapWith([...nodes, { id: 'c', name: 'Walls', type: 'collision', children: [] }]), activeLayerId: 'c' })
    expect(screen.getByText(/A StaticBody has no look/)).toBeInTheDocument()
  })

  it('edits the selected sprite of the active Node', () => {
    const setLook = setup({ activeLayerId: 'i1', selectedImageId: 'pic' })
    expect(screen.getByText('Look · Cloud')).toBeInTheDocument()
    fireEvent.keyDown(exposure(), { key: 'ArrowRight' })
    expect(setLook.mock.calls[0][0]).toEqual({ kind: 'picture', layerId: 'i1', imageId: 'pic' })
  })
})
