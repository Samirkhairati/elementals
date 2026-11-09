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

describe('CanvasContextMenu over a picture', () => {
  const menu = (target: object, extra: object = {}) => (
    <CanvasContextMenu
      menuState={{ isOpen: true, x: 10, y: 10, target: { type: 'tile', tileX: 1, tileY: 2, ...target } }}
      onClose={vi.fn()}
      onCreateEntity={vi.fn()}
      {...extra}
    />
  )

  it('offers Place multiple for that picture, with its shortcut, and closes', () => {
    const onPlaceMultiple = vi.fn()
    render(menu({ pictureId: 'pic-1' }, { onPlaceMultiple, placeMultipleKeys: 'Ctrl+Shift+D' }))
    expect(screen.getByText('Ctrl+Shift+D')).toBeTruthy()
    fireEvent.click(screen.getByText('Place multiple'))
    expect(onPlaceMultiple).toHaveBeenCalledWith('pic-1')
    // the normal tile menu is still there
    expect(screen.getByText('Sample Tile Here')).toBeTruthy()
  })

  it('has no such entry when the click was not on a picture', () => {
    render(menu({}, { onPlaceMultiple: vi.fn() }))
    expect(screen.queryByText('Place multiple')).toBeNull()
  })
})

describe('CanvasContextMenu creating entities', () => {
  const open = (onCreateEntity: (...a: unknown[]) => void) =>
    render(
      <CanvasContextMenu
        menuState={{ isOpen: true, x: 10, y: 10, target: { type: 'tile', tileX: 3, tileY: 2, worldX: 117, worldY: 83 } }}
        onClose={vi.fn()}
        onCreateEntity={onCreateEntity as never}
      />,
    )

  it('a tile entity is centred on the tile, a free one is made on the exact pixel', () => {
    const create = vi.fn()
    open(create)
    fireEvent.click(screen.getByText('New Tile Entity'))
    expect(create).toHaveBeenLastCalledWith('New Entity', 112, 96, undefined, false)
    fireEvent.click(screen.getByText('New Free Entity'))
    expect(create).toHaveBeenLastCalledWith('New Entity', 117, 83, undefined, true)
  })

  it('a free entity without a known pixel falls back to the tile anchor', () => {
    const create = vi.fn()
    render(<CanvasContextMenu menuState={{ isOpen: true, x: 0, y: 0, target: { type: 'tile', tileX: 3, tileY: 2 } }} onClose={vi.fn()} onCreateEntity={create} />)
    fireEvent.click(screen.getByText('New Free Entity'))
    expect(create).toHaveBeenLastCalledWith('New Entity', 112, 96, undefined, true)
  })
})
