import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CanvasContextMenu } from './CanvasContextMenu'
import { makeEntity } from '@/test/helpers'

describe('CanvasContextMenu on an entity', () => {
  it('sets the area colour from the inline swatches and closes', () => {
    const onSetAreaColor = vi.fn()
    const onClose = vi.fn()
    const entity = makeEntity('e1', { components: { Tag: { tag: 'npc', color: 'mint' } } })
    render(
      <CanvasContextMenu
        menuState={{ isOpen: true, x: 10, y: 10, target: { type: 'entity', entity } }}
        onClose={onClose}
        onCreateEntity={vi.fn()}
        onSetAreaColor={onSetAreaColor}
      />,
    )
    expect(screen.getByRole('button', { name: 'Area colour Mint' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Area colour Pink' }))
    expect(onSetAreaColor).toHaveBeenCalledWith('e1', 'pink')
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText('Resize Collider')).toBeNull()
  })
})
