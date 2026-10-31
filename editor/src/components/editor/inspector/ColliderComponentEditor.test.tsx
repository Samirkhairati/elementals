/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { ColliderComponentEditor } from './ColliderComponentEditor'
import { renderWithEditor, assetMap, characterMeta, makeAsset } from '@/test/editorContext'

const hero = makeAsset('characters/hero', characterMeta()) // 32x48 frame, pivot bottom-centre

const col = (over: Record<string, any> = {}) => ({ width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true, ...over })

function setup(value = col(), components: Record<string, any> = {}) {
  const onChange = vi.fn()
  const onChangeMany = vi.fn()
  renderWithEditor(
    <ColliderComponentEditor entityId="e1" value={value} components={{ Collider: value, ...components }} onChange={onChange} onChangeMany={onChangeMany} />,
    { spriteAssets: assetMap(hero), spriteList: [hero] },
  )
  return { onChange, onChangeMany }
}

const viewport = () => screen.getByTestId('entity-viewport')
const geo = () => ({ ax: Number(viewport().dataset.anchorX), ay: Number(viewport().dataset.anchorY), z: Number(viewport().dataset.zoom) })
const withSprite = { Sprite: { asset: 'characters/hero', facing: 'down', frame: 0, offsetX: 0, offsetY: 0, scale: 1, flipX: false } }

