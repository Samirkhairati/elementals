import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import { EventEnvProvider } from './eventEnv'
import { WarpTilePicker, previewCellSize, tileAt } from './WarpTilePicker'
import { makeEnv } from './eventTestUtils'

const town: MapData = { name: 'Town', fileName: 'town.json', folderPath: null, width: 10, height: 8, layers: [], entities: [] }

describe('previewCellSize', () => {
  it('fits the longest side into the preview and keeps cells legible', () => {
    expect(previewCellSize({ width: 10, height: 8 })).toBe(20)
    expect(previewCellSize({ width: 30, height: 20 })).toBe(10)
    expect(previewCellSize({ width: 200, height: 100 })).toBe(4)
  })
})

describe('tileAt', () => {
  const rect = { left: 100, top: 50, width: 200, height: 160 } // a 10x8 map at 20px per tile

  it('maps a pointer position to a tile, and outside to null', () => {
    expect(tileAt(town, 100, 50, rect)).toEqual({ col: 0, row: 0 })
    expect(tileAt(town, 139, 89, rect)).toEqual({ col: 1, row: 1 })
    expect(tileAt(town, 299, 209, rect)).toEqual({ col: 9, row: 7 })
    expect(tileAt(town, 300, 100, rect)).toBeNull()
    expect(tileAt(town, 99, 100, rect)).toBeNull()
    expect(tileAt(town, 150, 300, rect)).toBeNull()
  })

  it('scales with the on-screen size, not the canvas size', () => {
    expect(tileAt(town, 150, 100, { left: 100, top: 50, width: 100, height: 80 })).toEqual({ col: 5, row: 5 })
  })
})

describe('WarpTilePicker', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) // jsdom has no canvas
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 160, right: 200, bottom: 160, x: 0, y: 0, toJSON: () => ({}) })
  })
  afterEach(() => vi.restoreAllMocks())

  const setup = (props: { mapId?: string; x?: number; y?: number; onPick?: (c: number, r: number) => void } = {}) =>
    render(
      <EventEnvProvider value={makeEnv({ mapPreview: { getMap: (id) => (id === 'town' ? town : undefined), tilesets: [] } })}>
        <WarpTilePicker mapId={props.mapId ?? 'town'} x={props.x ?? 0} y={props.y ?? 0} onPick={props.onPick ?? (() => {})} />
      </EventEnvProvider>,
    )

  it('highlights the hovered tile and sets the warp tile on click', () => {
    const onPick = vi.fn()
    setup({ onPick })
    const surface = screen.getByTestId('warp-tile-picker').querySelector('.cursor-crosshair') as HTMLElement
    fireEvent.mouseMove(surface, { clientX: 45, clientY: 65 })
    expect(screen.getByTestId('warp-hover-tile')).toHaveStyle({ left: '40px', top: '60px', width: '20px', height: '20px' })
    expect(screen.getByText('Click to warp to tile (2, 3)')).toBeInTheDocument()
    fireEvent.click(surface, { clientX: 45, clientY: 65 })
    expect(onPick).toHaveBeenCalledWith(2, 3)
    fireEvent.mouseLeave(surface)
    expect(screen.queryByTestId('warp-hover-tile')).toBeNull()
  })

  it('marks the current warp tile and flags one outside the map', () => {
    const { unmount } = setup({ x: 4, y: 5 })
    expect(screen.getByTestId('warp-selected-tile')).toHaveStyle({ left: '80px', top: '100px' })
    unmount()
    setup({ x: 25, y: 25 })
    expect(screen.queryByTestId('warp-selected-tile')).toBeNull()
    expect(screen.getByText(/outside this 10×8 map/)).toBeInTheDocument()
  })

  it('asks for a map first, and says when the map is missing', () => {
    const { unmount } = setup({ mapId: '' })
    expect(screen.getByText('Choose a map to pick a tile on it.')).toBeInTheDocument()
    unmount()
    setup({ mapId: 'gone' })
    expect(screen.getByText(/was not found/)).toBeInTheDocument()
  })
})
