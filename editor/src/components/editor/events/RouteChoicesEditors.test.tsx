import { chooseOption } from '@/test/helpers'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ChoiceOption, RouteStep } from '../../../../../shared/engine/types'
import { ChoicesEditor, RouteEditor, describeRouteSteps, nextOptionId } from './RouteChoicesEditors'

describe('describeRouteSteps', () => {
  it('summarises, folding repeated moves', () => {
    expect(describeRouteSteps([])).toBe('No steps yet')
    expect(
      describeRouteSteps([{ type: 'up' }, { type: 'up' }, { type: 'up' }, { type: 'turn', value: 'left' }, { type: 'wait', value: 500 }, { type: 'speed', value: 120 }, { type: 'forward' }]),
    ).toBe('Move up ×3, turn left, wait 500 ms, speed 120 px/s, move forward')
  })
})

describe('RouteEditor', () => {
  const setup = (steps: RouteStep[]) => {
    const onChange = vi.fn()
    render(<RouteEditor steps={steps} onChange={onChange} />)
    return onChange
  }

  it('starts with a readable empty summary', () => {
    setup([])
    expect(screen.getByTestId('route-summary')).toHaveTextContent('No steps yet')
  })

  it('adds steps with sensible defaults', () => {
    const onChange = setup([])
    fireEvent.click(screen.getByRole('button', { name: 'Add step: Move up' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'up' }])
    fireEvent.click(screen.getByRole('button', { name: 'Add step: Turn' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'turn', value: 'down' }])
    fireEvent.click(screen.getByRole('button', { name: 'Add step: Wait' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'wait', value: 500 }])
    fireEvent.click(screen.getByRole('button', { name: 'Add step: Set speed' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'speed', value: 100 }])
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('adds several tiles of movement at once (one change)', () => {
    const onChange = setup([{ type: 'wait', value: 100 }])
    const tiles = screen.getByLabelText('Tiles per move step')
    fireEvent.change(tiles, { target: { value: '3' } })
    fireEvent.blur(tiles)
    fireEvent.click(screen.getByRole('button', { name: 'Add step: Move right' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([{ type: 'wait', value: 100 }, { type: 'right' }, { type: 'right' }, { type: 'right' }])
    fireEvent.click(screen.getByRole('button', { name: 'Add step: Wait' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'wait', value: 100 }, { type: 'wait', value: 500 }])
  })

  it('edits per-step parameters', () => {
    const onChange = setup([{ type: 'turn', value: 'down' }, { type: 'wait', value: 500 }, { type: 'speed', value: 100 }])
    chooseOption(screen.getByRole('combobox', { name: 'Step 1 direction' }), 'up')
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'turn', value: 'up' }, { type: 'wait', value: 500 }, { type: 'speed', value: 100 }])
    const ms = screen.getByLabelText('Step 2 milliseconds')
    fireEvent.change(ms, { target: { value: '800' } })
    fireEvent.blur(ms)
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'turn', value: 'down' }, { type: 'wait', value: 800 }, { type: 'speed', value: 100 }])
    const speed = screen.getByLabelText('Step 3 speed')
    fireEvent.change(speed, { target: { value: '60' } })
    fireEvent.blur(speed)
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'turn', value: 'down' }, { type: 'wait', value: 500 }, { type: 'speed', value: 60 }])
  })

  it('reorders and deletes steps', () => {
    const steps: RouteStep[] = [{ type: 'up' }, { type: 'down' }, { type: 'left' }]
    const onChange = setup(steps)
    fireEvent.click(screen.getByRole('button', { name: 'Move step 2 up' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'down' }, { type: 'up' }, { type: 'left' }])
    fireEvent.click(screen.getByRole('button', { name: 'Move step 2 down' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'up' }, { type: 'left' }, { type: 'down' }])
    fireEvent.click(screen.getByRole('button', { name: 'Delete step 1' }))
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'down' }, { type: 'left' }])
    expect(screen.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move step 3 down' })).toBeDisabled()
  })
})

describe('ChoicesEditor', () => {
  const options: ChoiceOption[] = [
    { id: 'opt1', label: 'Yes' },
    { id: 'opt2', label: 'No' },
  ]

  it('generates unique option ids', () => {
    expect(nextOptionId([])).toBe('opt1')
    expect(nextOptionId(options)).toBe('opt3')
    expect(nextOptionId([{ id: 'opt2', label: '' }])).toBe('opt1')
  })

  it('adds an option with a new branch id', () => {
    const onChange = vi.fn()
    render(<ChoicesEditor options={options} branchCounts={{}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    expect(onChange).toHaveBeenCalledWith([...options, { id: 'opt3', label: 'Option 3' }], [])
  })

  it('edits labels on blur', () => {
    const onChange = vi.fn()
    render(<ChoicesEditor options={options} branchCounts={{}} onChange={onChange} />)
    const input = screen.getByLabelText('Option 2 label')
    fireEvent.change(input, { target: { value: 'Not now' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith([options[0], { id: 'opt2', label: 'Not now' }], [])
  })

  it('reorders options', () => {
    const onChange = vi.fn()
    render(<ChoicesEditor options={options} branchCounts={{}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move option 2 up' }))
    expect(onChange).toHaveBeenCalledWith([options[1], options[0]], [])
    expect(screen.getByRole('button', { name: 'Move option 1 up' })).toBeDisabled()
  })

  it('removes an option without commands immediately', () => {
    const onChange = vi.fn()
    render(<ChoicesEditor options={options} branchCounts={{ opt1: 0 }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([options[1]], [])
  })

  it('warns before removing an option whose branch has commands', () => {
    const onChange = vi.fn()
    render(<ChoicesEditor options={options} branchCounts={{ opt1: 3 }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('has 3 commands in its branch')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(within(alert).getByRole('button', { name: 'Keep' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove option and commands' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([options[1]], ['opt1'])
  })

  it('uses singular wording for one command', () => {
    render(<ChoicesEditor options={options} branchCounts={{ opt2: 1 }} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 2' }))
    expect(screen.getByRole('alert')).toHaveTextContent('has 1 command in its branch')
  })
})
