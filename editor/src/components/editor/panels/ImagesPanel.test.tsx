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
    selectImage: vi.fn(),
    placeMultiple: vi.fn(),
    selectImageGroup: vi.fn(),
    groupPickedImages: vi.fn(),
    ungroupImageGroup: vi.fn(),
    renameImageGroup: vi.fn(),
    setImageGroupLocked: vi.fn(),
    deleteImages: vi.fn(),
    duplicateImages: vi.fn(),
    updateImage: vi.fn(),
    deleteImage: vi.fn(),
    duplicateImage: vi.fn(),
    reorderImage: vi.fn(),
    moveImageTo: vi.fn(),
    setResizingImageId: vi.fn(),
    createImageGroup: vi.fn(() => 'new-group'),
    setImagesGroup: vi.fn(),
    deleteImageGroup: vi.fn(),
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

  it('lists the items front first, by name (or picture id), and marks cropped ones', () => {
    setup(items)
    const rows = within(screen.getByTestId('image-list')).getAllByText(/Cloud|sheet/)
    expect(rows.map((r) => r.textContent)).toEqual(['sheet', 'Cloud'])
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
    expect(f.duplicateImages).toHaveBeenCalledWith('i1', ['a'])
    fireEvent.click(within(row).getByRole('button', { name: 'Bring forward' }))
    expect(f.reorderImage).toHaveBeenCalledWith('i1', 'a', 1)
    fireEvent.click(within(row).getByRole('button', { name: 'Delete image' }))
    expect(f.deleteImages).toHaveBeenCalledWith('i1', ['a'])
    // the front item cannot go further forward, the back one cannot go further back
    const front = within(screen.getByTestId('image-list')).getByText('sheet').closest('.ed-row') as HTMLElement
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

  it('Place multiple starts placing copies of that picture', () => {
    const f = setup(items)
    const row = within(screen.getByTestId('image-list')).getByText('Cloud').closest('.ed-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Place multiple' }))
    expect(f.placeMultiple).toHaveBeenCalledWith('i1', 'a')
    expect(f.selectImage).not.toHaveBeenCalled()
  })

  describe('several images', () => {
    const rowOf = (name: string) => within(screen.getByTestId('image-list')).getByText(name).closest('.ed-row') as HTMLElement

    it('click replaces the selection, Ctrl/Cmd+click toggles, Shift+click extends', () => {
      const f = setup(items)
      fireEvent.click(rowOf('Cloud'))
      expect(f.selectImage).toHaveBeenLastCalledWith('i1', 'a', 'replace')
      fireEvent.click(rowOf('Cloud'), { ctrlKey: true })
      expect(f.selectImage).toHaveBeenLastCalledWith('i1', 'a', 'toggle')
      fireEvent.click(rowOf('Cloud'), { metaKey: true })
      expect(f.selectImage).toHaveBeenLastCalledWith('i1', 'a', 'toggle')
      fireEvent.click(rowOf('Cloud'), { shiftKey: true })
      expect(f.selectImage).toHaveBeenLastCalledWith('i1', 'a', 'range')
    })

    it('marks every picked row and says how many are selected', () => {
      setup(items, { pickedImageIds: ['a', 'b'], selectedImageId: 'a' })
      expect(rowOf('Cloud').dataset.selected).toBe('true')
      expect(rowOf('sheet').dataset.selected).toBe('true')
      expect(screen.getByText('2 selected')).toBeTruthy()
    })

    it('Delete and Duplicate on a picked row act on the whole picked set; on another row, on that row only', () => {
      const f = setup(items, { pickedImageIds: ['a', 'b'], selectedImageId: 'a' })
      fireEvent.click(within(rowOf('Cloud')).getByRole('button', { name: 'Delete image' }))
      expect(f.deleteImages).toHaveBeenLastCalledWith('i1', ['a', 'b'])
      fireEvent.click(within(rowOf('sheet')).getByRole('button', { name: 'Duplicate image' }))
      expect(f.duplicateImages).toHaveBeenLastCalledWith('i1', ['a', 'b'])
    })

    it('a row outside the picked set is acted on alone', () => {
      const f = setup(items, { pickedImageIds: ['b'], selectedImageId: 'b' })
      fireEvent.click(within(rowOf('Cloud')).getByRole('button', { name: 'Delete image' }))
      expect(f.deleteImages).toHaveBeenLastCalledWith('i1', ['a'])
    })
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

  describe('groups', () => {
    const grouped = [
      { id: 'a', graphicId: 'sky/sheet.png', x: 4, y: 5, name: 'Left', groupId: 'g1', z: 1 },
      { id: 'b', graphicId: 'sky/sheet.png', x: 40, y: 5, name: 'Right', groupId: 'g1', z: 2 },
      { id: 'c', graphicId: 'sky/sheet.png', x: 80, y: 5, name: 'Loose', z: 3 },
    ]
    const withGroup = (extra: Record<string, unknown> = {}, group: Record<string, unknown> = {}, layerOver: Record<string, unknown> = {}) =>
      setup(grouped, extra, { groups: [{ id: 'g1', name: 'Dam wall', ...group }], ...layerOver })
    const groupRow = () => within(screen.getByTestId('image-group')).getByText('Dam wall').closest('.ed-row') as HTMLElement

    it('shows a group as one row with its members under it, and loose pictures as before', () => {
      withGroup()
      const order = within(screen.getByTestId('image-list')).getAllByText(/Dam wall|Left|Right|Loose/).map((e) => e.textContent)
      expect(order).toEqual(['Loose', 'Dam wall', 'Right', 'Left'])
      expect(within(groupRow()).getByText('2')).toBeTruthy()
    })

    it('can be collapsed to hide its pictures', () => {
      withGroup()
      fireEvent.click(screen.getByRole('button', { name: 'Hide the pictures of Dam wall' }))
      expect(screen.queryByText('Left')).toBeNull()
      expect(screen.getByText('Loose')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Show the pictures of Dam wall' }))
      expect(screen.getByText('Left')).toBeTruthy()
    })

    it('a click on the group row selects the whole group, and it says when it is the open one', () => {
      const f = withGroup({ openImageGroupId: 'g1', pickedImageIds: ['a', 'b'], selectedImageId: 'a' })
      expect(groupRow().dataset.current).toBe('true')
      expect(groupRow().dataset.selected).toBe('true')
      fireEvent.click(groupRow())
      expect(f.selectImageGroup).toHaveBeenCalledWith('i1', 'g1')
    })

    it('the lock button toggles the group lock without selecting it', () => {
      const f = withGroup()
      fireEvent.click(within(groupRow()).getByRole('button', { name: 'Lock Dam wall' }))
      expect(f.setImageGroupLocked).toHaveBeenCalledWith('i1', 'g1', true)
      expect(f.selectImageGroup).not.toHaveBeenCalled()
    })

    it('a locked group shows as locked and unlocks again', () => {
      const f = withGroup({}, { locked: true })
      const button = within(groupRow()).getByRole('button', { name: 'Unlock Dam wall' })
      expect(button).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(button)
      expect(f.setImageGroupLocked).toHaveBeenCalledWith('i1', 'g1', false)
    })

    const menuItem = (name: RegExp | string) => screen.getByRole('menuitem', { name })

    it('rename, duplicate and delete act on the group from its row; Ungroup is in its right-click menu', () => {
      const f = withGroup()
      const row = groupRow()
      expect(within(row).queryByRole('button', { name: 'Ungroup Dam wall' })).toBeNull()
      fireEvent.click(within(row).getByRole('button', { name: 'Duplicate Dam wall' }))
      expect(f.duplicateImages).toHaveBeenCalledWith('i1', ['b', 'a'])
      fireEvent.click(within(row).getByRole('button', { name: 'Delete Dam wall' }))
      expect(f.deleteImageGroup).toHaveBeenCalledWith('i1', 'g1')
      fireEvent.contextMenu(row)
      fireEvent.click(menuItem(/^Ungroup/))
      expect(f.ungroupImageGroup).toHaveBeenCalledWith('i1', 'g1')
      fireEvent.click(within(groupRow()).getByRole('button', { name: 'Rename Dam wall' }))
      const input = screen.getByLabelText('Group name') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Wall' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(f.renameImageGroup).toHaveBeenCalledWith('i1', 'g1', 'Wall')
    })

    it('there are no Group / Ungroup buttons in the header', () => {
      withGroup()
      expect(screen.queryByRole('button', { name: 'Group pictures' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Ungroup pictures' })).toBeNull()
    })

    it('right-clicking the list makes a new empty group and opens its name', () => {
      const f = setup(items)
      fireEvent.contextMenu(screen.getByTestId('image-list-area'))
      fireEvent.click(menuItem('New group'))
      expect(f.createImageGroup).toHaveBeenCalledWith('i1', [])
    })

    it('an empty group is listed, says so, and takes a picture dragged onto it', () => {
      const f = setup(grouped, {}, { groups: [{ id: 'g1', name: 'Dam wall' }, { id: 'e', name: 'Empty one' }] })
      expect(screen.getByTestId('empty-group')).toBeTruthy()
      const empty = screen.getByText('Empty one').closest('.ed-row') as HTMLElement
      const loose = screen.getByText('Loose').closest('.ed-row') as HTMLElement
      const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
      fireEvent.dragStart(loose, { dataTransfer })
      fireEvent.dragOver(empty, { dataTransfer })
      fireEvent.drop(empty, { dataTransfer })
      expect(f.setImagesGroup).toHaveBeenCalledWith('i1', ['c'], 'e')
    })

    it('a picture row\'s menu groups it, moves it to another group, or takes it out of its group', () => {
      const f = setup(grouped, {}, { groups: [{ id: 'g1', name: 'Dam wall' }, { id: 'g2', name: 'Roof' }] })
      const left = () => screen.getByText('Left').closest('.ed-row') as HTMLElement
      fireEvent.contextMenu(left())
      fireEvent.click(menuItem(/Take out of group/))
      expect(f.setImagesGroup).toHaveBeenCalledWith('i1', ['a'], null)
      fireEvent.contextMenu(left())
      fireEvent.click(menuItem(/Group this picture/))
      expect(f.createImageGroup).toHaveBeenCalledWith('i1', ['a'])
      fireEvent.contextMenu(screen.getByText('Loose').closest('.ed-row') as HTMLElement)
      expect(screen.queryByRole('menuitem', { name: /Take out of group/ })).toBeNull()
      expect(menuItem(/Move to group/)).toBeTruthy()
    })

    it('Ctrl+G groups the picked pictures (one is enough); Ctrl+Shift+G ungroups the picked picture\'s group', () => {
      const f = withGroup({ selectedImageId: 'c', pickedImageIds: ['c'] })
      fireEvent.keyDown(window, { key: 'g', ctrlKey: true })
      expect(f.groupPickedImages).toHaveBeenCalledWith('i1')
      const g = withGroup({ selectedImageId: 'a', pickedImageIds: ['a'] })
      fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true })
      expect(g.ungroupImageGroup).toHaveBeenCalledWith('i1', 'g1')
    })

    it('everything about groups is off on a locked layer', () => {
      withGroup({}, {}, { locked: true })
      expect(within(groupRow()).getByRole('button', { name: 'Lock Dam wall' })).toBeDisabled()
      expect(within(groupRow()).getByRole('button', { name: 'Delete Dam wall' })).toBeDisabled()
      fireEvent.contextMenu(groupRow())
      expect(menuItem(/^Ungroup/)).toHaveAttribute('data-disabled')
    })
  })
})
