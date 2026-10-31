/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { SpriteComponentEditor } from './SpriteComponentEditor'
import { renderWithEditor, assetMap, characterMeta, makeAsset, objectMeta } from '@/test/editorContext'

const hero = makeAsset('characters/hero', characterMeta())
const chest = makeAsset('objects/chest', objectMeta())
const assets = assetMap(hero, chest)

const spriteValue = (over: Record<string, any> = {}) => ({
  asset: 'characters/hero', facing: 'down', animation: '', frame: 0, offsetX: 0, offsetY: 0, scale: 1, flipX: false, tint: '', opacity: 1, visible: true, ...over,
})

function setup(value: Record<string, any> = spriteValue(), components: Record<string, any> = {}) {
  const onChange = vi.fn()
  const onChangeMany = vi.fn()
  renderWithEditor(
    <SpriteComponentEditor entityId="e1" value={value} components={{ Sprite: value, ...components }} onChange={onChange} onChangeMany={onChangeMany} />,
    { spriteAssets: assets, spriteList: [hero, chest] },
  )
  return { onChange, onChangeMany }
}

const viewport = () => screen.getByTestId('entity-viewport')
const anchor = () => ({ x: Number(viewport().dataset.anchorX), y: Number(viewport().dataset.anchorY), zoom: Number(viewport().dataset.zoom) })

