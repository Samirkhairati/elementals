/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts */
import { describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, screen, within } from '@testing-library/react'
import { renderWithEditor } from '@/test/editorContext'
import { ImagesPanel } from './ImagesPanel'

const graphics = [{ id: 'sky/sheet.png', width: 64, height: 32, bytes: 1, mtimeMs: 0 }]
const sheetAsset = {
  id: 'graphic:sky/sheet.png',
  meta: { version: 1, name: 'sheet', kind: 'object', frameWidth: 64, frameHeight: 32, margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1 },
  sheets: { 'sheet.png': 'data:image/png;base64,AA==' },
}

function setup(images: any[], extra: Record<string, unknown> = {}, layerOver: Record<string, unknown> = {}) {
  const fns = {
    startImagePlacement: vi.fn(),
    cancelImagePlacement: vi.fn(),
    setSelectedImageId: vi.fn(),
    updateImage: vi.fn(),
    deleteImage: vi.fn(),
    duplicateImage: vi.fn(),
    reorderImage: vi.fn(),
    moveImageTo: vi.fn(),
  }
  const layer = { id: 'i1', name: 'Sky', type: 'image', visible: true, locked: false, images, ...layerOver }
  renderWithEditor(<ImagesPanel />, {
    layers: [layer],
    activeLayerId: 'i1',
    graphics,
    graphicImages: { 'sky/sheet.png': 'data:image/png;base64,AA==' },
    spriteList: [],
    spriteAssets: { 'graphic:sky/sheet.png': sheetAsset },
    snapEntityPos: (x: number, y: number) => ({ x, y }),
    pendingImage: null,
    selectedImageId: null,
    ...fns,
    ...extra,
  } as any)
  return fns
}

const items = [
  { id: 'a', graphicId: 'sky/sheet.png', x: 4, y: 5, name: 'Cloud' },
  { id: 'b', graphicId: 'sky/sheet.png', x: 40, y: 5, crop: { x: 32, y: 0, w: 16, h: 16 } },
]

