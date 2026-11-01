import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TileSelection, TilesetData } from '@/types/editor'
import { ActiveSelectionPanel } from './ActiveSelectionPanel'

const tilesets: TilesetData[] = [{ name: 'ts', fileName: 'ts.png', folderPath: null, dataUrl: 'data:image/png;base64,AAAA' }]
const t = (x: number) => ({ tilesetId: 'ts.png', x, y: 0 })
const COL = { tilesetId: '__collision__', x: 0, y: 0 }

const multi: TileSelection = {
  width: 2,
  height: 1,
  tiles: [t(0), t(1)],
  layers: [
    { layerId: 'col', layerType: 'collision', name: 'Collision', tiles: [COL, null] },
    { layerId: 'ground', layerType: 'tile', name: 'Ground', tiles: [t(0), t(1)] },
  ],
}

describe('ActiveSelectionPanel', () => {
  it('has a pin button with a tooltip even when nothing is selected', () => {
    const onTogglePin = vi.fn()
    render(<ActiveSelectionPanel tileSelection={null} tilesets={tilesets} onTogglePin={onTogglePin} />)
    const pin = screen.getByRole('button', { name: 'Pin selection' })
    expect(pin.getAttribute('title')).toMatch(/Pin the selection/)
    expect(pin.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(pin)
    expect(onTogglePin).toHaveBeenCalledTimes(1)
    expect(screen.getByText('No tiles selected')).toBeTruthy()
  })

  it('shows the pinned state and an unpin tooltip', () => {
    render(<ActiveSelectionPanel tileSelection={null} tilesets={tilesets} pinned onTogglePin={vi.fn()} />)
    const pin = screen.getByRole('button', { name: 'Unpin selection' })
    expect(pin.getAttribute('aria-pressed')).toBe('true')
    expect(pin.getAttribute('title')).toMatch(/Unpin/)
  })

  it('lists the layers a multi-layer selection came from', () => {
    render(<ActiveSelectionPanel tileSelection={multi} tilesets={tilesets} pinned onTogglePin={vi.fn()} />)
    expect(screen.getAllByTestId('selection-part').map((p) => p.textContent)).toEqual(['Collision', 'Ground'])
  })

  it('overlaps every layer in one preview', () => {
    render(<ActiveSelectionPanel tileSelection={multi} tilesets={tilesets} pinned onTogglePin={vi.fn()} />)
    const preview = screen.getByTestId('selection-preview')
    // two ground tiles + one collision marker, all in the same box
    const cells = Array.from(preview.children).filter((c) => (c as HTMLElement).className.includes('absolute') && !(c as HTMLElement).className.includes('inset-0'))
    expect(cells).toHaveLength(3)
    const collision = cells.filter((c) => (c as HTMLElement).className.includes('bg-red-500/20'))
    expect(collision).toHaveLength(1)
    // the bottom layer (Ground) is drawn first, the collision marker on top of it
    expect(cells[cells.length - 1]).toBe(collision[0])
  })

  it('a single-layer selection shows no layer chips', () => {
    const single: TileSelection = { width: 1, height: 1, tiles: [t(2)] }
    render(<ActiveSelectionPanel tileSelection={single} tilesets={tilesets} onTogglePin={vi.fn()} />)
    expect(screen.queryAllByTestId('selection-part')).toHaveLength(0)
    expect(screen.getByTestId('selection-preview').children.length).toBeGreaterThan(0)
  })
})
