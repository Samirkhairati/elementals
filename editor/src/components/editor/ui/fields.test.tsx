import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { chooseOption } from '@/test/helpers'
import { Checkbox, ColorField, RadioGroup, Select, Slider, type SelectOption } from './fields'

const OPTIONS: SelectOption[] = [
  { value: '', label: 'own frames' },
  { value: 'down', label: 'Down' },
  { value: 'up', label: 'Up', disabled: true },
  { value: 'left', label: 'Left', group: 'Sides' },
  { value: 'right', label: 'Right', group: 'Sides' },
]

function Harness({ initial = '', onChange = () => {} }: { initial?: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(initial)
  return <Select aria-label="Facing" value={v} options={OPTIONS} onChange={(n) => { setV(n); onChange(n) }} />
}

describe('Select', () => {
  it('shows the chosen label and picks an option by clicking, including the empty value', () => {
    const changed = vi.fn()
    render(<Harness initial="down" onChange={changed} />)
    const trigger = screen.getByRole('combobox', { name: 'Facing' })
    expect(trigger).toHaveTextContent('Down')
    chooseOption(trigger, 'left')
    expect(changed).toHaveBeenCalledWith('left')
    expect(trigger).toHaveTextContent('Left')
    chooseOption(trigger, '')
    expect(changed).toHaveBeenLastCalledWith('')
    expect(screen.queryByRole('listbox')).toBeNull() // closed after picking
  })

  it('lists options in a themed popup with group headings, marks the current one and skips disabled ones', () => {
    const changed = vi.fn()
    render(<Harness initial="down" onChange={changed} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Facing' }))
    const list = screen.getByRole('listbox')
    expect(within(list).getByText('Sides')).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'Down' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(list).getByRole('option', { name: 'Up' }))
    expect(changed).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument() // a disabled option does nothing
  })

  it('works from the keyboard: open, move over enabled options, Enter picks, Escape closes', () => {
    const changed = vi.fn()
    render(<Harness initial="down" onChange={changed} />)
    const trigger = screen.getByRole('combobox', { name: 'Facing' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // skips the disabled "Up"
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(changed).toHaveBeenCalledWith('left')
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the placeholder when nothing matches, and does not open while disabled', () => {
    render(<Select aria-label="Sheet" value="gone" placeholder="Choose…" options={[{ value: 'a' }]} onChange={() => {}} disabled />)
    const trigger = screen.getByRole('combobox', { name: 'Sheet' })
    expect(trigger).toHaveTextContent('Choose…')
    fireEvent.click(trigger)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on an outside press', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Facing' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('Checkbox', () => {
  it('toggles from the box and from its label, and reports mixed state', () => {
    const changed = vi.fn()
    const { rerender } = render(<Checkbox checked={false} onChange={changed} label="Override visibility" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Override visibility' }))
    expect(changed).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByText('Override visibility'))
    expect(changed).toHaveBeenCalledTimes(2)
    rerender(<Checkbox checked onChange={changed} label="Override visibility" />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    rerender(<Checkbox checked={false} indeterminate onChange={changed} aria-label="Some" />)
    expect(screen.getByRole('checkbox', { name: 'Some' })).toHaveAttribute('aria-checked', 'mixed')
  })

  it('does nothing while disabled', () => {
    const changed = vi.fn()
    render(<Checkbox checked={false} disabled onChange={changed} aria-label="Locked" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Locked' }))
    expect(changed).not.toHaveBeenCalled()
  })
})

describe('RadioGroup', () => {
  const options = [{ value: 'a', label: 'Alpha', hint: 'first' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma', disabled: true }]
  it('picks by click and arrow keys, skipping disabled choices', () => {
    const changed = vi.fn()
    render(<RadioGroup aria-label="Letter" value="a" options={options} onChange={changed} />)
    expect(screen.getByRole('radio', { name: /Alpha/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('first')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }))
    expect(changed).toHaveBeenLastCalledWith('b')
    fireEvent.keyDown(screen.getByRole('radio', { name: /Alpha/ }), { key: 'ArrowDown' })
    expect(changed).toHaveBeenLastCalledWith('b')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Beta' }), { key: 'ArrowDown' }) // Gamma is disabled
    expect(changed).toHaveBeenCalledTimes(2)
  })
})

describe('Slider', () => {
  const setup = (value = 5) => {
    const changed = vi.fn()
    render(<Slider aria-label="FPS" min={0} max={10} step={1} value={value} onChange={changed} />)
    return { changed, slider: screen.getByRole('slider', { name: 'FPS' }) }
  }

  it('exposes its range and moves with the keyboard, clamped to the ends', () => {
    const { changed, slider } = setup()
    expect(slider).toHaveAttribute('aria-valuenow', '5')
    expect(slider).toHaveAttribute('aria-valuemax', '10')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(changed).toHaveBeenLastCalledWith(6)
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true })
    expect(changed).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(changed).toHaveBeenLastCalledWith(10)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(changed).toHaveBeenLastCalledWith(0)
  })

  it('does not report a change when the value would stay the same', () => {
    const { changed, slider } = setup(10)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(changed).not.toHaveBeenCalled()
  })

  it('follows the pointer along its track', () => {
    const { changed, slider } = setup()
    slider.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, right: 300, bottom: 10, height: 10, x: 100, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(slider, { clientX: 250, pointerId: 1 })
    expect(changed).toHaveBeenLastCalledWith(8) // 75 % of 0..10, rounded to the step
  })
})

describe('ColorField', () => {
  it('shows the colour, accepts a typed hex and presets, and can clear', () => {
    const changed = vi.fn()
    render(<ColorField aria-label="Tint" value="#ff0000" allowEmpty onChange={changed} />)
    const trigger = screen.getByRole('button', { name: 'Tint' })
    expect(trigger).toHaveTextContent('#ff0000')
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Colour picker' })
    const hex = within(dialog).getByLabelText('Hex colour')
    fireEvent.change(hex, { target: { value: '0f0' } })
    fireEvent.blur(hex)
    expect(changed).toHaveBeenLastCalledWith('#00ff00')
    fireEvent.change(hex, { target: { value: 'nonsense' } })
    fireEvent.blur(hex)
    expect(hex).toHaveValue('#ff0000') // restored, nothing reported
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use #3b82f6' }))
    expect(changed).toHaveBeenLastCalledWith('#3b82f6')
    fireEvent.click(within(dialog).getByRole('button', { name: 'None' }))
    expect(changed).toHaveBeenLastCalledWith('')
  })

  it('picks from the square and the hue slider', () => {
    const changed = vi.fn()
    render(<ColorField aria-label="Tint" value="#ff0000" onChange={changed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }))
    const area = screen.getByTestId('color-area')
    area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(area, { clientX: 100, clientY: 0, pointerId: 1 }) // full saturation and brightness
    expect(changed).not.toHaveBeenCalled() // still pure red: nothing changed
    fireEvent.pointerDown(area, { clientX: 0, clientY: 100, pointerId: 1 }) // black
    expect(changed).toHaveBeenLastCalledWith('#000000')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Hue' }), { key: 'End' })
    expect(changed).toHaveBeenCalledTimes(2) // the parent never updates the value here, so each pick differs from it
  })
})