describe('ImagesPanel', () => {
  it('Add opens the picture browser and starts placing the pick', () => {
    const { startImagePlacement } = setup([])
    fireEvent.click(screen.getByRole('button', { name: 'Add image' }))
    fireEvent.click(screen.getByRole('radio', { name: /Pictures/ }))
    fireEvent.click(screen.getByTitle('sky/sheet.png'))
    expect(startImagePlacement).toHaveBeenCalledWith({ graphicId: 'sky/sheet.png' })
  })

  it('lists the items front first, by name (or picture id), and marks cropped ones', () => {
    setup(items)
    const rows = within(screen.getByTestId('image-list')).getAllByText(/Cloud|sky\/sheet\.png/)
    expect(rows.map((r) => r.textContent)).toEqual(['sky/sheet.png', 'Cloud'])
    expect(screen.getAllByText('crop')).toHaveLength(1)
  })

  it('disables Add and the row actions on a locked layer', () => {
    setup(items, {}, { locked: true })
    expect(screen.getAllByRole('button', { name: 'Duplicate image' })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled()
  })

  it('duplicates, deletes and reorders from the row buttons', () => {
    const f = setup(items)
    const row = within(screen.getByTestId('image-list')).getByText('Cloud').closest('.ed-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Duplicate image' }))
    expect(f.duplicateImage).toHaveBeenCalledWith('i1', 'a')
    fireEvent.click(within(row).getByRole('button', { name: 'Bring forward' }))
    expect(f.reorderImage).toHaveBeenCalledWith('i1', 'a', 1)
    fireEvent.click(within(row).getByRole('button', { name: 'Delete image' }))
    expect(f.deleteImage).toHaveBeenCalledWith('i1', 'a')
    // the front item cannot go further forward, the back one cannot go further back
    const front = within(screen.getByTestId('image-list')).getByText('sky/sheet.png').closest('.ed-row') as HTMLElement
    expect(within(front).getByRole('button', { name: 'Bring forward' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: 'Send backward' })).toBeDisabled()
  })

  it('dragging a row onto another reorders the draw order in one move', () => {
    const f = setup(items)
    const rows = Array.from(screen.getByTestId('image-list').children) as HTMLElement[]
    // front first: [sky/sheet.png (b), Cloud (a)]. Drag Cloud onto the front one's top half.
    const [front, back] = rows
    const data: Record<string, string> = {}
    const dt = { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k], effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(back, { dataTransfer: dt })
    front.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20, left: 0, right: 10, width: 10, x: 0, y: 0, toJSON: () => ({}) })
    const over = createEvent.dragOver(front, { dataTransfer: dt })
    Object.defineProperty(over, 'clientY', { value: 2 }) // jsdom has no DragEvent, so the pointer position is set by hand
    fireEvent(front, over)
    fireEvent.drop(front, { dataTransfer: dt })
    expect(f.moveImageTo).toHaveBeenCalledWith('i1', 'a', 'b', 'top')
  })

  it('renames from the row: Enter keeps the new name, Esc keeps the old one', () => {
    const f = setup(items)
    const row = within(screen.getByTestId('image-list')).getByText('Cloud').closest('.ed-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Rename image' }))
    const input = within(row).getByLabelText('Image name')
    fireEvent.change(input, { target: { value: 'Big cloud' } })
    fireEvent.blur(input)
    expect(f.updateImage).toHaveBeenCalledWith('i1', 'a', { name: 'Big cloud' })

    f.updateImage.mockClear()
    fireEvent.click(within(row).getByRole('button', { name: 'Rename image' }))
    const again = within(row).getByLabelText('Image name')
    fireEvent.change(again, { target: { value: 'Nope' } })
    fireEvent.keyDown(again, { key: 'Escape' })
    expect(f.updateImage).not.toHaveBeenCalled()
  })

  it('shows the picked item with a preview, and Crop… stores the chosen part on that item only', () => {
    const f = setup(items, { selectedImageId: 'a' })
    expect(screen.getByTestId('image-preview')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Crop image' }))
    const dialog = screen.getByRole('dialog')
    const w = within(dialog).getByLabelText('Crop width')
    fireEvent.change(w, { target: { value: '16' } })
    fireEvent.blur(w)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop' }))
    expect(f.updateImage).toHaveBeenCalledWith('i1', 'a', { crop: { x: 0, y: 0, w: 16, h: 32 } })
  })

  it('Apply with the whole picture stores no crop, so an uncropped item stays plain', () => {
    const f = setup([{ ...items[1] }], { selectedImageId: 'b' })
    fireEvent.click(screen.getByRole('button', { name: 'Crop image' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Whole picture' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop' }))
    expect(f.updateImage).toHaveBeenCalledWith('i1', 'b', { crop: undefined })
  })

  describe('scale', () => {
    const open = () => {
      const f = setup(items, { selectedImageId: 'a' })
      return { f, input: screen.getByLabelText('Image scale') as HTMLInputElement }
    }

    it('shows the size before and after while typing, and applies nothing until Enter', () => {
      const { f, input } = open()
      expect(screen.getByTestId('scale-sizes').textContent).toBe('64×32 px')
      fireEvent.change(input, { target: { value: '2' } })
      expect(screen.getByTestId('scale-sizes').textContent).toContain('64×32 px → 128×64 px')
      expect(screen.getByTestId('scale-sizes').textContent).toContain('Enter to apply')
      expect(f.updateImage).not.toHaveBeenCalled()
    })

    it('Enter applies it once; Esc puts the old value back', () => {
      const { f, input } = open()
      fireEvent.change(input, { target: { value: '3' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(f.updateImage).toHaveBeenCalledTimes(1)
      expect(f.updateImage).toHaveBeenCalledWith('i1', 'a', { scale: 3 })

      f.updateImage.mockClear()
      fireEvent.change(input, { target: { value: '5' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(f.updateImage).not.toHaveBeenCalled()
      expect(input.value).toBe('1')
      expect(screen.getByTestId('scale-sizes').textContent).toBe('64×32 px')
    })

    it('does not apply nonsense, and says what is accepted', () => {
      const { f, input } = open()
      fireEvent.change(input, { target: { value: 'big' } })
      expect(screen.getByTestId('scale-sizes').textContent).toMatch(/Type a number/)
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(f.updateImage).not.toHaveBeenCalled()
    })

    it('the preset buttons apply straight away, and the preview has the size it will get', () => {
      const { f } = open()
      fireEvent.click(screen.getByRole('button', { name: 'Scale 2×' }))
      expect(f.updateImage).toHaveBeenCalledWith('i1', 'a', { scale: 2 })
      fireEvent.change(screen.getByLabelText('Image scale'), { target: { value: '4' } })
      const canvas = screen.getByTestId('image-preview').querySelector('canvas') as HTMLCanvasElement
      expect(parseInt(canvas.style.width, 10) % 256).toBe(0) // 64 px * 4 at a whole-number zoom
    })

    it('is disabled on a locked layer', () => {
      setup(items, { selectedImageId: 'a' }, { locked: true })
      expect(screen.getByLabelText('Image scale')).toBeDisabled()
    })
  })

  it('cannot crop a sprite item (it has its own frames)', () => {
    setup([{ id: 's', assetId: 'objects/chest', x: 0, y: 0 }, items[1]], { selectedImageId: 's' })
    expect(screen.getByRole('button', { name: 'Crop image' })).toBeDisabled()
  })

  it('"Place more" starts placing the same picture and crop', () => {
    const f = setup(items, { selectedImageId: 'b' })
    fireEvent.click(screen.getByRole('button', { name: 'Place more of this image' }))
    expect(f.startImagePlacement).toHaveBeenCalledWith({ assetId: undefined, graphicId: 'sky/sheet.png', crop: { x: 32, y: 0, w: 16, h: 16 } })
  })

  it('asks for an image layer when the active layer is another kind', () => {
    renderWithEditor(<ImagesPanel />, { layers: [{ id: 't', name: 'Ground', type: 'tile', visible: true, locked: false }], activeLayerId: 't' } as any)
    expect(screen.getByText(/Select an image layer/)).toBeInTheDocument()
  })
})