describe('SpriteComponentEditor', () => {
  it('shows the chosen asset and its kind', () => {
    setup()
    expect(screen.getByRole('button', { name: /characters\/hero\. Change/ })).toBeInTheDocument()
    expect(screen.getByText('Hero')).toBeInTheDocument()
    expect(screen.getAllByText('character').length).toBeGreaterThan(0)
  })

  it('offers a picker with search, folders and "None"; picking writes asset and resets animation/frame in one change', () => {
    const { onChangeMany } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Change/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'No sprite' })).toBeInTheDocument()
    expect(within(dialog).getByText('characters')).toBeInTheDocument()
    expect(within(dialog).getByText('objects')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Search sprites'), { target: { value: 'chest' } })
    expect(within(dialog).queryByRole('button', { name: 'Sprite characters/hero' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sprite objects/chest' }))
    expect(onChangeMany).toHaveBeenCalledTimes(1)
    expect(onChangeMany).toHaveBeenCalledWith({ asset: 'objects/chest', animation: '', frame: 0 })
  })

  it('clears the sprite through "None"', () => {
    const { onChangeMany } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Clear sprite' }))
    expect(onChangeMany).toHaveBeenCalledWith({ asset: '', animation: '', frame: 0 })
  })

  it('warns about an unknown asset id instead of showing a blank card, with a way to pick another', () => {
    setup(spriteValue({ asset: 'characters/gone' }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('characters/gone')
    expect(screen.queryByTestId('entity-viewport')).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Pick another sprite' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('previews exactly the frame the game shows for the facing', () => {
    const { onChange } = setup(spriteValue({ facing: 'down' }))
    // idleFrame 1 of the "down" row (row 0, 4 frames per direction)
    expect(viewport().dataset.frameIndex).toBe('1')
    expect(viewport().dataset.sheet).toBe('walk.png')
    fireEvent.click(screen.getByRole('radio', { name: 'Face left' }))
    expect(onChange).toHaveBeenCalledWith('facing', 'left')
  })

  it('renders the facing from props (left = row 1, right = row 2, up = row 3)', () => {
    for (const [facing, index] of [['left', '5'], ['right', '9'], ['up', '13']] as const) {
      const { unmount } = (() => {
        const r = renderWithEditor(
          <SpriteComponentEditor entityId="e" value={spriteValue({ facing })} components={{}} onChange={vi.fn()} onChangeMany={vi.fn()} />,
          { spriteAssets: assets, spriteList: [hero] },
        )
        return r
      })()
      expect(viewport().dataset.frameIndex).toBe(index)
      unmount()
    }
  })

  it('switches the preview phase (idle / walk / run) without touching the data', () => {
    const { onChange, onChangeMany } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Walk' }))
    expect(viewport().dataset.sheet).toBe('walk.png')
    fireEvent.click(screen.getByRole('radio', { name: 'Run' }))
    expect(viewport().dataset.sheet).toBe('run.png')
    fireEvent.click(screen.getByRole('radio', { name: 'Idle' }))
    expect(viewport().dataset.sheet).toBe('walk.png')
    expect(onChange).not.toHaveBeenCalled()
    expect(onChangeMany).not.toHaveBeenCalled()
  })

  it('hides facing and phase for objects and offers animations or a frame stepper', () => {
    const { onChange } = setup(spriteValue({ asset: 'objects/chest' }))
    expect(screen.queryByRole('radio', { name: 'Face left' })).toBeNull()
    expect(viewport().dataset.frameIndex).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }))
    expect(onChange).toHaveBeenCalledWith('frame', 1)
    fireEvent.change(screen.getByLabelText('Animation'), { target: { value: 'open' } })
    expect(onChange).toHaveBeenCalledWith('animation', 'open')
  })

  it('previews the static frame of an object', () => {
    setup(spriteValue({ asset: 'objects/chest', frame: 2 }))
    expect(viewport().dataset.frameIndex).toBe('2')
  })

  it('drags the sprite to change the offset: live while dragging, ONE change on release, 1px steps', () => {
    const { onChangeMany, onChange } = setup()
    const a = anchor()
    fireEvent.mouseDown(screen.getByTestId('sprite-drag-area'), { clientX: a.x, clientY: a.y, button: 0 })
    fireEvent.mouseMove(window, { clientX: a.x + 3 * a.zoom, clientY: a.y - 2 * a.zoom })
    fireEvent.mouseMove(window, { clientX: a.x + 6 * a.zoom, clientY: a.y - 5 * a.zoom })
    expect(onChangeMany).not.toHaveBeenCalled()
    fireEvent.mouseUp(window, { clientX: a.x + 6 * a.zoom, clientY: a.y - 5 * a.zoom })
    expect(onChangeMany).toHaveBeenCalledTimes(1)
    expect(onChangeMany).toHaveBeenCalledWith({ offsetX: 6, offsetY: -5 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('snaps to 8px while Shift is held', () => {
    const { onChangeMany } = setup()
    const a = anchor()
    fireEvent.mouseDown(screen.getByTestId('sprite-drag-area'), { clientX: a.x, clientY: a.y, button: 0 })
    fireEvent.mouseUp(window, { clientX: a.x + 5 * a.zoom, clientY: a.y + 11 * a.zoom, shiftKey: true })
    expect(onChangeMany).toHaveBeenCalledWith({ offsetX: 8, offsetY: 8 })
  })

  it('Escape cancels a drag', () => {
    const { onChangeMany } = setup()
    const a = anchor()
    fireEvent.mouseDown(screen.getByTestId('sprite-drag-area'), { clientX: a.x, clientY: a.y, button: 0 })
    fireEvent.mouseMove(window, { clientX: a.x + 20 * a.zoom, clientY: a.y })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.mouseUp(window, { clientX: a.x + 20 * a.zoom, clientY: a.y })
    expect(onChangeMany).not.toHaveBeenCalled()
  })

  it('edits offsets numerically (commit on Enter) and resets them', () => {
    const { onChange, onChangeMany } = setup(spriteValue({ offsetX: 4, offsetY: -2 }))
    const x = screen.getByLabelText('Offset X')
    fireEvent.change(x, { target: { value: '10' } })
    expect(onChange).not.toHaveBeenCalled() // typing alone is not a history step
    fireEvent.keyDown(x, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('offsetX', 10)
    fireEvent.click(screen.getByRole('button', { name: /Reset offset/ }))
    expect(onChangeMany).toHaveBeenCalledWith({ offsetX: 0, offsetY: 0 })
  })

  it('has no reset when the offset is already zero', () => {
    setup()
    expect(screen.getByRole('button', { name: /Reset offset/ })).toBeDisabled()
  })

  it('writes opacity, flip, visibility and tint', () => {
    const { onChange } = setup(spriteValue({ tint: '#ff0000' }))
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0.5' } })
    expect(onChange).toHaveBeenCalledWith('opacity', 0.5)
    fireEvent.click(screen.getByRole('switch', { name: 'Flip horizontally' }))
    expect(onChange).toHaveBeenCalledWith('flipX', true)
    fireEvent.click(screen.getByRole('switch', { name: 'Visible' }))
    expect(onChange).toHaveBeenCalledWith('visible', false)
    fireEvent.click(screen.getByRole('button', { name: 'Clear tint' }))
    expect(onChange).toHaveBeenCalledWith('tint', '')
  })

  it('shows the collider in the preview when the entity has one and lets the author hide it', () => {
    setup(spriteValue(), { Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true } })
    expect(screen.getByTestId('collider-body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle collider overlay' }))
    expect(screen.queryByTestId('collider-body')).toBeNull()
  })

  it('zoom buttons set the preview zoom', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: '4×' }))
    expect(viewport().dataset.zoom).toBe('4')
    fireEvent.click(screen.getByRole('radio', { name: '1×' }))
    expect(viewport().dataset.zoom).toBe('1')
  })
})
