import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  CurveEditor,
  GradingEditor,
  HslMixer,
  LookSection,
  LookSlider,
  cleanWheel,
  formatLookValue,
  insertCurvePoint,
  moveCurvePoint,
  removeCurvePoint,
  setCurveChannel,
  setGradingPart,
  setHslValue,
} from './lookControls'

describe('LookSlider', () => {
  const setup = (value = 0) => {
    const onChange = vi.fn()
    render(<LookSlider label="Exposure" value={value} min={-5} max={5} step={0.01} onChange={onChange} />)
    return onChange
  }
  it('steps with the arrow keys (Shift x10), done each time', () => {
    const onChange = setup()
    const s = screen.getByRole('slider', { name: 'Exposure' })
    fireEvent.keyDown(s, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(0.01, true)
    fireEvent.keyDown(s, { key: 'ArrowLeft', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(-0.1, true)
  })
  it('resets on double click of the label', () => {
    const onChange = setup(2)
    fireEvent.doubleClick(screen.getByText('Exposure'))
    expect(onChange).toHaveBeenCalledWith(0, true)
  })
  it('commits a typed value on Enter, clamped, and cancels on Escape', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Exposure value' }))
    fireEvent.change(screen.getByLabelText('Exposure value input'), { target: { value: '9' } })
    fireEvent.keyDown(screen.getByLabelText('Exposure value input'), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(5, true)
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Exposure value' }))
    fireEvent.change(screen.getByLabelText('Exposure value input'), { target: { value: '1' } })
    fireEvent.keyDown(screen.getByLabelText('Exposure value input'), { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
  })
  it('formats with a plus for bipolar sliders', () => {
    expect(formatLookValue(1.5, 0.01, true)).toBe('+1.50')
    expect(formatLookValue(-3, 1, true)).toBe('-3')
    expect(formatLookValue(3, 1, false)).toBe('3')
  })
})

describe('HslMixer', () => {
  it('emits the band shape on a hue change and removes neutral bands', () => {
    const onChange = vi.fn()
    const { rerender } = render(<HslMixer hsl={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'blue band' }))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Hue' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({ blue: { h: 1 } }, true)
    rerender(<HslMixer hsl={{ blue: { h: 1 } }} onChange={onChange} />)
    expect(screen.getByTestId('changed-blue')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Hue' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(undefined, true)
  })
  it('keeps other bands when one becomes neutral', () => {
    expect(setHslValue({ red: { s: 5 }, blue: { h: 1 } }, 'blue', 'h', 0)).toEqual({ red: { s: 5 } })
  })
})

describe('curves', () => {
  it('inserts sorted, clamps moves between neighbours, keeps endpoints on removal', () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    const ins = insertCurvePoint(straight, { x: 0.5, y: 0.7 })
    expect(ins.index).toBe(1)
    expect(ins.points).toHaveLength(3)
    const moved = moveCurvePoint(ins.points, 1, { x: 2, y: -1 })
    expect(moved[1].x).toBeLessThan(1)
    expect(moved[1].y).toBe(0)
    expect(removeCurvePoint(ins.points, 0)).toBe(ins.points)
    expect(removeCurvePoint(ins.points, 1)).toEqual(straight)
  })
  it('stores a straight curve as absent and no curves as undefined', () => {
    const bent = [
      { x: 0, y: 0.1 },
      { x: 1, y: 1 },
    ]
    const straight = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    expect(setCurveChannel({ r: bent }, 'r', straight)).toBeUndefined()
    expect(setCurveChannel({ r: bent }, 'g', bent)).toHaveProperty('r')
  })
  it('reset removes the channel', () => {
    const onChange = vi.fn()
    const curves = {
      rgb: [
        { x: 0, y: 0.1 },
        { x: 1, y: 1 },
      ],
      g: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.6 },
        { x: 1, y: 1 },
      ],
    }
    render(<CurveEditor curves={curves} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset curve' }))
    expect(onChange).toHaveBeenCalledWith({ g: curves.g }, true)
    fireEvent.click(screen.getByRole('radio', { name: 'Green curve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset curve' }))
    expect(onChange).toHaveBeenLastCalledWith({ rgb: curves.rgb }, true)
  })
})

describe('GradingEditor', () => {
  it('emits undefined when made neutral', () => {
    const onChange = vi.fn()
    render(<GradingEditor grading={{ balance: 1 }} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Balance' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith(undefined, true)
  })
  it('removes neutral wheels and default blending', () => {
    expect(cleanWheel({ hue: 40, sat: 0, lum: 0 })).toBeUndefined()
    expect(setGradingPart({ shadows: { hue: 10, sat: 20 }, blending: 60 }, { shadows: { sat: 0 }, blending: 50 })).toBeUndefined()
    expect(setGradingPart(undefined, { global: { hue: 200, sat: 30 } })).toEqual({ global: { hue: 200, sat: 30 } })
  })
  it('switches to a single wheel', () => {
    render(<GradingEditor grading={undefined} onChange={() => {}} />)
    expect(screen.getAllByRole('group', { name: /wheel/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('tab', { name: 'Global' }))
    expect(screen.getAllByRole('group', { name: /wheel/ })).toHaveLength(1)
  })
})

describe('LookSection', () => {
  it('toggles open, visibility and reset', () => {
    const toggle = vi.fn()
    const reset = vi.fn()
    render(
      <LookSection title="Light" visible={false} onToggleVisible={toggle} onReset={reset}>
        <p>body</p>
      </LookSection>,
    )
    expect(screen.queryByText('body')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Light' }))
    expect(screen.getByText('body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show Light' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset Light' }))
    expect(toggle).toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
  })
})
