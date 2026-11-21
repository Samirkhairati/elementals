import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import { EventEnvProvider } from './eventEnv'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { WarpTilePicker, pixelAt, previewCellSize, tileAt } from './WarpTilePicker'
import * as scenery from '@/lib/mapScenery'
import { makeEnv } from './eventTestUtils'

const town: MapData = { name: 'Town', fileName: 'town.json', folderPath: null, width: 10, height: 8, nodes: [] }

describe('previewCellSize', () => {
  it('fits the longest side into the preview and keeps cells legible', () => {
    expect(previewCellSize({ width: 10, height: 8 })).toBe(30)
    expect(previewCellSize({ width: 30, height: 20 })).toBe(10)
    expect(previewCellSize({ width: 200, height: 100 })).toBe(4)
  })

  it('shows tiles at whole multiples of 32 device pixels where they are not shrunk, so they stay sharp', () => {
    expect(previewCellSize({ width: 10, height: 8 }, 2)).toBe(32)
    expect(previewCellSize({ width: 20, height: 12 }, 2)).toBe(15)
    expect(previewCellSize({ width: 9, height: 9 }, 1)).toBe(32)
    expect(previewCellSize({ width: 30, height: 20 }, 2)).toBe(10)
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

describe('pixelAt', () => {
  const rect = { left: 100, top: 50, width: 200, height: 160 } // a 10x8 map (320x256 px) shown at 200x160

  it('maps a pointer position to whole map pixels, edges included, and outside to null', () => {
    expect(pixelAt(town, 100, 50, rect)).toEqual({ x: 0, y: 0 })
    expect(pixelAt(town, 200, 130, rect)).toEqual({ x: 160, y: 128 })
    expect(pixelAt(town, 300, 210, rect)).toEqual({ x: 320, y: 256 })
    expect(pixelAt(town, 99, 100, rect)).toBeNull()
    expect(pixelAt(town, 150, 211, rect)).toBeNull()
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
    expect(screen.getByTestId('warp-hover-tile')).toHaveStyle({ left: '60px', top: '90px', width: '30px', height: '30px' })
    expect(screen.getByText('Click to warp to tile (2, 3)')).toBeInTheDocument()
    fireEvent.click(surface, { clientX: 45, clientY: 65 })
    expect(onPick).toHaveBeenCalledWith(2, 3)
    fireEvent.mouseLeave(surface)
    expect(screen.queryByTestId('warp-hover-tile')).toBeNull()
  })

  it('with Snap to tiles off it hovers and picks exact pixels, and marks the pixel the warp goes to', () => {
    const onPick = vi.fn()
    render(
      <EventEnvProvider value={makeEnv({ mapPreview: { getMap: () => town, tilesets: [] } })}>
        <WarpTilePicker mapId="town" x={40} y={96} free onPick={onPick} />
      </EventEnvProvider>,
    )
    const surface = screen.getByTestId('warp-tile-picker').querySelector('.cursor-crosshair') as HTMLElement
    expect(screen.getByTestId('warp-selected-point')).toHaveStyle({ left: '32.5px' }) // 40 px * 30/32 = 37.5, minus half the 10 px ring
    expect(screen.queryByTestId('warp-selected-tile')).toBeNull()
    expect(screen.getByText('Warps to (40, 96) px')).toBeInTheDocument()
    fireEvent.mouseMove(surface, { clientX: 100, clientY: 80 })
    expect(screen.getByText('Click to warp to (160, 128) px')).toBeInTheDocument()
    fireEvent.click(surface, { clientX: 100, clientY: 80 })
    expect(onPick).toHaveBeenCalledWith(160, 128)
  })

  it('flags a pixel position outside the map', () => {
    render(
      <EventEnvProvider value={makeEnv({ mapPreview: { getMap: () => town, tilesets: [] } })}>
        <WarpTilePicker mapId="town" x={400} y={10} free onPick={() => {}} />
      </EventEnvProvider>,
    )
    expect(screen.queryByTestId('warp-selected-point')).toBeNull()
    expect(screen.getByText(/outside this 320×256 px map/)).toBeInTheDocument()
  })

  it('marks the current warp tile and flags one outside the map', () => {
    const { unmount } = setup({ x: 4, y: 5 })
    expect(screen.getByTestId('warp-selected-tile')).toHaveStyle({ left: '120px', top: '150px' })
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

describe('WarpTilePicker drawing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function draw(dpr: number, map: MapData) {
    vi.stubGlobal('devicePixelRatio', dpr)
    const calls: string[] = []
    const ctx = new Proxy(
      { imageSmoothingEnabled: true, imageSmoothingQuality: 'low', lineWidth: 0 } as Record<string, unknown>,
      { get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => void calls.push(`${k}(${args.join(',')})`)), set: (t, k: string, v) => ((t[k] = v), true) },
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    render(
      <EventEnvProvider value={makeEnv({ mapPreview: { getMap: () => map, tilesets: [] } })}>
        <WarpTilePicker mapId="town" x={0} y={0} onPick={() => {}} />
      </EventEnvProvider>,
    )
    return { canvas: screen.getByRole('img') as HTMLCanvasElement, calls, ctx }
  }

  it('draws at the screen density with tiles at whole multiples of their pixels, sharp, and hairlines one device pixel wide', () => {
    const { canvas, calls, ctx } = draw(2, town) // 10x8 map -> 32 CSS px cells = 64 device px, twice the tile -> 320x256 CSS px
    expect(canvas.style.width).toBe('320px')
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(512)
    expect(calls).toContain('setTransform(2,0,0,2,0,0)')
    expect(ctx.lineWidth).toBe(0.5)
    expect(ctx.imageSmoothingEnabled).toBe(false)
  })

  it('shrinks the map in one filtered step instead of dropping pixels', () => {
    const { ctx, calls } = draw(1, town) // a 32 px tile is shown at 30 px
    expect(ctx.imageSmoothingEnabled).toBe(true)
    expect(ctx.imageSmoothingQuality).toBe('high')
    // the full-size 320x256 picture of the map, copied once into the 300x240 preview
    expect(calls).toContain('drawImage([object HTMLCanvasElement],0,0,320,256,0,0,300,240)')
  })
})


describe('WarpTilePicker pictures', () => {
  afterEach(() => vi.restoreAllMocks())

  it('draws the destination map through the shared scenery with the pictures available, so a map made of pictures is not blank', () => {
    const ctx = new Proxy({ imageSmoothingEnabled: true, imageSmoothingQuality: 'low', lineWidth: 0 } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => {}), set: (t, k: string, v) => ((t[k] = v), true) })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    const draw = vi.spyOn(scenery, 'drawMapScenery').mockReturnValue([])
    const spriteAssets = { 'graphic:city/wall.png': {} as SpriteAssetInfo }
    const pictures: MapData = { ...town, nodes: [{ id: 'l', name: 'wall', type: 'group', children: [{ id: 'i', type: 'picture', name: 'i', graphicId: 'city/wall.png', x: 64, y: 96, children: [] }] }] }
    render(
      <EventEnvProvider value={makeEnv({ mapPreview: { getMap: () => pictures, tilesets: [], spriteAssets } })}>
        <WarpTilePicker mapId="town" x={0} y={0} onPick={() => {}} />
      </EventEnvProvider>,
    )
    expect(draw).toHaveBeenCalled()
    const [, mapArg, options] = draw.mock.calls[0]
    expect(mapArg).toBe(pictures)
    expect(options.assets).toBe(spriteAssets)
  })
})
