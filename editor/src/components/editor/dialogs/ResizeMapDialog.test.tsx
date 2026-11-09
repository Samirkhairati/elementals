import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Layer } from '@/types/editor'
import { ResizeMapDialog } from './ResizeMapDialog'

const ground: Layer = {
  id: 'g', name: 'ground', type: 'tile', visible: true, locked: false,
  data: { 0: { tilesetId: 'grass.png', x: 0, y: 0 }, 3: { tilesetId: 'grass.png', x: 1, y: 0 }, 11: { tilesetId: 'grass.png', x: 2, y: 0 } },
}
const map = {
  name: 'Town', width: 4, height: 3, layers: [ground],
  entities: [{ id: 'e1', name: 'Sign', x: 3 * 32 + 16, y: 32, components: {} }],
}

const setup = () => {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(<ResizeMapDialog map={map} tilesets={[]} onClose={onClose} onConfirm={onConfirm} />)
  return { onConfirm, onClose }
}

const type = (label: string, value: string) => {
  const input = screen.getByLabelText(label)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('ResizeMapDialog', () => {
  it('starts unchanged: shows the size and keeps Resize disabled', () => {
    setup()
    expect(screen.getByRole('heading', { name: /Resize “Town”/ })).toBeInTheDocument()
    expect(screen.getByTestId('resize-size')).toHaveTextContent('4 × 3 → 4 × 3')
    expect(screen.getByRole('button', { name: 'Resize' })).toBeDisabled()
    expect(screen.queryByTestId('resize-warning')).toBeNull()
  })

  it('growing needs no warning and confirms with the typed edges', () => {
    const { onConfirm } = setup()
    type('Left (tiles)', '2')
    type('Bottom (tiles)', '1')
    expect(screen.getByTestId('resize-size')).toHaveTextContent('4 × 3 → 6 × 4')
    expect(screen.queryByTestId('resize-warning')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resize' }))
    expect(onConfirm).toHaveBeenCalledWith({ left: 64, top: 0, right: 0, bottom: 32 })
  })

  it('warns which painted tiles a crop cuts (entities are kept) and makes the button say so', () => {
    const { onConfirm } = setup()
    type('Right (tiles)', '-1')
    const warning = screen.getByTestId('resize-warning')
    expect(warning).toHaveTextContent('This crops 2 painted tiles.')
    expect(warning).toHaveTextContent('ground: 2 tiles')
    expect(warning).not.toHaveTextContent('Sign')
    fireEvent.click(screen.getByRole('button', { name: 'Resize and crop tiles' }))
    expect(onConfirm).toHaveBeenCalledWith({ left: 0, top: 0, right: -32, bottom: 0 })
  })

  it('in Pixels the right edge stops on any pixel, and the size can be typed', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Pixels' }))
    type('Width (pixels)', '140')
    expect(screen.getByTestId('resize-size')).toHaveTextContent('128 × 96 → 140 × 96 px')
    expect(screen.getByTestId('resize-grid')).toHaveTextContent('5 × 3 tiles of 32 px')
    fireEvent.click(screen.getByRole('button', { name: 'Resize' }))
    expect(onConfirm).toHaveBeenCalledWith({ left: 0, top: 0, right: 12, bottom: 0 })
  })

  it('in Pixels the left edge still moves in whole tiles', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Pixels' }))
    type('Left (pixels)', '40')
    expect(screen.getByTestId('resize-size')).toHaveTextContent('→ 160 × 96 px')
  })

  it('the preview zooms with its buttons', () => {
    setup()
    const before = screen.getByTestId('resize-zoom').textContent
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByTestId('resize-zoom').textContent).not.toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    expect(screen.getByTestId('resize-zoom').textContent).toBe(before)
  })

  it('refuses to crop the map away entirely', () => {
    const { onConfirm } = setup()
    type('Left (tiles)', '-4')
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 1 × 1/)
    expect(screen.getByRole('button', { name: 'Resize' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Resize' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Reset puts every side back to zero, Cancel closes', () => {
    const { onClose } = setup()
    type('Top (tiles)', '3')
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(screen.getByTestId('resize-size')).toHaveTextContent('4 × 3 → 4 × 3')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Snap to tiles is on; turning it off switches to Pixels, choosing Tiles turns it back on', () => {
    setup()
    const snap = screen.getByRole('switch', { name: 'Snap to tiles' })
    expect(snap).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(snap)
    expect(snap).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Pixels' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Tiles' }))
    expect(snap).toHaveAttribute('aria-checked', 'true')
  })

  it('renders nothing for a null map', () => {
    render(<ResizeMapDialog map={null} tilesets={[]} onClose={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
