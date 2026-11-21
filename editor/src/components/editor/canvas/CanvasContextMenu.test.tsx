import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SceneNode } from '../../../../../shared/sceneTree'
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

  it('offers the drop shadow of that picture and closes', () => {
    const add = vi.fn()
    const onClose = vi.fn()
    render(menu({ pictureId: 'pic-1' }, { onPlaceMultiple: vi.fn(), onClose, pictureShadow: (id: string) => (id === 'pic-1' ? { has: false, add } : null) }))
    fireEvent.click(screen.getByText('Add drop shadow'))
    expect(add).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('has no such entry when the click was not on a picture', () => {
    render(menu({}, { onPlaceMultiple: vi.fn() }))
    expect(screen.queryByText('Place multiple')).toBeNull()
  })
})

describe('CanvasContextMenu creating nodes', () => {
  const open = (onPlaceNode: (...a: unknown[]) => void, snapToGrid: boolean, prefab = false) => {
    render(
      <CanvasContextMenu
        menuState={{ isOpen: true, x: 10, y: 10, target: { type: 'tile', tileX: 3, tileY: 2, worldX: 117, worldY: 83 } }}
        onClose={vi.fn()}
        onCreateEntity={vi.fn()}
        onPlaceNode={onPlaceNode as never}
        snapToGrid={snapToGrid}
      />,
    )
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Node' }), { key: 'ArrowRight' })
    if (prefab) fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Prefab' }), { key: 'ArrowRight' })
  }
  let n = 0
  const newId = () => `n${++n}`
  const made = (place: ReturnType<typeof vi.fn>) => (place.mock.lastCall![0] as (id: () => string) => SceneNode)(newId)

  it('Node › New Node puts an empty Node with its anchor on the clicked tile anchor (magnet on) or the exact pixel (off)', () => {
    const place = vi.fn()
    open(place, true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Node' }))
    expect(made(place)).toMatchObject({ type: 'group', name: 'Node', x: 112, y: 96, children: [] })
    cleanup()
    open(place, false)
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Node' }))
    expect(made(place)).toMatchObject({ type: 'group', x: 117, y: 83 })
  })

  it('Node › Prefab places a copy of the prefab tree there, linked to the prefab', () => {
    const place = vi.fn()
    open(place, true, true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'NPC' }))
    const node = made(place) as SceneNode & { x: number; y: number; prefab?: string }
    expect(node).toMatchObject({ type: 'entity', name: 'NPC', x: 112, y: 96, prefab: 'npc' })
    expect(node.id).toMatch(/^n\d+$/)
  })
})
