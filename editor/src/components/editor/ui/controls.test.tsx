import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Field, InfoTip, ZoomControls } from './controls'

describe('InfoTip', () => {
  it('shows its text after a click and hides it on Escape or an outside click', () => {
    render(<InfoTip>Explains the thing</InfoTip>)
    expect(screen.queryByText('Explains the thing')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More info' }))
    expect(screen.getByText('Explains the thing')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Explains the thing')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More info' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('Explains the thing')).toBeNull()
  })

  it('Field puts its info next to the label', () => {
    render(
      <Field label="Speed" info="How fast">
        <input aria-label="v" />
      </Field>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More info' }))
    expect(screen.getByText('How fast')).toBeInTheDocument()
  })
})

describe('ZoomControls', () => {
  it('shows the zoom in percent and calls the handlers', () => {
    const calls: string[] = []
    render(<ZoomControls zoom={1.5} onZoomIn={() => calls.push('in')} onZoomOut={() => calls.push('out')} onFit={() => calls.push('fit')} />)
    expect(screen.getByTestId('zoom-readout')).toHaveTextContent('150%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }))
    expect(calls).toEqual(['in', 'out', 'fit'])
  })
})
