import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import type { Command, FieldKind } from '../../../../../shared/engine/types'
import { COMMAND_CATALOG } from '../../../../../shared/engine/commands'
import { ParamForm } from './ParamForm'
import { cmd, makeEnv, renderWithEnv } from './eventTestUtils'

function setup(command: Command, env = makeEnv()) {
  const onPatch = vi.fn()
  renderWithEnv(<ParamForm command={command} onPatch={onPatch} />, env)
  return { onPatch, env }
}

const field = (label: string) => document.querySelector(`[data-field="${label}"]`) as HTMLElement

describe('ParamForm: every FieldKind has a real control', () => {
  it('covers every kind used by the catalog', () => {
    const kinds = new Set<FieldKind>()
    for (const def of Object.values(COMMAND_CATALOG)) for (const f of def.params) kinds.add(f.kind)
    const covered: FieldKind[] = ['number', 'text', 'textarea', 'boolean', 'select', 'color', 'sprite', 'facing', 'map', 'switch', 'variable', 'stage', 'stageValue', 'target', 'position', 'sound', 'item', 'route', 'choices', 'conditions']
    expect([...kinds].filter((k) => !covered.includes(k))).toEqual([])
    // and no command renders raw JSON or crashes with its defaults
    for (const def of Object.values(COMMAND_CATALOG)) {
      const { unmount } = renderWithEnv(<ParamForm command={cmd('x', def.type)} onPatch={() => {}} />)
      expect(document.body.textContent).not.toMatch(/\[object Object\]/)
      unmount()
    }
  })

  it('number: commits on blur, ignores garbage, shows the unit', () => {
    const { onPatch } = setup(cmd('w', 'wait', { ms: 500 }))
    expect(within(field('Duration')).getByText('(ms)')).toBeInTheDocument()
    const input = within(field('Duration')).getByRole('spinbutton')
    expect(input).toHaveValue(500)
    fireEvent.change(input, { target: { value: '750' } })
    expect(onPatch).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith({ ms: 750 })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onPatch).toHaveBeenCalledTimes(1)
  })

  it('number: Enter commits as well', () => {
    const { onPatch } = setup(cmd('w', 'wait', { ms: 500 }))
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPatch).toHaveBeenCalledWith({ ms: 100 })
  })

  it('text: commits on blur', () => {
    const { onPatch } = setup(cmd('e', 'emit', { event: '', payload: '' }))
    const input = within(field('Event name')).getByPlaceholderText('e.g. OPEN_CHEST_01')
    fireEvent.change(input, { target: { value: 'OPEN_DOOR' } })
    fireEvent.blur(input)
    expect(onPatch).toHaveBeenCalledWith({ event: 'OPEN_DOOR' })
  })

  it('text: Escape discards the draft', () => {
    const { onPatch } = setup(cmd('e', 'emit', { event: 'A' }))
    const input = within(field('Event name')).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'B' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(onPatch).not.toHaveBeenCalled()
    expect(input).toHaveValue('A')
  })

  it('textarea: live character count, commit on blur', () => {
    const { onPatch } = setup(cmd('t', 'showText', { text: 'Hi' }))
    const area = within(field('Text')).getByRole('textbox')
    expect(screen.getByText('2 characters')).toBeInTheDocument()
    fireEvent.change(area, { target: { value: 'Hello there' } })
    expect(screen.getByText('11 characters')).toBeInTheDocument()
    expect(onPatch).not.toHaveBeenCalled()
    fireEvent.blur(area)
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith({ text: 'Hello there' })
  })

  it('textarea: an edit that is still being typed is committed when the form goes away', () => {
    const onPatch = vi.fn()
    const { unmount } = renderWithEnv(<ParamForm command={cmd('t', 'showText', { text: 'Hi' })} onPatch={onPatch} />)
    fireEvent.change(within(field('Text')).getByRole('textbox'), { target: { value: 'Unsaved' } })
    unmount()
    expect(onPatch).toHaveBeenCalledWith({ text: 'Unsaved' })
  })

  it('boolean: toggles', () => {
    const { onPatch } = setup(cmd('s', 'setSwitch', { id: 'met', value: true }))
    const box = screen.getByRole('checkbox', { name: 'Value' })
    expect(box).toBeChecked()
    fireEvent.click(box)
    expect(onPatch).toHaveBeenCalledWith({ value: false })
  })

  it('select: changes the value; unknown stored values stay visible', () => {
    const { onPatch } = setup(cmd('v', 'setVariable', { id: 'badges', op: 'set', operand: 'const', value: 1 }))
    const select = within(field('Operation')).getByRole('combobox')
    expect(select).toHaveValue('set')
    fireEvent.change(select, { target: { value: 'mul' } })
    expect(onPatch).toHaveBeenCalledWith({ op: 'mul' })
  })

  it('visibleWhen shows only the matching fields', () => {
    const { onPatch } = setup(cmd('v', 'setVariable', { id: 'badges', op: 'set', operand: 'const' }))
    expect(field('Value')).toBeTruthy()
    expect(field('Minimum')).toBeNull()
    expect(field('Source variable')).toBeNull()
    fireEvent.change(within(field('Operand')).getByRole('combobox'), { target: { value: 'random' } })
    expect(onPatch).toHaveBeenCalledWith({ operand: 'random' })
  })

  it('shows random range fields when the operand is random', () => {
    setup(cmd('v', 'setVariable', { id: 'badges', operand: 'random', min: 2, max: 9 }))
    expect(within(field('Minimum')).getByRole('spinbutton')).toHaveValue(2)
    expect(within(field('Maximum')).getByRole('spinbutton')).toHaveValue(9)
    expect(field('Value')).toBeNull()
  })

  it('color: native picker and hex text', () => {
    const { onPatch } = setup(cmd('t', 'tintScreen', { color: '#112233' }))
    const picker = screen.getByLabelText('Colour picker')
    expect(picker).toHaveValue('#112233')
    fireEvent.change(picker, { target: { value: '#ff0000' } })
    expect(onPatch).toHaveBeenCalledWith({ color: '#ff0000' })
    const hex = screen.getByLabelText('Colour hex')
    fireEvent.change(hex, { target: { value: '#00ff00' } })
    fireEvent.blur(hex)
    expect(onPatch).toHaveBeenLastCalledWith({ color: '#00ff00' })
  })

  it('sprite: searchable picker with names, required sprites cannot be cleared', () => {
    const { onPatch } = setup(cmd('c', 'changeSprite', { target: 'self', asset: '' }))
    fireEvent.click(within(field('Sprite')).getByRole('button', { name: /Choose sprite/ }))
    expect(screen.getByRole('option', { name: /Hero/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /No sprite/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'chest' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('option', { name: /Chest/ }))
    expect(onPatch).toHaveBeenCalledWith({ asset: 'objects/chest' })
    expect(screen.queryByRole('dialog', { name: 'Choose a sprite' })).not.toBeInTheDocument()
  })

  it('sprite: shows the name of the stored sprite and flags a missing one', () => {
    setup(cmd('c', 'changeSprite', { asset: 'objects/chest' }))
    expect(within(field('Sprite')).getByRole('button', { name: /Chest/ })).toBeInTheDocument()
  })

  it('sprite: a missing asset is marked as such', () => {
    setup(cmd('c', 'changeSprite', { asset: 'objects/gone' }))
    expect(within(field('Sprite')).getByRole('button', { name: /Missing: objects\/gone/ })).toBeInTheDocument()
  })

  it('facing: four buttons, the current one is checked', () => {
    const { onPatch } = setup(cmd('f', 'setFacing', { target: 'self', facing: 'down' }))
    expect(screen.getByRole('radio', { name: 'Down' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Left' }))
    expect(onPatch).toHaveBeenCalledWith({ facing: 'left' })
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('map: picks by name and stores the id', () => {
    const { onPatch } = setup(cmd('w', 'warp', { map: '' }))
    fireEvent.click(within(field('Map')).getByRole('button', { name: /Choose map/ }))
    fireEvent.click(screen.getByRole('option', { name: /Cave/ }))
    expect(onPatch).toHaveBeenCalledWith({ map: 'cave' })
  })

  it('map: an unknown map id is flagged', () => {
    setup(cmd('w', 'warp', { map: 'atlantis' }))
    expect(within(field('Map')).getByRole('button', { name: /Missing: atlantis/ })).toBeInTheDocument()
  })

  it('switch: picks by name', () => {
    const { onPatch } = setup(cmd('s', 'setSwitch', { id: '' }))
    fireEvent.click(within(field('Switch')).getByRole('button', { name: /Choose switch/ }))
    expect(screen.getByRole('option', { name: /Door open/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Door open/ }))
    expect(onPatch).toHaveBeenCalledWith({ id: 'door' })
  })

  it('switch: creates a new one inline and selects it', () => {
    const { onPatch, env } = setup(cmd('s', 'setSwitch', { id: '' }))
    fireEvent.click(within(field('Switch')).getByRole('button', { name: /Choose switch/ }))
    fireEvent.click(screen.getByRole('button', { name: /New switch/ }))
    const name = screen.getByRole('textbox', { name: 'New switch name' })
    fireEvent.change(name, { target: { value: 'Rain started' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(env.addSwitch).toHaveBeenCalledWith('Rain started')
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith({ id: 'sw_rain_started' })
  })

  it('switch: prefills the new name from the search text', () => {
    const { env } = setup(cmd('s', 'setSwitch', { id: '' }))
    fireEvent.click(within(field('Switch')).getByRole('button', { name: /Choose switch/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'Boss beaten' } })
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /New switch/ }))
    expect(screen.getByRole('textbox', { name: 'New switch name' })).toHaveValue('Boss beaten')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(env.addSwitch).toHaveBeenCalledWith('Boss beaten')
  })

  it('switch: a deleted switch is shown as missing', () => {
    setup(cmd('s', 'setSwitch', { id: 'ghost' }))
    const button = within(field('Switch')).getByRole('button', { name: /Missing: ghost/ })
    expect(button).toHaveAttribute('title', 'Switch "ghost" does not exist')
  })

  it('variable: picks and creates', () => {
    const { onPatch, env } = setup(cmd('v', 'setVariable', { id: '' }))
    fireEvent.click(within(field('Variable')).getByRole('button', { name: /Choose variable/ }))
    fireEvent.click(screen.getByRole('option', { name: /Badges earned/ }))
    expect(onPatch).toHaveBeenCalledWith({ id: 'badges' })
    fireEvent.click(within(field('Variable')).getByRole('button', { name: /Choose variable/ }))
    fireEvent.click(screen.getByRole('button', { name: /New variable/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New variable name' }), { target: { value: 'Coins' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(env.addVariable).toHaveBeenCalledWith('Coins')
    expect(onPatch).toHaveBeenLastCalledWith({ id: 'var_coins' })
  })

  it('stage: picks, creates, and resets the dependent value when the stage changes', () => {
    const { onPatch, env } = setup(cmd('t', 'setStage', { id: 'cat', mode: 'set', value: 'found' }))
    fireEvent.click(within(field('Stage')).getByRole('button', { name: /Lost cat/ }))
    fireEvent.click(screen.getByRole('option', { name: /Lost cat/ }))
    expect(onPatch).toHaveBeenLastCalledWith({ id: 'cat' }) // same stage: the value stays
    fireEvent.click(within(field('Stage')).getByRole('button', { name: /Lost cat/ }))
    fireEvent.click(screen.getByRole('button', { name: /New stage/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New stage name' }), { target: { value: 'Gym' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(env.addStage).toHaveBeenCalledWith('Gym')
    // the old value belonged to the old stage, so it is cleared with the stage
    expect(onPatch).toHaveBeenLastCalledWith({ id: 'stage_gym', value: '' })
  })

  it('stage value: lists the values of the chosen stage, in order', () => {
    const { onPatch } = setup(cmd('t', 'setStage', { id: 'cat', mode: 'set', value: '' }))
    fireEvent.click(within(field('Value')).getByRole('button', { name: /Choose value/ }))
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Not started'), expect.stringContaining('Found'), expect.stringContaining('Done')])
    fireEvent.click(screen.getByRole('option', { name: /Found/ }))
    expect(onPatch).toHaveBeenCalledWith({ value: 'found' })
  })

  it('stage value: marks a value the stage no longer has, and waits for a stage', () => {
    setup(cmd('t', 'setStage', { id: 'cat', mode: 'set', value: 'ghost' }))
    expect(within(field('Value')).getByRole('button', { name: /Missing: ghost/ })).toHaveAttribute('title', 'Stage "Lost cat" has no value "ghost"')
  })

  it('stage value is hidden while advancing', () => {
    setup(cmd('t', 'setStage', { id: 'cat', mode: 'advance', value: '' }))
    expect(field('Value')).toBeNull()
  })

  it('branchStage: adds values one by one or all at once, and removes them', () => {
    const { onPatch } = setup(cmd('b', 'branchStage', { id: 'cat', cases: ['found'] }))
    const cases = screen.getByTestId('stage-cases')
    expect(within(cases).getByText('Found')).toBeInTheDocument()
    fireEvent.click(within(cases).getByRole('button', { name: 'Remove Found' }))
    expect(onPatch).toHaveBeenLastCalledWith({ cases: [] })
    fireEvent.click(within(cases).getByRole('button', { name: 'Add all' }))
    expect(onPatch).toHaveBeenLastCalledWith({ cases: ['found', 'none', 'done'] })
    fireEvent.click(within(cases).getByRole('button', { name: /Choose value/ }))
    fireEvent.click(screen.getByRole('option', { name: /Done/ }))
    expect(onPatch).toHaveBeenLastCalledWith({ cases: ['found', 'done'] })
  })

  it('branchStage: asks for a stage first', () => {
    setup(cmd('b', 'branchStage', { id: '', cases: [] }))
    expect(screen.getByText('Choose a stage first.')).toBeInTheDocument()
  })

  it('creation does nothing when the database is not loaded (addSwitch returns "")', () => {
    const env = makeEnv({ addSwitch: vi.fn(() => '') })
    const { onPatch } = setup(cmd('s', 'setSwitch', { id: '' }), env)
    fireEvent.click(within(field('Switch')).getByRole('button', { name: /Choose switch/ }))
    fireEvent.click(screen.getByRole('button', { name: /New switch/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New switch name' }), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('target: this event, player and other entities by name (never the owner twice)', () => {
    const { onPatch } = setup(cmd('f', 'setFacing', { target: 'self', facing: 'down' }))
    fireEvent.click(within(field('Target')).getByRole('button', { name: /This event/ }))
    expect(screen.getByRole('option', { name: /This event/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Player/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Guard/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Old man/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Guard/ }))
    expect(onPatch).toHaveBeenCalledWith({ target: { entity: 'e2' } })
    fireEvent.click(within(field('Target')).getByRole('button'))
    fireEvent.click(screen.getByRole('option', { name: /Player/ }))
    expect(onPatch).toHaveBeenLastCalledWith({ target: 'player' })
  })

  it('target: shows entity names and flags removed entities', () => {
    setup(cmd('f', 'setFacing', { target: { entity: 'e2' } }))
    expect(within(field('Target')).getByRole('button', { name: /Guard/ })).toBeInTheDocument()
  })

  it('target: a removed entity is flagged', () => {
    setup(cmd('f', 'setFacing', { target: { entity: 'gone' } }))
    expect(within(field('Target')).getByRole('button', { name: /Missing: gone/ })).toBeInTheDocument()
  })

  it('position: column and row fields with a hint', () => {
    const { onPatch } = setup(cmd('w', 'warp', { map: 'town', x: 1, y: 2 }))
    expect(screen.getByText('Destination tile (column, row).')).toBeInTheDocument()
    const col = screen.getByRole('spinbutton', { name: 'Tile column' })
    const row = screen.getByRole('spinbutton', { name: 'Tile row' })
    expect(col).toHaveValue(1)
    expect(row).toHaveValue(2)
    fireEvent.change(col, { target: { value: '7' } })
    fireEvent.blur(col)
    expect(onPatch).toHaveBeenCalledWith({ x: 7 })
    fireEvent.change(row, { target: { value: '9.4' } })
    fireEvent.blur(row)
    expect(onPatch).toHaveBeenLastCalledWith({ y: 9 })
  })

  it('sound and item: text with sensible placeholders', () => {
    const sound = setup(cmd('p', 'playSound', { sound: '' }))
    const s = within(field('Sound')).getByRole('textbox')
    expect(s).toHaveAttribute('placeholder', expect.stringContaining('door_open'))
    fireEvent.change(s, { target: { value: 'ding' } })
    fireEvent.blur(s)
    expect(sound.onPatch).toHaveBeenCalledWith({ sound: 'ding' })
  })

  it('item: single value', () => {
    const { onPatch } = setup(cmd('g', 'giveItem', { item: '', qty: 1 }))
    const i = within(field('Item')).getByRole('textbox')
    expect(i).toHaveAttribute('placeholder', expect.stringContaining('potion'))
    fireEvent.change(i, { target: { value: 'ether' } })
    fireEvent.blur(i)
    expect(onPatch).toHaveBeenCalledWith({ item: 'ether' })
  })

  it('item (multiple): add and remove list entries', () => {
    const { onPatch } = setup(cmd('o', 'openShop', { items: ['potion'] }))
    const input = screen.getByRole('textbox', { name: 'Items for sale: add' })
    fireEvent.change(input, { target: { value: 'ether' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPatch).toHaveBeenCalledWith({ items: ['potion', 'ether'] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove potion' }))
    expect(onPatch).toHaveBeenLastCalledWith({ items: [] })
    // duplicates and blanks are ignored
    fireEvent.change(input, { target: { value: 'potion' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPatch).toHaveBeenCalledTimes(2)
  })

  it('route: embeds the route editor', () => {
    const { onPatch } = setup(cmd('m', 'moveRoute', { target: 'self', steps: [{ type: 'up' }], wait: true }))
    expect(screen.getByTestId('route-editor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add step: Move left' }))
    expect(onPatch).toHaveBeenCalledWith({ steps: [{ type: 'up' }, { type: 'left' }] })
  })

  it('choices: embeds the choices editor; removing an option just patches the list (its wire goes with it)', () => {
    const c = cmd('q', 'showChoices', {}, { opt1: [cmd('x', 'wait')], opt2: [] })
    const { onPatch } = setup(c)
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }))
    expect(onPatch).toHaveBeenCalledTimes(1) // no confirmation: removing an option deletes no nodes
    expect(onPatch.mock.calls[0][0]).toEqual({ options: [{ id: 'opt2', label: 'No' }] })
  })

  it('conditions: embeds the conditions builder', () => {
    const c = cmd('i', 'conditional', { conditions: [{ kind: 'switch', id: 'met', value: true }] })
    const { onPatch } = setup(c)
    fireEvent.change(screen.getByLabelText('Condition 1 value'), { target: { value: 'off' } })
    expect(onPatch).toHaveBeenCalledWith({ conditions: [{ kind: 'switch', id: 'met', value: false }] })
  })

  it('marks required fields and shows help text', () => {
    setup(cmd('t', 'showText'))
    expect(within(field('Text')).getByTitle('Required')).toBeInTheDocument()
    setup(cmd('s', 'setSwitch', { id: 'met' }))
    expect(screen.getByText('On when checked.')).toBeInTheDocument()
  })

  it('commands without parameters and unknown commands say so', () => {
    const { unmount } = renderWithEnv(<ParamForm command={cmd('l', 'loop')} onPatch={() => {}} />)
    expect(screen.getByText('This command has no parameters.')).toBeInTheDocument()
    unmount()
    renderWithEnv(<ParamForm command={{ id: 'u', type: 'mystery', params: {} }} onPatch={() => {}} />)
    expect(screen.getByText(/Unknown command type “mystery”/)).toBeInTheDocument()
  })
})
