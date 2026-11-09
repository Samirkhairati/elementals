import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResizeImageDialog } from './ResizeImageDialog'

const assets = {
  'graphic:sky/sheet.png': {
    id: 'graphic:sky/sheet.png',
    meta: { version: 1, name: 'sheet', kind: 'object', frameWidth: 64, frameHeight: 32, margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1 },
    sheets: { 'sheet.png': 'data:image/png;base64,AA==' },
  },
} as never

function open(scale = 1, onApply = vi.fn()) {
  const onClose = vi.fn()
  render(<ResizeImageDialog open item={{ graphicId: 'sky/sheet.png' }} assets={assets} size={{ w: 64, h: 32 }} scale={scale} onApply={onApply} onClose={onClose} />)
  const type = (label: string, value: string) => {
    const input = screen.getByLabelText(label) as HTMLInputElement
    fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)
  }
  return { onApply, onClose, type, apply: () => fireEvent.click(screen.getByRole('button', { name: /^Resize/ })) }
}

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value

describe('ResizeImageDialog', () => {
  it('starts at the current size and cannot apply until something changes', () => {
    open(1)
    expect(value('Width')).toBe('64')
    expect(value('Height')).toBe('32')
    expect(value('Scale')).toBe('1')
    expect(screen.getByRole('button', { name: /^Resize/ })).toBeDisabled()
  })

  it('a width follows into the height and the scale, keeping the shape', () => {
    const { type } = open(1)
    type('Width', '128')
    expect(value('Height')).toBe('64')
    expect(value('Scale')).toBe('2')
  })

  it('a height does the same the other way', () => {
    const { type } = open(1)
    type('Height', '16')
    expect(value('Width')).toBe('32')
    expect(value('Scale')).toBe('0.5')
  })

  it('a preset sets the scale, and Resize applies it and closes', () => {
    const { onApply, onClose, apply } = open(1)
    fireEvent.click(screen.getByRole('button', { name: 'Scale ×3' }))
    expect(value('Width')).toBe('192')
    apply()
    expect(onApply).toHaveBeenCalledWith(3)
    expect(onClose).toHaveBeenCalled()
  })

  it('a typed scale is clamped to the allowed range', () => {
    const { type } = open(1)
    type('Scale', '100')
    expect(value('Scale')).toBe('16')
  })

  it('Cancel changes nothing', () => {
    const { onApply, onClose } = open(2)
    fireEvent.click(screen.getByRole('button', { name: 'Scale ×4' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cancel/ }))
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })
})
