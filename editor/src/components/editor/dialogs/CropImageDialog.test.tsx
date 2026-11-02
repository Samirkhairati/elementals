import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CropImageDialog } from './CropImageDialog'

const size = { width: 64, height: 32 }

function setup(crop?: { x: number; y: number; w: number; h: number }) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<CropImageDialog open graphicId="sky/sheet.png" url="data:image/png;base64,AA==" size={size} crop={crop} onApply={onApply} onClose={onClose} />)
  const dialog = screen.getByRole('dialog')
  const stage = within(dialog).getByTestId('crop-stage')
  // jsdom has no layout: the pane picks some zoom, the stage's pixel width says which.
  const zoom = parseFloat(stage.style.width) / size.width
  return { onApply, onClose, dialog, stage, zoom }
}

const drag = (target: Element, zoom: number, from: [number, number], to: [number, number]) => {
  fireEvent.mouseDown(target, { button: 0, clientX: from[0] * zoom, clientY: from[1] * zoom })
  fireEvent.mouseMove(window, { clientX: to[0] * zoom, clientY: to[1] * zoom })
  fireEvent.mouseUp(window)
}

describe('CropImageDialog', () => {
  it('starts on the whole picture and applies it as "no crop"', () => {
    const { onApply, onClose, dialog } = setup()
    expect(within(dialog).getByLabelText('Crop width')).toHaveValue('64')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop' }))
    expect(onApply).toHaveBeenCalledWith(undefined)
    expect(onClose).toHaveBeenCalled()
  })

  it('starts from the item\'s current crop', () => {
    const { dialog } = setup({ x: 8, y: 4, w: 16, h: 12 })
    expect(within(dialog).getByLabelText('Crop x')).toHaveValue('8')
    expect(within(dialog).getByLabelText('Crop height')).toHaveValue('12')
  })

  it('dragging on the picture draws a new box (also when the box is still the whole picture)', () => {
    const { onApply, dialog, zoom } = setup()
    drag(within(dialog).getByTestId('crop-box'), zoom, [10, 4], [30, 20])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop' }))
    expect(onApply).toHaveBeenCalledWith({ x: 10, y: 4, w: 20, h: 16 })
  })

  it('dragging on empty ground next to an existing box also draws a new one', () => {
    const { onApply, dialog, stage, zoom } = setup({ x: 40, y: 20, w: 10, h: 10 })
    drag(stage, zoom, [2, 2], [12, 10])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop' }))
    expect(onApply).toHaveBeenCalledWith({ x: 2, y: 2, w: 10, h: 8 })
  })

  it('dragging a handle resizes the box and dragging the box moves it, always inside the picture', () => {
    const { onApply, dialog, zoom } = setup({ x: 10, y: 10, w: 20, h: 10 })
    drag(dialog.querySelector('[data-handle="se"]')!, zoom, [30, 20], [40, 22])
    drag(within(dialog).getByTestId('crop-box'), zoom, [20, 15], [200, 15])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop' }))
    // 30x12 after the resize, then pushed against the right edge
    expect(onApply).toHaveBeenCalledWith({ x: 34, y: 10, w: 30, h: 12 })
  })

  it('"Whole picture" resets the box, and typing a value keeps it valid', () => {
    const { onApply, dialog } = setup({ x: 8, y: 4, w: 16, h: 12 })
    const w = within(dialog).getByLabelText('Crop width')
    fireEvent.change(w, { target: { value: '500' } })
    fireEvent.blur(w)
    expect(w).toHaveValue('56') // clamped to the room left of x = 8
    fireEvent.click(within(dialog).getByRole('button', { name: 'Whole picture' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop' }))
    expect(onApply).toHaveBeenCalledWith(undefined)
  })

  it('Cancel closes without applying', () => {
    const { onApply, onClose, dialog } = setup()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })
})
