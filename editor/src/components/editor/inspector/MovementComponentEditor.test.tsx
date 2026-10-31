/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MovementComponentEditor, WanderPreview } from './MovementComponentEditor'

const mv = (over: Record<string, any> = {}) => ({ controller: 'none', speed: 100, canRun: true, wanderRadius: 3, wanderInterval: 4000, ...over })

function setup(value = mv()) {
  const onChange = vi.fn()
  render(<MovementComponentEditor entityId="e" value={value} components={{ Movement: value }} onChange={onChange} onChangeMany={vi.fn()} />)
  return { onChange }
}

/** Opens every info popover (the explanations are behind the "i" icons). */
const openInfo = () => screen.getAllByRole('button', { name: 'More info' }).forEach((b) => fireEvent.click(b))

describe('MovementComponentEditor', () => {
  it('explains each controller in one line (in its info popover)', () => {
    setup()
    openInfo()
    expect(screen.getByTestId('controller-description')).toHaveTextContent('Stays put')
    fireEvent.click(screen.getByRole('radio', { name: /Wander/ }))
  })

  it('switches the controller', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('radio', { name: /Player/ }))
    expect(onChange).toHaveBeenCalledWith('controller', 'player')
    fireEvent.click(screen.getByRole('radio', { name: /Wander/ }))
    expect(onChange).toHaveBeenCalledWith('controller', 'wander')
  })

  it('shows only the fields that apply: none', () => {
    setup(mv({ controller: 'none' }))
    expect(screen.getByLabelText('Speed')).toBeInTheDocument()
    expect(screen.queryByLabelText('Can run')).toBeNull()
    expect(screen.queryByLabelText('Wander radius')).toBeNull()
    expect(screen.queryByTestId('wander-preview')).toBeNull()
  })

  it('shows only the fields that apply: player', () => {
    const { onChange } = setup(mv({ controller: 'player' }))
    openInfo()
    expect(screen.getByTestId('controller-description')).toHaveTextContent('input')
    expect(screen.getByLabelText('Speed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Can run' }))
    expect(onChange).toHaveBeenCalledWith('canRun', false)
    expect(screen.queryByLabelText('Wander radius')).toBeNull()
  })

  it('shows only the fields that apply: wander, with the radius ring preview', () => {
    const { onChange } = setup(mv({ controller: 'wander', wanderRadius: 4 }))
    expect(screen.queryByLabelText('Can run')).toBeNull()
    expect(screen.getByTestId('wander-preview')).toHaveAttribute('aria-label', expect.stringContaining('4 tiles'))
    const radius = screen.getByLabelText('Wander radius')
    fireEvent.change(radius, { target: { value: '6' } })
    fireEvent.keyDown(radius, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('wanderRadius', 6)
    const interval = screen.getByLabelText('Wander interval')
    fireEvent.change(interval, { target: { value: '9000' } })
    fireEvent.blur(interval)
    expect(onChange).toHaveBeenCalledWith('wanderInterval', 9000)
  })

  it('speed is edited with units and clamped', () => {
    const { onChange } = setup(mv({ controller: 'player' }))
    const speed = screen.getByLabelText('Speed')
    fireEvent.change(speed, { target: { value: '9999' } })
    fireEvent.blur(speed)
    expect(onChange).toHaveBeenCalledWith('speed', 500)
    expect(screen.getByText('px/s')).toBeInTheDocument()
  })

  it('says that tile-based vs free movement is a game setting', () => {
    setup(mv({ controller: 'player' }))
    openInfo()
    expect(screen.getByText(/setting of the game/)).toBeInTheDocument()
  })

  it('the wander preview draws the start tile smaller as the radius grows', () => {
    const startTile = () => {
      const rects = document.querySelectorAll('[data-testid="wander-preview"] rect')
      return Number(rects[rects.length - 1].getAttribute('width'))
    }
    const { rerender } = render(<WanderPreview radius={1} />)
    const small = startTile()
    rerender(<WanderPreview radius={5} />)
    expect(startTile()).toBeLessThan(small)
    expect(document.querySelector('[data-testid="wander-preview"] circle')).toBeInTheDocument()
  })
})
