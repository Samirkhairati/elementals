import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CharacterDef } from '../../../../../../shared/engine/characters'
import { newCharacter } from '@/lib/characterEdit'
import type { PixelData } from '@/lib/sheetDetect'
import { SheetsTab } from './SheetsTab'
import { fitZoom } from './SheetGridPreview'

const pixels = vi.hoisted(() => ({ next: null as unknown }))
vi.mock('@/lib/imagePixels', () => ({
  readImagePixels: () => (pixels.next instanceof Error ? Promise.reject(pixels.next) : Promise.resolve(pixels.next)),
}))

const SIZE = { width: 32, height: 16 }
const graphics = [{ id: 'sprites/a.png', ...SIZE, bytes: 1, mtimeMs: 0 }]
const images = { 'sprites/a.png': 'data:image/png;base64,AAAA' }

/** `cols`×`rows` cells of 8 px, each with a 6 px sprite inside. */
function sheetPixels(cols: number, rows: number): PixelData {
  const width = cols * 8
  const height = rows * 8
  const data = new Uint8ClampedArray(width * height * 4)
  for (let c = 0; c < cols * rows; c++) {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) data[((Math.floor(c / cols) * 8 + 1 + y) * width + (c % cols) * 8 + 1 + x) * 4 + 3] = 255
  }
  return { data, width, height }
}

function setup(def: CharacterDef) {
  const changes: CharacterDef[] = []
  render(<SheetsTab def={def} graphics={graphics} images={images} onChange={(d) => changes.push(d)} />)
  return changes
}

afterEach(() => { pixels.next = null })

describe('SheetsTab cut', () => {
  const def = newCharacter('prop', 'Ball', 'sprites/a.png', SIZE)

  it('draws every frame of the cut over the picture', () => {
    setup({ ...def, sheets: { sheet: { ...def.sheets.sheet, frameWidth: 8, frameHeight: 8 } } })
    const preview = screen.getByTestId('sheet-grid-preview')
    expect(preview.querySelectorAll('[data-frame]')).toHaveLength(8)
  })

  it('"Detect from picture" applies the grid it finds and says so', async () => {
    pixels.next = sheetPixels(4, 2)
    const changes = setup(def)
    fireEvent.click(screen.getByRole('button', { name: /Detect from picture/ }))
    await waitFor(() => expect(changes).toHaveLength(1))
    expect(changes[0].sheets.sheet).toMatchObject({ frameWidth: 8, frameHeight: 8, margin: 0, spacing: 0 })
    expect(screen.getByTestId('detect-note-sheet')).toHaveTextContent('Found 4×2 frames of 8×8 px.')
  })

  it('leaves the cut alone and explains when there are no gaps to find', async () => {
    pixels.next = { data: new Uint8ClampedArray(32 * 16 * 4).fill(255), width: 32, height: 16 }
    const changes = setup(def)
    fireEvent.click(screen.getByRole('button', { name: /Detect from picture/ }))
    expect(await screen.findByTestId('detect-note-sheet')).toHaveTextContent('No gaps between frames were found')
    expect(changes).toHaveLength(0)
  })

  it('reports an image that cannot be read', async () => {
    pixels.next = new Error('The image could not be loaded')
    setup(def)
    fireEvent.click(screen.getByRole('button', { name: /Detect from picture/ }))
    expect(await screen.findByTestId('detect-note-sheet')).toHaveTextContent('The image could not be loaded')
  })
})

describe('fitZoom', () => {
  it('picks a whole zoom that fits the box, between 1 and the cap', () => {
    expect(fitZoom(128, 192)).toBe(2)
    expect(fitZoom(16, 16)).toBe(4)
    expect(fitZoom(2000, 2000)).toBe(1)
    expect(fitZoom(128, 192, 460, 560, 3)).toBe(2)
  })
})
