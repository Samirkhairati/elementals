import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { EventState } from '../../../../../shared/engine/types'
import { EventEditor } from './EventEditor'
import { commandNodes, getNode } from '../../../../../shared/engine/graph'
import { cmd, makeEnv, state, renderWithEnv, sequentialIds } from './eventTestUtils'
import type { EventEnv } from './eventEnv'

const ids = sequentialIds('n')
beforeEach(() => ids.start())
afterEach(() => ids.stop())

function Harness({ initial, onChange }: { initial: EventState[]; onChange?: (states: EventState[]) => void }) {
  const [states, setStates] = useState(initial)
  return (
    <EventEditor
      states={states}
      onChange={(next) => {
        onChange?.(next)
        setStates(next)
      }}
    />
  )
}

function setup(initial: EventState[], env: EventEnv = makeEnv()) {
  const onChange = vi.fn()
  renderWithEnv(<Harness initial={initial} onChange={onChange} />, env)
  const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][0] as EventState[]
  return { onChange, last, env }
}

const tab = (name: RegExp | string) => screen.getByRole('tab', { name })

describe('EventEditor: state tabs', () => {
  it('lists states with trigger and node count and marks the start state', () => {
    setup([
      state('p1', [cmd('a', 'wait')], { name: 'Intro' }),
      state('p2', [], { name: 'Later', trigger: 'playerTouch', conditions: [{ kind: 'switch', id: 'met', value: true }] }),
    ])
    const first = tab(/Intro/)
    expect(within(first).getByText('Action button')).toBeInTheDocument()
    expect(within(first).getByText('1 node')).toBeInTheDocument()
    expect(first.querySelector('[data-start-dot]')).toBeTruthy()
    const second = tab(/Later/)
    expect(within(second).getByText('Player touch')).toBeInTheDocument()
    expect(within(second).getByText('0 nodes')).toBeInTheDocument()
    expect(within(second).getByText('1 cond')).toBeInTheDocument()
    expect(second.querySelector('[data-start-dot]')).toBeFalsy()
  })

  it('selects a state and shows its nodes', () => {
    setup([state('p1', [cmd('a', 'showText', { text: 'first state text' })], { name: 'One' }), state('p2', [cmd('b', 'showText', { text: 'second state text' })], { name: 'Two' })])
    expect(screen.getByText('first state text')).toBeInTheDocument()
    fireEvent.click(tab(/Two/))
    expect(screen.getByText('second state text')).toBeInTheDocument()
    expect(screen.queryByText('first state text')).not.toBeInTheDocument()
    expect(tab(/Two/)).toHaveAttribute('aria-selected', 'true')
  })

  it('adds a state (one change) and selects it', () => {
    const { onChange, last } = setup([state('p1')])
    fireEvent.click(screen.getByRole('button', { name: /Add state/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()).toHaveLength(2)
    expect(last()[1].name).toBe('State 2')
    expect(tab(/State 2/)).toHaveAttribute('aria-selected', 'true')
  })

  it('duplicates the selected state with new ids', () => {
    const { onChange, last } = setup([state('p1', [cmd('a', 'wait')], { name: 'One' })])
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate state' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.name)).toEqual(['One', 'One copy'])
    expect(last()[1].id).not.toBe('p1')
    expect(commandNodes(last()[1].graph)[0].id).not.toBe('a')
    expect(tab(/One copy/)).toHaveAttribute('aria-selected', 'true')
  })

  it('deletes an empty state at once and selects a neighbour', () => {
    const { onChange, last } = setup([state('p1', [], { name: 'One' }), state('p2', [], { name: 'Two' })])
    fireEvent.click(tab(/Two/))
    fireEvent.click(screen.getByRole('button', { name: 'Delete state' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.id)).toEqual(['p1'])
    expect(tab(/One/)).toHaveAttribute('aria-selected', 'true')
  })

  it('asks before deleting a state that has nodes', () => {
    const { onChange, last } = setup([state('p1', [cmd('a', 'wait'), cmd('b', 'wait')], { name: 'One' }), state('p2', [], { name: 'Two' })])
    fireEvent.click(screen.getByRole('button', { name: 'Delete state' }))
    expect(onChange).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('2 nodes')
    fireEvent.click(within(alert).getByRole('button', { name: 'Cancel' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete state' }))
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete state' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.id)).toEqual(['p2'])
  })

  it('cannot delete the last state', () => {
    setup([state('p1')])
    expect(screen.getByRole('button', { name: 'Delete state' })).toBeDisabled()
  })

  it('reorders states', () => {
    const { onChange, last } = setup([state('p1', [], { name: 'One' }), state('p2', [], { name: 'Two' })])
    expect(screen.getByRole('button', { name: /Move state up/ })).toBeDisabled()
    fireEvent.click(tab(/Two/))
    fireEvent.click(screen.getByRole('button', { name: /Move state up/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last().map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(screen.getByRole('button', { name: /Move state down/ })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Move state down/ }))
    expect(last().map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('renames a state by double-clicking its tab', () => {
    const { onChange, last } = setup([state('p1', [], { name: 'One' })])
    fireEvent.doubleClick(tab(/One/))
    const input = screen.getByRole('textbox', { name: 'Rename state 1' })
    fireEvent.change(input, { target: { value: 'Opening' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()[0].name).toBe('Opening')
    expect(screen.queryByRole('textbox', { name: 'Rename state 1' })).not.toBeInTheDocument()
    expect(tab(/Opening/)).toBeInTheDocument()
  })

  it('shows problem counts on a state tab', () => {
    setup([state('p1', [cmd('a', 'setSwitch', { id: 'ghost' })], { name: 'Broken' })])
    expect(within(tab(/Broken/)).getByTitle('1 error')).toBeInTheDocument()
  })

  it('moves the start dot when conditions change', () => {
    setup([state('p1', [], { name: 'One' }), state('p2', [], { name: 'Two' })])
    expect(tab(/Two/).querySelector('[data-start-dot]')).toBeTruthy()
    fireEvent.click(tab(/Two/))
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Switch/ }))
    expect(tab(/One/).querySelector('[data-start-dot]')).toBeTruthy()
    expect(tab(/Two/).querySelector('[data-start-dot]')).toBeFalsy()
  })
})

describe('EventEditor: state header', () => {
  it('changes the trigger and explains it in plain language', () => {
    const { onChange, last } = setup([state('p1')])
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

  it('edits the state name on blur', () => {
    const { last } = setup([state('p1', [], { name: '' })])
    const name = screen.getByRole('textbox', { name: 'State name' })
    fireEvent.change(name, { target: { value: 'After quest' } })
    fireEvent.blur(name)
    expect(last()[0].name).toBe('After quest')
  })

  it('toggles "face player" and the solid override', () => {
    const { onChange, last } = setup([state('p1')])
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
    const { last } = setup([state('p1')])
    expect(screen.getByText(/this state is always eligible/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Self switch/ }))
    expect(last()[0].conditions).toEqual([{ kind: 'selfSwitch', key: 'A', value: true }])
    expect(screen.getByText(/If a later state also qualifies, the later state wins/)).toBeInTheDocument()
  })

  it('appearance override: each override can be switched on, edited and off', () => {
    const { onChange, last } = setup([state('p1')])
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
    const { last } = setup([state('p1', [], { appearance: { asset: 'characters/hero', animation: '' } })])
    fireEvent.click(screen.getByRole('button', { name: /Appearance override/ }))
    const animation = screen.getByRole('textbox', { name: 'Animation' })
    fireEvent.change(animation, { target: { value: 'wave' } })
    fireEvent.blur(animation)
    expect(last()[0].appearance.animation).toBe('wave')
  })

  it('collapses the state settings to give room to the canvas', () => {
    setup([state('p1')])
    expect(screen.getByTestId('state-settings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /State 1/ }))
    expect(screen.queryByTestId('state-settings')).not.toBeInTheDocument()
  })
})

const pickNode = (id: string) => fireEvent.click(screen.getByTestId(`node-${id}`))

describe('EventEditor: canvas and inspector', () => {
  it('draws the nodes of the selected state and shows the form of the selected node; one change per edit', () => {
    const { onChange, last } = setup([state('p1', [cmd('a', 'showText', { text: 'Hello' }), cmd('b', 'wait', { ms: 100 })])])
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('no-selection')).toBeInTheDocument()
    pickNode('a')
    const inspector = screen.getByTestId('node-inspector')
    expect(within(inspector).getByRole('heading', { name: 'Show Text' })).toBeInTheDocument()
    const text = within(inspector).getByRole('textbox', { name: /Text/ })
    fireEvent.change(text, { target: { value: 'Goodbye' } })
    fireEvent.blur(text)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(getNode(last()[0].graph, 'a')!.params.text).toBe('Goodbye')
    expect(within(screen.getByTestId('node-a')).getByText('Goodbye')).toBeInTheDocument()
  })

  it('switching states shows that state’s graph', () => {
    setup([state('p1', [cmd('a', 'wait')], { name: 'One' }), state('p2', [cmd('z', 'comment', { text: 'two' })], { name: 'Two' })])
    expect(screen.getByTestId('node-a')).toBeInTheDocument()
    expect(screen.queryByTestId('node-z')).not.toBeInTheDocument()
    fireEvent.click(tab(/Two/))
    expect(screen.getByTestId('node-z')).toBeInTheDocument()
    expect(screen.queryByTestId('node-a')).not.toBeInTheDocument()
  })

  it('explains the start and end nodes in the inspector', () => {
    setup([state('p1', [cmd('x', 'exitEvent')])])
    fireEvent.click(document.querySelector('[data-node-type="start"]') as HTMLElement)
    expect(within(screen.getByTestId('node-inspector')).getByRole('heading', { name: 'Start' })).toBeInTheDocument()
    expect(within(screen.getByTestId('node-inspector')).queryByTestId('param-form')).toBeNull()
    fireEvent.click(document.querySelector('[data-node-type="end"]') as HTMLElement)
    expect(within(screen.getByTestId('node-inspector')).getByRole('heading', { name: 'End' })).toBeInTheDocument()
  })

  it('shows a planned note for planned commands', () => {
    setup([state('p1', [cmd('a', 'givePokemon', { species: 'pidgey' })])])
    pickNode('a')
    expect(screen.getByText(/the game skips it until that system exists/)).toBeInTheDocument()
  })

  it('shows validation issues of the selected node above its form', () => {
    setup([state('p1', [cmd('a', 'setSwitch', { id: 'ghost' })])])
    pickNode('a')
    expect(within(screen.getByTestId('node-issues')).getByText('Switch: switch "ghost" does not exist')).toBeInTheDocument()
  })

  it('reflects names created through the pickers (switch created from the form)', () => {
    const env = makeEnv()
    const { last } = setup([state('p1', [cmd('a', 'setSwitch', { id: '' })])], env)
    pickNode('a')
    fireEvent.click(screen.getByRole('button', { name: /Choose switch/ }))
    fireEvent.click(screen.getByRole('button', { name: /New switch/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New switch name' }), { target: { value: 'Gate open' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(getNode(last()[0].graph, 'a')!.params.id).toBe('sw_gate_open')
  })

  it('adding a choice option adds its port (one change)', () => {
    const { onChange, last } = setup([state('p1', [cmd('q', 'showChoices', {}, { opt1: [cmd('x', 'wait')], opt2: [] })])])
    pickNode('q')
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const q = getNode(last()[0].graph, 'q')!
    expect((q.params.options as { id: string }[]).map((o) => o.id)).toEqual(['opt1', 'opt2', 'opt3'])
    expect(screen.getByTestId('node-q').querySelectorAll('[data-port]')).toHaveLength(3)
  })

  it('removing a choice option unwires its path but keeps the nodes', () => {
    const { last } = setup([state('p1', [cmd('q', 'showChoices', {}, { opt1: [cmd('x', 'wait')], opt2: [] })])])
    pickNode('q')
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }))
    const graph = last()[0].graph
    const q = getNode(graph, 'q')!
    expect((q.params.options as { id: string }[]).map((o) => o.id)).toEqual(['opt2'])
    expect(q.out.opt1).toBeUndefined() // the wire went with the option
    expect(getNode(graph, 'x')).toBeDefined() // the node did not
  })

  it('a node cut out of the canvas clears the inspector', () => {
    setup([state('p1', [cmd('a', 'showText', { text: 'Hello' })])])
    pickNode('a')
    expect(screen.getByTestId('node-inspector')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove and reconnect' }))
    expect(screen.getByTestId('no-selection')).toBeInTheDocument()
  })
})

describe('EventEditor: templates', () => {
  it('shows the template picker while the graph is empty', () => {
    setup([state('p1')])
    expect(screen.getByTestId('template-start')).toBeInTheDocument()
  })

  it('hides the template picker once the graph has nodes', () => {
    setup([state('p1', [cmd('a', 'wait')])])
    expect(screen.queryByTestId('template-start')).not.toBeInTheDocument()
  })

  it('yes/no from the empty state is one change with both paths wired', () => {
    const { onChange, last } = setup([state('p1')])
    fireEvent.click(screen.getByRole('button', { name: 'Yes / No question' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(commandNodes(last()[0].graph).map((n) => n.type)).toEqual(['showText', 'showChoices', 'showText', 'showText'])
    const choices = commandNodes(last()[0].graph).find((n) => n.type === 'showChoices')!
    expect(Object.keys(choices.out)).toEqual(['opt1', 'opt2'])
    expect(screen.queryByTestId('template-start')).not.toBeInTheDocument()
  })

  it('"Open chest" adds the opened state and selects the first new node', () => {
    const { onChange, last } = setup([state('p1')])
    fireEvent.click(screen.getByRole('button', { name: 'Open chest' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(last()).toHaveLength(2)
    expect(last()[1].conditions[0]).toEqual({ kind: 'selfSwitch', key: 'A', value: true })
    expect(screen.getByTestId('node-inspector')).toBeInTheDocument()
  })

  it('"Warp" inserts one command', () => {
    const { last } = setup([state('p1')])
    fireEvent.click(screen.getByRole('button', { name: 'Warp' }))
    expect(commandNodes(last()[0].graph).map((n) => n.type)).toEqual(['warp'])
  })
})

describe('EventEditor: problems', () => {
  const broken = () => [state('p1', [cmd('a', 'setSwitch', { id: 'ghost' }), cmd('b', 'warp', { map: '' })], { name: 'Broken' }), state('p2', [], { name: 'Fine' })]

  it('lists problems with counts and jumps to the node', () => {
    setup(broken())
    const problemsTab = screen.getByRole('tab', { name: /Problems/ })
    expect(problemsTab).toHaveTextContent('1')
    fireEvent.click(problemsTab)
    const list = screen.getByTestId('problems-list')
    expect(within(list).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(list).getByText(/switch "ghost" does not exist/))
    expect(screen.getByRole('tab', { name: 'Node' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByTestId('node-inspector')).getByRole('heading', { name: 'Set Switch' })).toBeInTheDocument()
  })

  it('shows a calm message when everything is fine', () => {
    setup([state('p1', [cmd('a', 'wait')])])
    fireEvent.click(screen.getByRole('tab', { name: /Problems/ }))
    expect(screen.getByTestId('no-problems')).toBeInTheDocument()
  })

  it('jumping to a problem on another state switches states', () => {
    setup([state('p1', [], { name: 'Fine' }), state('p2', [cmd('a', 'setSwitch', { id: 'ghost' })], { name: 'Broken' })])
    fireEvent.click(screen.getByRole('tab', { name: /Problems/ }))
    fireEvent.click(screen.getByText(/switch "ghost" does not exist/))
    expect(tab(/Broken/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('node-a')).toBeInTheDocument()
  })

  it('does not report a node nothing leads to (floating nodes are allowed)', () => {
    const s = state('p1', [cmd('a', 'wait')])
    s.graph = { ...s.graph, nodes: [...s.graph.nodes, { id: 'lost', type: 'wait', params: { ms: 1 }, out: {}, x: 0, y: 300 }] }
    setup([s])
    fireEvent.click(screen.getByRole('tab', { name: /Problems/ }))
    expect(screen.queryByText(/Nothing leads to this node/)).not.toBeInTheDocument()
  })
})

describe('EventEditor: undo/redo buttons', () => {
  it('call the editor-wide undo/redo and respect availability', () => {
    const undo = vi.fn()
    const redo = vi.fn()
    setup([state('p1')], makeEnv({ undo, redo, canUndo: true, canRedo: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('are disabled without editor history', () => {
    setup([state('p1')])
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})

describe('EventEditor: robustness', () => {
  it('shows a fresh empty state when the event has no states', () => {
    setup([])
    expect(screen.getAllByRole('tab', { name: /State 1/ }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('template-start')).toBeInTheDocument()
  })

  it('consecutive edits in one tick compose instead of overwriting each other', () => {
    const { last } = setup([state('p1', [], { name: 'One' })])
    const solid = screen.getByRole('combobox', { name: 'Solid' })
    const trigger = screen.getByRole('combobox', { name: 'Trigger' })
    fireEvent.change(solid, { target: { value: 'solid' } })
    fireEvent.change(trigger, { target: { value: 'parallel' } })
    expect(last()[0]).toMatchObject({ solid: true, trigger: 'parallel' })
  })
})
