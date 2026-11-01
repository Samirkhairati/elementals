import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import type { Condition } from '../../../../../shared/engine/types'
import { ConditionsEditor, defaultCondition } from './ConditionsEditor'
import { chooseOption } from '@/test/helpers'
import { makeEnv, renderWithEnv } from './eventTestUtils'

function setup(conditions: Condition[], env = makeEnv()) {
  const onChange = vi.fn()
  renderWithEnv(<ConditionsEditor conditions={conditions} onChange={onChange} />, env)
  return { onChange, env }
}

describe('ConditionsEditor', () => {
  it('explains the empty state', () => {
    setup([])
    expect(screen.getByText('No conditions.')).toBeInTheDocument()
  })

  it('adds each kind of condition from the menu with sensible defaults', () => {
    const { onChange } = setup([])
    const kinds: [string, Condition][] = [
      ['Switch', { kind: 'switch', id: '', value: true }],
      ['Variable', { kind: 'variable', id: '', op: '==', value: 0 }],
      ['Stage', { kind: 'stage', id: '', op: '>=', value: '' }],
      ['Self switch', { kind: 'selfSwitch', key: 'A', value: true }],
      ['Has item', { kind: 'hasItem', item: '', qty: 1 }],
    ]
    for (const [label, expected] of kinds) {
      fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
      fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${label}`) }))
      expect(onChange).toHaveBeenLastCalledWith([expected])
    }
    expect(onChange).toHaveBeenCalledTimes(kinds.length)
  })

  it('appends to existing conditions', () => {
    const existing: Condition[] = [{ kind: 'selfSwitch', key: 'B', value: false }]
    const { onChange } = setup(existing)
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Switch/ }))
    expect(onChange).toHaveBeenCalledWith([existing[0], defaultCondition('switch')])
  })

  it('removes a condition', () => {
    const a: Condition = { kind: 'switch', id: 'met', value: true }
    const b: Condition = { kind: 'selfSwitch', key: 'A', value: true }
    const { onChange } = setup([a, b])
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }))
    expect(onChange).toHaveBeenCalledWith([b])
  })

  it('switch row: picker by name and ON/OFF', () => {
    const { onChange } = setup([{ kind: 'switch', id: 'met', value: true }])
    const row = document.querySelector('[data-condition-kind="switch"]') as HTMLElement
    expect(within(row).getByRole('button', { name: /Met the guard/ })).toBeInTheDocument()
    chooseOption(within(row).getByRole('combobox', { name: 'Condition 1 value' }), 'off')
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'switch', id: 'met', value: false }])
    fireEvent.click(within(row).getByRole('button', { name: /Met the guard/ }))
    fireEvent.click(screen.getByRole('option', { name: /Door open/ }))
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'switch', id: 'door', value: true }])
  })

  it('variable row: picker, operator and number', () => {
    const { onChange } = setup([{ kind: 'variable', id: 'badges', op: '==', value: 0 }])
    expect(screen.getByRole('button', { name: /Badges earned/ })).toBeInTheDocument()
    chooseOption(screen.getByRole('combobox', { name: 'Condition 1 comparison' }), '>=')
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'variable', id: 'badges', op: '>=', value: 0 }])
    const num = screen.getByLabelText('Condition 1 number')
    fireEvent.change(num, { target: { value: '3' } })
    fireEvent.blur(num)
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'variable', id: 'badges', op: '==', value: 3 }])
  })

  it('offers all six comparison operators', () => {
    setup([{ kind: 'variable', id: 'badges', op: '==', value: 0 }])
    fireEvent.click(screen.getByRole('combobox', { name: 'Condition 1 comparison' }))
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(6)
  })

  it('self switch row: A-D and ON/OFF', () => {
    const { onChange } = setup([{ kind: 'selfSwitch', key: 'A', value: true }])
    const select = screen.getByRole('combobox', { name: 'Condition 1 self switch' })
    fireEvent.click(select)
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['A', 'B', 'C', 'D'])
    fireEvent.click(select) // close again
    chooseOption(select, 'C')
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'selfSwitch', key: 'C', value: true }])
    chooseOption(screen.getByRole('combobox', { name: 'Condition 1 value' }), 'off')
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'selfSwitch', key: 'A', value: false }])
  })

  it('self switch row keeps a custom name selectable', () => {
    const { onChange } = setup([{ kind: 'selfSwitch', key: 'opened', value: false }])
    const select = screen.getByRole('combobox', { name: 'Condition 1 self switch' })
    expect(select).toHaveTextContent('opened')
    fireEvent.click(select)
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['A', 'B', 'C', 'D', 'opened'])
    fireEvent.click(select)
    chooseOption(select, 'B')
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'selfSwitch', key: 'B', value: false }])
  })

  it('stage row: stage, comparison and a value of that stage', () => {
    const { onChange } = setup([{ kind: 'stage', id: 'cat', op: '>=', value: 'found' }])
    const row = document.querySelector('[data-condition-kind="stage"]') as HTMLElement
    expect(within(row).getByRole('button', { name: /Lost cat/ })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /Found/ })).toBeInTheDocument()
    chooseOption(within(row).getByRole('combobox', { name: 'Condition 1 comparison' }), '<')
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'stage', id: 'cat', op: '<', value: 'found' }])
    fireEvent.click(within(row).getByRole('button', { name: /Found/ }))
    fireEvent.click(screen.getByRole('option', { name: /Done/ }))
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'stage', id: 'cat', op: '>=', value: 'done' }])
  })

  it('stage row: changing the stage clears the value, which belonged to the old one', () => {
    const env = makeEnv({
      stages: [
        { id: 'cat', name: 'Lost cat', values: [{ id: 'none', name: 'None' }, { id: 'found', name: 'Found' }], initial: 'none' },
        { id: 'gym', name: 'Gym', values: [{ id: 'closed', name: 'Closed' }], initial: 'closed' },
      ],
    })
    const { onChange } = setup([{ kind: 'stage', id: 'cat', op: '>=', value: 'found' }], env)
    fireEvent.click(screen.getByRole('button', { name: /Lost cat/ }))
    fireEvent.click(screen.getByRole('option', { name: /Gym/ }))
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'stage', id: 'gym', op: '>=', value: '' }])
  })

  it('stage row: reports a stage or value that no longer exists', () => {
    setup([{ kind: 'stage', id: 'cat', op: '==', value: 'removed' }])
    expect(screen.getByText(/has no value "removed"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Missing: removed/ })).toBeInTheDocument()
  })

  it('has-item row: item and quantity (at least 1)', () => {
    const { onChange } = setup([{ kind: 'hasItem', item: 'potion', qty: 1 }])
    const item = screen.getByLabelText('Condition 1 item')
    expect(item).toHaveValue('potion')
    fireEvent.change(item, { target: { value: 'ether' } })
    fireEvent.blur(item)
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'hasItem', item: 'ether', qty: 1 }])
    const qty = screen.getByLabelText('Condition 1 quantity')
    fireEvent.change(qty, { target: { value: '0' } })
    fireEvent.blur(qty)
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'hasItem', item: 'potion', qty: 1 }])
    fireEvent.change(qty, { target: { value: '5' } })
    fireEvent.blur(qty)
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'hasItem', item: 'potion', qty: 5 }])
  })

  it('changing the kind replaces the row with that kind default', () => {
    const { onChange } = setup([{ kind: 'switch', id: 'met', value: false }])
    chooseOption(screen.getByRole('combobox', { name: 'Condition 1 type' }), 'variable')
    expect(onChange).toHaveBeenCalledWith([{ kind: 'variable', id: '', op: '==', value: 0 }])
  })

  it('explains AND semantics when there are several conditions', () => {
    setup([
      { kind: 'switch', id: 'met', value: true },
      { kind: 'switch', id: 'door', value: true },
    ])
    expect(screen.getByText('All conditions must be true at the same time (AND).')).toBeInTheDocument()
  })

  it('shows an inline problem for a switch that no longer exists', () => {
    setup([{ kind: 'switch', id: 'ghost', value: true }])
    expect(screen.getByText('Switch "ghost" does not exist')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Missing: ghost/ })).toBeInTheDocument()
  })

  it('can create a switch from a condition row', () => {
    const { onChange, env } = setup([{ kind: 'switch', id: '', value: true }])
    fireEvent.click(screen.getByRole('button', { name: /Choose switch/ }))
    fireEvent.click(screen.getByRole('button', { name: /New switch/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New switch name' }), { target: { value: 'Gate open' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(env.addSwitch).toHaveBeenCalledWith('Gate open')
    expect(onChange).toHaveBeenCalledWith([{ kind: 'switch', id: 'sw_gate_open', value: true }])
  })
})
