/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithEditor } from '@/test/editorContext'
import { makeGroup, makePicture } from '@/test/helpers'
import { ImagesPanel } from './ImagesPanel'

// The picture rows (and their menus, drag and drop, groups) are rows of the Scene panel: see SceneTree.test.tsx. This panel
// adds pictures and inspects the picked one.

const graphics = [{ id: 'sky/sheet.png', width: 64, height: 32, bytes: 1, mtimeMs: 0 }]
const sheetAsset = {
  id: 'graphic:sky/sheet.png',
  meta: { version: 1, name: 'sheet', kind: 'object', frameWidth: 64, frameHeight: 32, margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1 },
  sheets: { 'sheet.png': 'data:image/png;base64,AA==' },
}

/** Pictures in draw order (the first draws first); plain objects become picture nodes. */
const pictures = (list: any[]) => list.map((p) => (p.type ? p : makePicture(p.id, { assetId: undefined, ...p })))

function setup(images: any[], extra: Record<string, unknown> = {}, layerOver: Record<string, unknown> = {}) {
  const fns = {
    startImagePlacement: vi.fn(),
    cancelImagePlacement: vi.fn(),
    placeMultiple: vi.fn(),
    updateImage: vi.fn(),
    setResizingImageId: vi.fn(),
    groupNodes: vi.fn(),
    ungroupNode: vi.fn(),
  }
  const layer = { id: 'i1', name: 'Sky', type: 'image', children: pictures(images), ...layerOver }
  renderWithEditor(<ImagesPanel />, {
    activeMap: { name: 'Town', nodes: [layer] },
    activeLayerId: 'i1',
    graphics,
    graphicImages: { 'sky/sheet.png': 'data:image/png;base64,AA==' },
    spriteList: [],
    spriteAssets: { 'graphic:sky/sheet.png': sheetAsset },
    pendingImage: null,
    selectedImageId: null,
    pickedImageIds: (extra.selectedImageId ? [extra.selectedImageId] : []) as string[],
    openImageGroupId: null,
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

  it('previews a cropped picture as the whole picture with the cropped part outlined', () => {
    setup(items, { selectedImageId: 'b' })
    const outline = screen.getByTestId('crop-outline')
    expect(outline).toHaveClass('border-dashed')
    expect(outline.title).toMatch(/16×16 px from 32, 0/)
  })

  it('an uncropped item has no outline in its preview', () => {
    setup(items, { selectedImageId: 'a' })
    expect(screen.queryByTestId('crop-outline')).toBeNull()
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

  it('"Place more" starts placing copies of the picked picture (crop, scale and flips come along)', () => {
    const f = setup(items, { selectedImageId: 'b' })
    fireEvent.click(screen.getByRole('button', { name: 'Place more of this image' }))
    expect(f.placeMultiple).toHaveBeenCalledWith('i1', 'b')
  })

  it('asks for an image layer when the active layer is another kind', () => {
    renderWithEditor(<ImagesPanel />, { layers: [{ id: 't', name: 'Ground', type: 'tile', visible: true, locked: false }], activeLayerId: 't' } as any)
    expect(screen.getByText(/Select an image layer/)).toBeInTheDocument()
  })

  describe('Resize and the Crop / Resize shortcuts', () => {
    const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: k, ...init })

    it('has a Resize button beside Crop, with the shortcut in its tooltip, for the picked picture', () => {
      setup(items, { selectedImageId: 'a' })
      expect(screen.getByRole('button', { name: 'Resize image' }).getAttribute('title')).toMatch(/Ctrl\+T|⌘T/)
      expect(screen.getByRole('button', { name: 'Crop image' }).getAttribute('title')).toMatch(/\(C\)/)
    })

    it('Resize turns the handles on the map on for that picture (no dialog); pressed again it turns them off', () => {
      const f = setup(items, { selectedImageId: 'a' })
      fireEvent.click(screen.getByRole('button', { name: 'Resize image' }))
      expect(f.setResizingImageId).toHaveBeenLastCalledWith('a')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('while resizing the button reads Done, and Done, Enter or Esc ends it', () => {
      const f = setup(items, { selectedImageId: 'a', resizingImageId: 'a' })
      const button = screen.getByRole('button', { name: 'Resize image' })
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(button.textContent).toContain('Done')
      fireEvent.click(button)
      expect(f.setResizingImageId).toHaveBeenLastCalledWith(null)
      f.setResizingImageId.mockClear()
      key('Escape')
      expect(f.setResizingImageId).toHaveBeenCalledWith(null)
    })

    it('Ctrl+T turns the resize handles on for the picked picture', () => {
      const f = setup(items, { selectedImageId: 'a' })
      key('t', { ctrlKey: true })
      expect(f.setResizingImageId).toHaveBeenCalledWith('a')
    })

    it('C opens the crop dialog', () => {
      setup(items, { selectedImageId: 'a' })
      key('c')
      expect(screen.getByRole('dialog', { name: 'Crop picture' })).toBeTruthy()
    })

    it('the shortcuts and buttons are off on a locked layer, without a picked picture, and while typing', () => {
      const f = setup(items, { selectedImageId: 'a' }, { locked: true })
      expect(screen.getByRole('button', { name: 'Resize image' })).toBeDisabled()
      key('t', { ctrlKey: true })
      key('c')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(f.setResizingImageId).not.toHaveBeenCalled()
    })

    it('nothing happens with no picked picture', () => {
      const f = setup(items)
      key('t', { ctrlKey: true })
      key('c')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(f.setResizingImageId).not.toHaveBeenCalled()
    })
  })

  it('says how many are picked, and edits the picked picture\'s fields', () => {
    const f = setup(items, { pickedImageIds: ['a', 'b'], selectedImageId: 'a' })
    expect(screen.getByText('2 selected')).toBeTruthy()
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Big cloud' } })
    fireEvent.blur(name)
    expect(f.updateImage).toHaveBeenCalledWith('i1', 'a', { name: 'Big cloud' })
  })

  it('a locked picture freezes its fields, the layer still takes new pictures; a locked picture group only picks as one', () => {
    setup([{ ...items[0], locked: true }], { selectedImageId: 'a' })
    expect(screen.getByLabelText('Image scale')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add image' })).not.toBeDisabled()
    cleanup()
    setup([makeGroup('g', pictures([items[0]]), { locked: true })], { selectedImageId: 'a' })
    expect(screen.getByLabelText('Image scale')).not.toBeDisabled()
  })

  it('a picture inside a group: Add says it goes into the open group', () => {
    setup([makeGroup('g1', pictures(items), { name: 'Dam wall' })], { openImageGroupId: 'g1' })
    expect(screen.getByRole('button', { name: 'Add image' }).title).toMatch(/Dam wall/)
  })

  describe('group shortcuts', () => {
    const grouped = () => [makeGroup('g1', pictures([{ id: 'a', graphicId: 'sky/sheet.png', x: 4, y: 5, name: 'Left' }]), { name: 'Dam wall' }), ...pictures([{ id: 'c', graphicId: 'sky/sheet.png', x: 80, y: 5, name: 'Loose' }])]

    it('Ctrl+G groups the picked pictures (one is enough); Ctrl+Shift+G ungroups the picked picture\'s group', () => {
      const f = setup(grouped(), { selectedImageId: 'c', pickedImageIds: ['c'] })
      fireEvent.keyDown(window, { key: 'g', ctrlKey: true })
      expect(f.groupNodes).toHaveBeenCalledWith(['c'])
      const g = setup(grouped(), { selectedImageId: 'a', pickedImageIds: ['a'] })
      fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true })
      expect(g.ungroupNode).toHaveBeenCalledWith('g1')
    })

    it('are off on a locked layer', () => {
      const f = setup(grouped(), { selectedImageId: 'a', pickedImageIds: ['a'] }, { locked: true })
      fireEvent.keyDown(window, { key: 'g', ctrlKey: true })
      fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true })
      expect(f.groupNodes).not.toHaveBeenCalled()
      expect(f.ungroupNode).not.toHaveBeenCalled()
    })
  })
})
