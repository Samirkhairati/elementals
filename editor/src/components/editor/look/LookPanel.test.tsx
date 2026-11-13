/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithEditor } from '@/test/editorContext'
import { resetLookLibrary } from '@/lib/look/lookLibrary'
import { getLookView, resetLookView } from '@/lib/look/lookView'
import { LookPanel } from './LookPanel'

const layers = [
  { id: 't1', name: 'Ground', type: 'tile', visible: true, locked: false },
  { id: 'i1', name: 'Sky', type: 'image', visible: true, locked: false, images: [{ id: 'pic', graphicId: 'sky/a.png', x: 0, y: 0, name: 'Cloud' }] },
]
const map = { name: 'Town', fileName: 'town', width: 10, height: 8, tileWidth: 32, tileHeight: 32 }

function setup(over: Record<string, unknown> = {}) {
  const setLook = vi.fn()
  renderWithEditor(<LookPanel />, { activeMap: map, layers, activeLayerId: 't1', selectedImageId: null, spriteAssets: {}, setLook, ...over } as any)
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
    const withDefault = [{ ...layers[0], look: { default: { adjust: { exposure: 1, contrast: 7 } } } }, layers[1]]
    const setLook = setup({ layers: withDefault })
    fireEvent.click(screen.getByRole('tab', { name: /Night/ }))
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

  it('the Map subject edits the map look', () => {
    const setLook = setup()
    fireEvent.click(screen.getByRole('radio', { name: /Map/ }))
    expect(getLookView().pinned).toEqual({ kind: 'map' })
    fireEvent.keyDown(exposure(), { key: 'ArrowRight' })
    expect(setLook.mock.calls[0][0]).toEqual({ kind: 'map' })
  })

  it('edits the selected picture of the active image layer', () => {
    const setLook = setup({ activeLayerId: 'i1', selectedImageId: 'pic' })
    expect(screen.getByText('Cloud')).toBeInTheDocument()
    fireEvent.keyDown(exposure(), { key: 'ArrowRight' })
    expect(setLook.mock.calls[0][0]).toEqual({ kind: 'picture', layerId: 'i1', imageId: 'pic' })
  })
})