describe('ColliderComponentEditor', () => {
  it('switches between Solid and Trigger', () => {
    const { onChange } = setup()
    expect(screen.getByRole('radio', { name: /Solid/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /Trigger/ }))
    expect(onChange).toHaveBeenCalledWith('isSolid', false)
  })

  it('draws solid colliders solid and trigger zones dashed', () => {
    setup(col({ isSolid: false }))
    expect(screen.getByTestId('collider-body')).toHaveAttribute('stroke-dasharray')
  })

  it('draws solid colliders with a continuous outline', () => {
    setup(col({ isSolid: true }))
    expect(screen.getByTestId('collider-body')).not.toHaveAttribute('stroke-dasharray')
  })

  it('shows the collider box in the diagram at its size', () => {
    setup(col({ width: 16, height: 8, offsetX: 4, offsetY: -2 }))
    const { ax, ay, z } = geo()
    const body = screen.getByTestId('collider-body')
    expect(Number(body.getAttribute('width'))).toBe(16 * z)
    expect(Number(body.getAttribute('height'))).toBe(8 * z)
    expect(Number(body.getAttribute('x'))).toBe(ax + (4 - 8) * z)
    expect(Number(body.getAttribute('y'))).toBe(ay + (-2 - 8) * z)
  })

  it('edits the numbers with units; each commit is one change', () => {
    const { onChange } = setup()
    const w = screen.getByLabelText('Width')
    fireEvent.change(w, { target: { value: '48' } })
    fireEvent.blur(w)
    expect(onChange).toHaveBeenCalledWith('width', 48)
    const oy = screen.getByLabelText('Offset Y')
    fireEvent.change(oy, { target: { value: '-4' } })
    fireEvent.keyDown(oy, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('offsetY', -4)
    expect(screen.getAllByText('px').length).toBe(4)
  })

  it('"Fit to tile" is one change and is disabled when already one tile', () => {
    const { onChangeMany } = setup(col({ width: 16, height: 8, offsetX: 3 }))
    fireEvent.click(screen.getByRole('button', { name: /Fit to tile/ }))
    expect(onChangeMany).toHaveBeenCalledTimes(1)
    expect(onChangeMany).toHaveBeenCalledWith({ width: 32, height: 32, offsetX: 0, offsetY: 0 })
  })

  it('"Fit to tile" is disabled for the default collider', () => {
    setup()
    expect(screen.getByRole('button', { name: /Fit to tile/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Reset/ })).toBeDisabled()
  })

  it('"Fit to sprite" wraps the sprite frame and needs a sprite', () => {
    const { onChangeMany } = setup(col(), withSprite)
    fireEvent.click(screen.getByRole('button', { name: /Fit to sprite/ }))
    expect(onChangeMany).toHaveBeenCalledWith({ width: 32, height: 48, offsetX: 0, offsetY: 0 })
  })

  it('"Fit to sprite" is disabled without a sprite asset', () => {
    setup()
    expect(screen.getByRole('button', { name: /Fit to sprite/ })).toBeDisabled()
  })

  it('"Fit to sprite" follows the sprite offset', () => {
    const { onChangeMany } = setup(col(), { Sprite: { ...withSprite.Sprite, offsetX: 4, offsetY: -2 } })
    fireEvent.click(screen.getByRole('button', { name: /Fit to sprite/ }))
    expect(onChangeMany).toHaveBeenCalledWith({ width: 32, height: 48, offsetX: 4, offsetY: -2 })
  })

  it('"Reset" restores one solid tile', () => {
    const { onChangeMany } = setup(col({ width: 64, height: 12, offsetX: 5, offsetY: 3, isSolid: false }))
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(onChangeMany).toHaveBeenCalledWith({ width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true })
  })

  it('resizing with a handle snaps to 4px and is ONE change on release', () => {
    const { onChangeMany, onChange } = setup()
    const { ax, ay, z } = geo()
    // east handle sits at x = +16 (right edge), y = -16 (middle)
    fireEvent.mouseDown(screen.getByTestId('handle-e'), { clientX: ax + 16 * z, clientY: ay - 16 * z, button: 0 })
    fireEvent.mouseMove(window, { clientX: ax + 22 * z, clientY: ay - 16 * z })
    fireEvent.mouseMove(window, { clientX: ax + 25 * z, clientY: ay - 16 * z })
    expect(onChangeMany).not.toHaveBeenCalled()
    fireEvent.mouseUp(window, { clientX: ax + 25 * z, clientY: ay - 16 * z })
    expect(onChangeMany).toHaveBeenCalledTimes(1)
    // right edge 16 -> 25 snaps to 24: width 40, centre shifts by 4
    expect(onChangeMany).toHaveBeenCalledWith({ width: 40, height: 32, offsetX: 4, offsetY: 0 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Shift disables snapping', () => {
    const { onChangeMany } = setup()
    const { ax, ay, z } = geo()
    fireEvent.mouseDown(screen.getByTestId('handle-e'), { clientX: ax + 16 * z, clientY: ay - 16 * z, button: 0 })
    fireEvent.mouseUp(window, { clientX: ax + 19 * z, clientY: ay - 16 * z, shiftKey: true })
    expect(onChangeMany).toHaveBeenCalledWith({ width: 35, height: 32, offsetX: 2, offsetY: 0 })
  })

  it('Alt resizes from the centre', () => {
    const { onChangeMany } = setup()
    const { ax, ay, z } = geo()
    fireEvent.mouseDown(screen.getByTestId('handle-s'), { clientX: ax, clientY: ay, button: 0 })
    fireEvent.mouseUp(window, { clientX: ax, clientY: ay + 8 * z, altKey: true })
    expect(onChangeMany).toHaveBeenCalledWith({ width: 32, height: 48, offsetX: 0, offsetY: 8 })
  })

  it('dragging the body moves the offset', () => {
    const { onChangeMany } = setup()
    const { ax, ay, z } = geo()
    fireEvent.mouseDown(screen.getByTestId('collider-body'), { clientX: ax, clientY: ay - 16 * z, button: 0 })
    fireEvent.mouseUp(window, { clientX: ax + 8 * z, clientY: ay - 16 * z - 4 * z })
    expect(onChangeMany).toHaveBeenCalledWith({ width: 32, height: 32, offsetX: 8, offsetY: -4 })
  })

  it('Escape cancels a gesture and Enter commits it', () => {
    const { onChangeMany } = setup()
    const { ax, ay, z } = geo()
    fireEvent.mouseDown(screen.getByTestId('handle-e'), { clientX: ax + 16 * z, clientY: ay - 16 * z, button: 0 })
    fireEvent.mouseMove(window, { clientX: ax + 32 * z, clientY: ay - 16 * z })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.mouseUp(window, { clientX: ax + 32 * z, clientY: ay - 16 * z })
    expect(onChangeMany).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByTestId('handle-e'), { clientX: ax + 16 * z, clientY: ay - 16 * z, button: 0 })
    fireEvent.mouseMove(window, { clientX: ax + 24 * z, clientY: ay - 16 * z })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onChangeMany).toHaveBeenCalledTimes(1)
    expect(onChangeMany).toHaveBeenCalledWith({ width: 40, height: 32, offsetX: 4, offsetY: 0 })
    fireEvent.mouseUp(window, { clientX: ax + 24 * z, clientY: ay - 16 * z })
    expect(onChangeMany).toHaveBeenCalledTimes(1)
  })

  it('a click on a handle without moving changes nothing', () => {
    const { onChangeMany } = setup()
    const { ax, ay, z } = geo()
    fireEvent.mouseDown(screen.getByTestId('handle-n'), { clientX: ax, clientY: ay - 32 * z, button: 0 })
    fireEvent.mouseUp(window, { clientX: ax, clientY: ay - 32 * z })
    expect(onChangeMany).not.toHaveBeenCalled()
  })
})
