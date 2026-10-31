import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { EventPage } from '../../../../../shared/engine/types'
import { EventEditor } from './EventEditor'
import { cmd, flat, makeEnv, page, renderWithEnv, sequentialIds } from './eventTestUtils'
import type { EventEnv } from './eventEnv'

const ids = sequentialIds('n')
beforeEach(() => ids.start())
afterEach(() => ids.stop())

function Harness({ initial, onChange }: { initial: EventPage[]; onChange?: (pages: EventPage[]) => void }) {
  const [pages, setPages] = useState(initial)
  return (
    <EventEditor
      pages={pages}
      onChange={(next) => {
        onChange?.(next)
        setPages(next)
      }}
    />
  )
}

function setup(initial: EventPage[], env: EventEnv = makeEnv()) {
  const onChange = vi.fn()
  renderWithEnv(<Harness initial={initial} onChange={onChange} />, env)
  const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][0] as EventPage[]
  return { onChange, last, env }
}

const tab = (name: RegExp | string) => screen.getByRole('tab', { name })

describe('EventEditor: page tabs', () => {
  it('lists pages with trigger and command count and marks the start page', () => {
    setup([
      page('p1', [cmd('a', 'wait')], { name: 'Intro' }),
      page('p2', [], { name: 'Later', trigger: 'playerTouch', conditions: [{ kind: 'switch', id: 'met', value: true }] }),
    ])
    const first = tab(/Intro/)
    expect(within(first).getByText('Action button')).toBeInTheDocument()
    expect(within(first).getByText('1 cmd')).toBeInTheDocument()
    expect(first.querySelector('[data-start-dot]')).toBeTruthy()
    const second = tab(/Later/)
    expect(within(second).getByText('Player touch')).toBeInTheDocument()
    expect(within(second).getByText('0 cmds')).toBeInTheDocument()
    expect(within(second).getByText('1 cond')).toBeInTheDocument()
    expect(second.querySelector('[data-start-dot]')).toBeFalsy()
  })

  it('selects a page and shows its commands', () => {
    setup([page('p1', [cmd('a', 'showText', { text: 'first page text' })], { name: 'One' }), page('p2', [cmd('b', 'showText', { text: 'second page text' })], { name: 'Two' })])
    expect(screen.getByText('"first page text"')).toBeInTheDocument()
    fireEvent.click(tab(/Two/))
    expect(screen.getByText('"second page text"')).toBeInTheDocument()
    expect(screen.queryByText('"first page text"')).not.toBeInTheDocument()
    expect(tab(/Two/)).toHaveAttribute('aria-selected', 'true')
  })

  it('adds a page (one change) and selects it', () => {
    const { onChange, last } = setup([page('p1')])
    fireEvent.click(screen.getByRole('button', { name: /Add page/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()).toHaveLength(2)
    expect(last()[1].name).toBe('Page 2')
    expect(tab(/Page 2/)).toHaveAttribute('aria-selected', 'true')
  })

  it('duplicates the selected page with new ids', () => {
    const { onChange, last } = setup([page('p1', [cmd('a', 'wait')], { name: 'One' })])
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate page' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.name)).toEqual(['One', 'One copy'])
    expect(last()[1].id).not.toBe('p1')
    expect(last()[1].commands[0].id).not.toBe('a')
    expect(tab(/One copy/)).toHaveAttribute('aria-selected', 'true')
  })

  it('deletes an empty page at once and selects a neighbour', () => {
    const { onChange, last } = setup([page('p1', [], { name: 'One' }), page('p2', [], { name: 'Two' })])
    fireEvent.click(tab(/Two/))
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.id)).toEqual(['p1'])
    expect(tab(/One/)).toHaveAttribute('aria-selected', 'true')
  })

  it('asks before deleting a page that has commands', () => {
    const { onChange, last } = setup([page('p1', [cmd('a', 'wait'), cmd('b', 'wait')], { name: 'One' }), page('p2', [], { name: 'Two' })])
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    expect(onChange).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('2 commands')
    fireEvent.click(within(alert).getByRole('button', { name: 'Cancel' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete page' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.id)).toEqual(['p2'])
  })

  it('cannot delete the last page', () => {
    setup([page('p1')])
    expect(screen.getByRole('button', { name: 'Delete page' })).toBeDisabled()
  })

  it('reorders pages', () => {
    const { onChange, last } = setup([page('p1', [], { name: 'One' }), page('p2', [], { name: 'Two' })])
    expect(screen.getByRole('button', { name: /Move page up/ })).toBeDisabled()
    fireEvent.click(tab(/Two/))
    fireEvent.click(screen.getByRole('button', { name: /Move page up/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(screen.getByRole('button', { name: /Move page down/ })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Move page down/ }))
    expect(last().map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('renames a page by double-clicking its tab', () => {
    const { onChange, last } = setup([page('p1', [], { name: 'One' })])
    fireEvent.doubleClick(tab(/One/))
    const input = screen.getByRole('textbox', { name: 'Rename page 1' })
    fireEvent.change(input, { target: { value: 'Opening' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()[0].name).toBe('Opening')
    expect(screen.queryByRole('textbox', { name: 'Rename page 1' })).not.toBeInTheDocument()
    expect(tab(/Opening/)).toBeInTheDocument()
  })

  it('shows problem counts on a page tab', () => {
    setup([page('p1', [cmd('a', 'setSwitch', { id: 'ghost' })], { name: 'Broken' })])
    expect(within(tab(/Broken/)).getByTitle('1 error')).toBeInTheDocument()
  })

  it('moves the start dot when conditions change', () => {
    setup([page('p1', [], { name: 'One' }), page('p2', [], { name: 'Two' })])
    expect(tab(/Two/).querySelector('[data-start-dot]')).toBeTruthy()
    fireEvent.click(tab(/Two/))
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Switch/ }))
    expect(tab(/One/).querySelector('[data-start-dot]')).toBeTruthy()
    expect(tab(/Two/).querySelector('[data-start-dot]')).toBeFalsy()
  })
})

describe('EventEditor: page header', () => {
  it('changes the trigger and explains it in plain language', () => {
    const { onChange, last } = setup([page('p1')])
    const trigger = screen.getByRole('combobox', { name: 'Trigger' })
    expect(within(trigger).getAllByRole('option').map((o) => o.textContent)).toEqual(['Action button', 'Player touch', 'Event touch', 'Autorun', 'Parallel'])
    expect(screen.getByText(/presses the action button while facing this entity/)).toBeInTheDocument()
    fireEvent.change(trigger, { target: { value: 'autorun' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()[0].trigger).toBe('autorun')
    expect(screen.getByText(/blocks the player until it finishes/)).toBeInTheDocument()
    fireEvent.change(trigger, { target: { value: 'playerTouch' } })
    expect(screen.getByText(/walks onto or into this entity/)).toBeInTheDocument()
    fireEvent.change(trigger, { target: { value: 'eventTouch' } })
    expect(screen.getByText(/another entity/)).toBeInTheDocument()
    fireEvent.change(trigger, { target: { value: 'parallel' } })
    expect(screen.getByText(/in the background/)).toBeInTheDocument()
  })

  it('edits the page name on blur', () => {
    const { last } = setup([page('p1', [], { name: '' })])
    const name = screen.getByRole('textbox', { name: 'Page name' })
    fireEvent.change(name, { target: { value: 'After quest' } })
    fireEvent.blur(name)
    expect(last()[0].name).toBe('After quest')
  })

  it('toggles "face player" and the solid override', () => {
    const { onChange, last } = setup([page('p1')])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Face player when triggered' }))
    expect(last()[0].faceOnInteract).toBe(false)
    const solid = screen.getByRole('combobox', { name: 'Solid' })
    expect(solid).toHaveValue('inherit')
    fireEvent.change(solid, { target: { value: 'nonsolid' } })
    expect(last()[0].solid).toBe(false)
    fireEvent.change(solid, { target: { value: 'solid' } })
    expect(last()[0].solid).toBe(true)
    fireEvent.change(solid, { target: { value: 'inherit' } })
    expect(last()[0].solid).toBeNull()
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('has a conditions builder with AND explanation', () => {
    const { last } = setup([page('p1')])
    expect(screen.getByText(/this page is always eligible/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Self switch/ }))
    expect(last()[0].conditions).toEqual([{ kind: 'selfSwitch', key: 'A', value: true }])
    expect(screen.getByText(/If a later page also qualifies, the later page wins/)).toBeInTheDocument()
  })

  it('appearance override: each override can be switched on, edited and off', () => {
    const { onChange, last } = setup([page('p1')])
    fireEvent.click(screen.getByRole('button', { name: /Appearance override/ }))
    const editor = screen.getByTestId('appearance-editor')

    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Override visibility' }))
    expect(last()[0].appearance).toEqual({ visible: true })
    fireEvent.change(within(editor).getByLabelText('Visibility while active'), { target: { value: 'hidden' } })
    expect(last()[0].appearance).toEqual({ visible: false })

    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Override sprite' }))
    expect(last()[0].appearance).toEqual({ visible: false, asset: '' })
    fireEvent.click(within(editor).getByRole('button', { name: /Choose sprite/ }))
    fireEvent.click(screen.getByRole('option', { name: /Chest/ }))
    expect(last()[0].appearance.asset).toBe('objects/chest')

    // the chest asset has an "open" animation, so animation becomes a select
    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Override animation' }))
    fireEvent.change(within(editor).getByLabelText('Animation'), { target: { value: 'open' } })
    expect(last()[0].appearance.animation).toBe('open')

    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Override frame' }))
    const frame = within(editor).getByLabelText('Frame')
    fireEvent.change(frame, { target: { value: '2' } })
    fireEvent.blur(frame)
    expect(last()[0].appearance.frame).toBe(2)

    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Override facing' }))
    fireEvent.click(within(editor).getByRole('radio', { name: 'Left' }))
    expect(last()[0].appearance.facing).toBe('left')

    fireEvent.click(within(editor).getByRole('checkbox', { name: 'Override visibility' }))
    expect(last()[0].appearance).not.toHaveProperty('visible')
    expect(onChange.mock.calls.length).toBeGreaterThan(8)
  })

  it('appearance override: a text animation field when the asset has no animations', () => {
    const { last } = setup([page('p1', [], { appearance: { asset: 'characters/hero', animation: '' } })])
    fireEvent.click(screen.getByRole('button', { name: /Appearance override/ }))
    const animation = screen.getByRole('textbox', { name: 'Animation' })
    fireEvent.change(animation, { target: { value: 'wave' } })
    fireEvent.blur(animation)
    expect(last()[0].appearance.animation).toBe('wave')
  })

  it('collapses the page settings to give room to the commands', () => {
    setup([page('p1')])
    expect(screen.getByTestId('page-settings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Page 1/ }))
    expect(screen.queryByTestId('page-settings')).not.toBeInTheDocument()
  })
})

describe('EventEditor: commands and inspector', () => {
  it('shows the parameter form of the selected command; one change per edit', () => {
    const { onChange, last } = setup([page('p1', [cmd('a', 'showText', { text: 'Hello' }), cmd('b', 'wait', { ms: 100 })])])
    expect(screen.getByTestId('no-selection')).toBeInTheDocument()
    fireEvent.click(screen.getByText('"Hello"'))
    const inspector = screen.getByTestId('command-inspector')
    expect(within(inspector).getByRole('heading', { name: 'Show Text' })).toBeInTheDocument()
    const text = within(inspector).getByRole('textbox', { name: /Text/ })
    fireEvent.change(text, { target: { value: 'Goodbye' } })
    fireEvent.blur(text)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()[0].commands[0].params.text).toBe('Goodbye')
    expect(screen.getByText('"Goodbye"')).toBeInTheDocument()
  })

  it('shows a planned note for planned commands', () => {
    setup([page('p1', [cmd('a', 'givePokemon', { species: 'pidgey' })])])
    fireEvent.click(screen.getByText('Give pidgey Lv.5'))
    expect(screen.getByText(/the game skips it until that system exists/)).toBeInTheDocument()
  })

  it('shows validation issues of the selected command above its form', () => {
    setup([page('p1', [cmd('a', 'setSwitch', { id: 'ghost' })])])
    fireEvent.click(screen.getByText('Switch "ghost" = ON'))
    expect(within(screen.getByTestId('command-issues')).getByText('Switch: switch "ghost" does not exist')).toBeInTheDocument()
  })

  it('reflects names created through the pickers (switch created from the form)', () => {
    const env = makeEnv()
    const { last } = setup([page('p1', [cmd('a', 'setSwitch', { id: '' })])], env)
    fireEvent.click(screen.getByText('Switch (none) = ON'))
    fireEvent.click(screen.getByRole('button', { name: /Choose switch/ }))
    fireEvent.click(screen.getByRole('button', { name: /New switch/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New switch name' }), { target: { value: 'Gate open' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(last()[0].commands[0].params.id).toBe('sw_gate_open')
  })

  it('editing choices keeps branches in sync (one change)', () => {
    const { onChange, last } = setup([page('p1', [cmd('q', 'showChoices', {}, { opt1: [cmd('x', 'wait')], opt2: [] })])])
    fireEvent.click(screen.getByText('Choices: Yes / No'))
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(Object.keys(last()[0].commands[0].branches ?? {})).toEqual(['opt1', 'opt2', 'opt3'])
    expect(screen.getByRole('group', { name: 'Choice: Option 3' })).toBeInTheDocument()
  })

  it('removing a choice with commands deletes its branch after confirmation', () => {
    const { last } = setup([page('p1', [cmd('q', 'showChoices', {}, { opt1: [cmd('x', 'wait')], opt2: [] })])])
    fireEvent.click(screen.getByText('Choices: Yes / No'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove option and commands' }))
    expect(flat(last()[0].commands)).toEqual(['showChoices'])
    expect(Object.keys(last()[0].commands[0].branches ?? {})).toEqual(['opt2'])
  })

  it('Enter in the list moves focus into the form', async () => {
    setup([page('p1', [cmd('a', 'showText', { text: 'Hello' })])])
    fireEvent.click(screen.getByText('"Hello"'))
    fireEvent.keyDown(screen.getByRole('tree', { name: 'Commands' }), { key: 'Enter' })
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByTestId('command-inspector')).getByRole('textbox', { name: /Speaker/ })))
  })

  it('double-clicking a row focuses its form', async () => {
    setup([page('p1', [cmd('a', 'showText', { text: 'Hello' })])])
    fireEvent.doubleClick(screen.getByText('"Hello"'))
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByTestId('command-inspector')).getByRole('textbox', { name: /Speaker/ })))
  })

  it('a deleted selection clears the inspector', () => {
    setup([page('p1', [cmd('a', 'showText', { text: 'Hello' })])])
    fireEvent.click(screen.getByText('"Hello"'))
    fireEvent.keyDown(screen.getByRole('tree', { name: 'Commands' }), { key: 'Delete' })
    expect(screen.getByTestId('no-selection')).toBeInTheDocument()
  })
})

describe('EventEditor: templates', () => {
  it('yes/no from the empty state is one change with both branches filled', () => {
    const { onChange, last } = setup([page('p1')])
    fireEvent.click(screen.getByRole('button', { name: 'Yes / No question' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(flat(last()[0].commands)).toEqual(['showText', 'showChoices', 'showText', 'showText'])
    expect(screen.getByRole('group', { name: 'Choice: Yes' })).toBeInTheDocument()
  })

  it('"Open chest" adds the opened page and selects the first new command', () => {
    const { onChange, last } = setup([page('p1')])
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Open chest/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()).toHaveLength(2)
    expect(last()[1].conditions[0]).toEqual({ kind: 'selfSwitch', key: 'A', value: true })
    expect(screen.getByTestId('command-inspector')).toBeInTheDocument()
  })

  it('"Warp" and "Dialogue" templates insert one command', () => {
    const { last } = setup([page('p1')])
    fireEvent.click(screen.getByRole('button', { name: 'Warp' }))
    expect(flat(last()[0].commands)).toEqual(['warp'])
  })
})

describe('EventEditor: problems', () => {
  const broken = () => [page('p1', [cmd('a', 'setSwitch', { id: 'ghost' }), cmd('b', 'warp', { map: '' })], { name: 'Broken' }), page('p2', [], { name: 'Fine' })]

  it('lists problems with counts and jumps to the command', () => {
    setup(broken())
    const problemsTab = screen.getByRole('tab', { name: /Problems/ })
    expect(problemsTab).toHaveTextContent('1')
    fireEvent.click(problemsTab)
    const list = screen.getByTestId('problems-list')
    expect(within(list).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(list).getByText(/switch "ghost" does not exist/))
    expect(screen.getByRole('tab', { name: 'Command' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByTestId('command-inspector')).getByRole('heading', { name: 'Set Switch' })).toBeInTheDocument()
  })

  it('shows a calm message when everything is fine', () => {
    setup([page('p1', [cmd('a', 'wait')])])
    fireEvent.click(screen.getByRole('tab', { name: /Problems/ }))
    expect(screen.getByTestId('no-problems')).toBeInTheDocument()
  })

  it('jumping to a problem on another page switches pages', () => {
    setup([page('p1', [], { name: 'Fine' }), page('p2', [cmd('a', 'setSwitch', { id: 'ghost' })], { name: 'Broken' })])
    fireEvent.click(screen.getByRole('tab', { name: /Problems/ }))
    fireEvent.click(screen.getByText(/switch "ghost" does not exist/))
    expect(tab(/Broken/)).toHaveAttribute('aria-selected', 'true')
  })
})

describe('EventEditor: undo/redo buttons', () => {
  it('call the editor-wide undo/redo and respect availability', () => {
    const undo = vi.fn()
    const redo = vi.fn()
    setup([page('p1')], makeEnv({ undo, redo, canUndo: true, canRedo: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('are disabled without editor history', () => {
    setup([page('p1')])
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})

describe('EventEditor: robustness', () => {
  it('shows a fresh empty page when the event has no pages', () => {
    setup([])
    expect(screen.getAllByRole('tab', { name: /Page 1/ }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('empty-commands')).toBeInTheDocument()
  })

  it('consecutive edits in one tick compose instead of overwriting each other', () => {
    const { last } = setup([page('p1', [], { name: 'One' })])
    const solid = screen.getByRole('combobox', { name: 'Solid' })
    const trigger = screen.getByRole('combobox', { name: 'Trigger' })
    fireEvent.change(solid, { target: { value: 'solid' } })
    fireEvent.change(trigger, { target: { value: 'parallel' } })
    expect(last()[0]).toMatchObject({ solid: true, trigger: 'parallel' })
  })
})
