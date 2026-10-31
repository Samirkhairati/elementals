import React, { StrictMode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StageDef, SwitchDef, VariableDef } from '../../../../../shared/engine/types'
import { createCommand } from '../../../../../shared/engine/commands'
import { commandsToGraph } from '../../../../../shared/engine/graph'
import { createDefaultEventState } from '../../../../../shared/engine/components'
import type { UsageMap } from '@/lib/databaseUsage'
import { DatabasePanel } from './DatabasePanel'

const SWITCHES: SwitchDef[] = [
  { id: 'met', name: 'Met the guard' },
  { id: 'door', name: 'Door open' },
]
const VARIABLES: VariableDef[] = [{ id: 'badges', name: 'Badges earned', initial: 2 }]
const noop = () => {}
/** Stage props for tests that do not care about stages. */
const STAGE_PROPS = {
  stages: [] as StageDef[],
  addStage: () => '',
  renameStage: noop,
  removeStage: noop,
  addStageValue: () => '',
  renameStageValue: noop,
  removeStageValue: noop,
  moveStageValue: noop,
  setStageInitial: noop,
  setFolder: noop,
}

function usageMaps(): UsageMap[] {
  const a = createDefaultEventState('Talk')
  a.graph = commandsToGraph([createCommand('setSwitch', { id: 'met', value: true })])
  const b = createDefaultEventState('After')
  b.conditions = [{ kind: 'switch', id: 'met', value: true }]
  const c = createDefaultEventState('Gate')
  c.graph = commandsToGraph([createCommand('setVariable', { id: 'badges', op: 'add', operand: 'const', value: 1 })])
  return [
    { fileName: 'town.json', name: 'Town', entities: [{ id: 'e1', name: 'Guard', components: { Event: { states: [a, b] } } }] },
    { fileName: 'cave.json', name: 'Cave', entities: [{ id: 'e2', name: 'Lever', components: { Event: { states: [c] } } }] },
  ]
}

function Harness({ maps = usageMaps(), spies }: { maps?: UsageMap[]; spies?: Record<string, ReturnType<typeof vi.fn>> }) {
  const [switches, setSwitches] = useState(SWITCHES)
  const [variables, setVariables] = useState(VARIABLES)
  const call = (name: string, ...args: unknown[]) => spies?.[name]?.(...args)
  return (
    <StrictMode>
      <DatabasePanel
        {...STAGE_PROPS}
        switches={switches}
        variables={variables}
        maps={maps}
        addSwitch={(name) => {
          call('addSwitch', name)
          const id = `switch_${switches.length + 1}`
          setSwitches((s) => [...s, { id, name: name || `Switch ${s.length + 1}` }])
          return id
        }}
        renameSwitch={(id, name) => {
          call('renameSwitch', id, name)
          setSwitches((s) => s.map((x) => (x.id === id ? { ...x, name } : x)))
        }}
        removeSwitch={(id) => {
          call('removeSwitch', id)
          setSwitches((s) => s.filter((x) => x.id !== id))
        }}
        addVariable={(name, initial) => {
          call('addVariable', name, initial)
          const id = `variable_${variables.length + 1}`
          setVariables((v) => [...v, { id, name: name || `Variable ${v.length + 1}`, initial: initial ?? 0 }])
          return id
        }}
        renameVariable={(id, name) => {
          call('renameVariable', id, name)
          setVariables((v) => v.map((x) => (x.id === id ? { ...x, name } : x)))
        }}
        setVariableInitial={(id, initial) => {
          call('setVariableInitial', id, initial)
          setVariables((v) => v.map((x) => (x.id === id ? { ...x, initial } : x)))
        }}
        removeVariable={(id) => {
          call('removeVariable', id)
          setVariables((v) => v.filter((x) => x.id !== id))
        }}
      />
    </StrictMode>
  )
}

const spies = () => ({
  addSwitch: vi.fn(),
  renameSwitch: vi.fn(),
  removeSwitch: vi.fn(),
  addVariable: vi.fn(),
  renameVariable: vi.fn(),
  setVariableInitial: vi.fn(),
  removeVariable: vi.fn(),
})

const switchRow = (id: string) => document.querySelector(`[data-testid="switches-section"] tr[data-row-id="${id}"]`) as HTMLElement
const variableRow = (id: string) => document.querySelector(`[data-testid="variables-section"] tr[data-row-id="${id}"]`) as HTMLElement

describe('DatabasePanel', () => {
  it('shows switches and variables in two tables with muted ids', () => {
    render(<Harness />)
    expect(screen.getByRole('table', { name: 'Switches' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Variables' })).toBeInTheDocument()
    expect(within(switchRow('met')).getByLabelText('Switch name')).toHaveValue('Met the guard')
    expect(within(switchRow('met')).getByText('met')).toBeInTheDocument()
    expect(within(variableRow('badges')).getByLabelText('Variable name')).toHaveValue('Badges earned')
    expect(within(variableRow('badges')).getByLabelText('Initial value of Badges earned')).toHaveValue(2)
    expect(screen.getByRole('columnheader', { name: 'Initial' })).toBeInTheDocument()
  })

  it('counts events across ALL maps that reference an item', () => {
    render(<Harness />)
    expect(within(switchRow('met')).getByRole('button', { name: '1 event' })).toBeInTheDocument() // two states, one event
    expect(within(switchRow('door')).getByText('unused')).toBeInTheDocument()
    expect(within(variableRow('badges')).getByRole('button', { name: '1 event' })).toBeInTheDocument() // lives in the other map
  })

  it('counts several events', () => {
    const maps = usageMaps()
    const state = createDefaultEventState('x')
    state.conditions = [{ kind: 'switch', id: 'met', value: false }]
    maps[1].entities = [...(maps[1].entities ?? []), { id: 'e3', name: 'Third', components: { Event: { states: [state] } } }]
    render(<Harness maps={maps} />)
    expect(within(switchRow('met')).getByRole('button', { name: '2 events' })).toBeInTheDocument()
  })

  it('expands where an item is used', () => {
    render(<Harness />)
    fireEvent.click(within(switchRow('met')).getByRole('button', { name: '1 event' }))
    const list = screen.getByRole('list', { name: 'Where Met the guard is used' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Town > Guard (Talk)', 'Town > Guard (After)'])
    fireEvent.click(within(switchRow('met')).getByRole('button', { name: '1 event' }))
    expect(screen.queryByRole('list', { name: 'Where Met the guard is used' })).not.toBeInTheDocument()
  })

  it('adds a switch and focuses its name field', async () => {
    const s = spies()
    render(<Harness spies={s} />)
    fireEvent.click(screen.getByRole('button', { name: /Add switch/ }))
    expect(s.addSwitch).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(document.activeElement).toBe(within(switchRow('switch_3')).getByLabelText('Switch name')))
    expect(within(switchRow('switch_3')).getByLabelText('Switch name')).toHaveValue('Switch 3')
  })

  it('adds a variable', async () => {
    const s = spies()
    render(<Harness spies={s} />)
    fireEvent.click(screen.getByRole('button', { name: /Add variable/ }))
    expect(s.addVariable).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(variableRow('variable_2')).toBeTruthy())
    expect(within(screen.getByTestId('variables-section')).getByRole('heading', { name: /Variables/ })).toHaveTextContent('2')
  })

  it('renames on blur and on Enter', () => {
    const s = spies()
    render(<Harness spies={s} />)
    const input = within(switchRow('door')).getByLabelText('Switch name')
    fireEvent.change(input, { target: { value: 'Gate open' } })
    expect(s.renameSwitch).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(s.renameSwitch).toHaveBeenCalledTimes(1)
    expect(s.renameSwitch).toHaveBeenCalledWith('door', 'Gate open')
    const v = within(variableRow('badges')).getByLabelText('Variable name')
    fireEvent.change(v, { target: { value: 'Medals' } })
    fireEvent.keyDown(v, { key: 'Enter' })
    expect(s.renameVariable).toHaveBeenCalledWith('badges', 'Medals')
  })

  it('does not write an empty name and explains why', () => {
    const s = spies()
    render(<Harness spies={s} />)
    const input = within(switchRow('door')).getByLabelText('Switch name')
    fireEvent.change(input, { target: { value: '   ' } })
    expect(within(switchRow('door')).getByRole('alert')).toHaveTextContent('Name cannot be empty')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.blur(input)
    expect(s.renameSwitch).not.toHaveBeenCalled()
    expect(input).toHaveValue('   ') // stays so it can be fixed
    fireEvent.change(input, { target: { value: 'Fixed' } })
    expect(within(switchRow('door')).queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.blur(input)
    expect(s.renameSwitch).toHaveBeenCalledWith('door', 'Fixed')
  })

  it('does not write a duplicate name (case-insensitive) and explains why', () => {
    const s = spies()
    render(<Harness spies={s} />)
    const input = within(switchRow('door')).getByLabelText('Switch name')
    fireEvent.change(input, { target: { value: 'met THE guard' } })
    expect(within(switchRow('door')).getByRole('alert')).toHaveTextContent('Another switch is already called “met THE guard”')
    fireEvent.blur(input)
    expect(s.renameSwitch).not.toHaveBeenCalled()
  })

  it('Escape reverts an edit', () => {
    const s = spies()
    render(<Harness spies={s} />)
    const input = within(switchRow('door')).getByLabelText('Switch name')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('Door open')
    expect(s.renameSwitch).not.toHaveBeenCalled()
  })

  it('flags duplicate names that already exist in the data', () => {
    const maps: UsageMap[] = []
    render(
      <DatabasePanel
        {...STAGE_PROPS}
        switches={[
          { id: 'a', name: 'Same' },
          { id: 'b', name: 'same' },
        ]}
        variables={[]}
        maps={maps}
        addSwitch={() => ''}
        renameSwitch={() => {}}
        removeSwitch={() => {}}
        addVariable={() => ''}
        renameVariable={() => {}}
        setVariableInitial={() => {}}
        removeVariable={() => {}}
      />,
    )
    expect(screen.getAllByText('duplicate name')).toHaveLength(2)
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('edits a variable initial value', () => {
    const s = spies()
    render(<Harness spies={s} />)
    const input = within(variableRow('badges')).getByLabelText('Initial value of Badges earned')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    expect(s.setVariableInitial).toHaveBeenCalledWith('badges', 5)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(s.setVariableInitial).toHaveBeenCalledTimes(1)
  })

  it('deletes an unused entry immediately', () => {
    const s = spies()
    render(<Harness spies={s} />)
    fireEvent.click(within(switchRow('door')).getByRole('button', { name: 'Delete Door open' }))
    expect(s.removeSwitch).toHaveBeenCalledWith('door')
    expect(switchRow('door')).toBeFalsy()
  })

  it('asks for confirmation, with the usage list, before deleting a used entry', () => {
    const s = spies()
    render(<Harness spies={s} />)
    fireEvent.click(within(switchRow('met')).getByRole('button', { name: 'Delete Met the guard' }))
    expect(s.removeSwitch).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Met the guard?' })
    expect(dialog).toHaveTextContent('used by 1 event')
    expect(within(dialog).getByText('Town > Guard (Talk)')).toBeInTheDocument()
    expect(within(dialog).getByText('Town > Guard (After)')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(s.removeSwitch).not.toHaveBeenCalled()
    fireEvent.click(within(switchRow('met')).getByRole('button', { name: 'Delete Met the guard' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete anyway' }))
    expect(s.removeSwitch).toHaveBeenCalledTimes(1)
    expect(s.removeSwitch).toHaveBeenCalledWith('met')
    expect(switchRow('met')).toBeFalsy()
  })

  it('confirms deleting a used variable too', () => {
    const s = spies()
    render(<Harness spies={s} />)
    fireEvent.click(within(variableRow('badges')).getByRole('button', { name: 'Delete Badges earned' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Cave > Lever (Gate)')
    fireEvent.click(screen.getByRole('button', { name: 'Delete anyway' }))
    expect(s.removeVariable).toHaveBeenCalledWith('badges')
  })

  it('filters by name or id', () => {
    render(<Harness />)
    const filter = screen.getByRole('textbox', { name: 'Filter switches, variables and stages' })
    fireEvent.change(filter, { target: { value: 'door' } })
    expect(switchRow('door')).toBeTruthy()
    expect(switchRow('met')).toBeFalsy()
    expect(screen.getByText(/No variable matches “door”/)).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: 'BADGES' } })
    expect(variableRow('badges')).toBeTruthy()
    expect(screen.getByText(/No switch matches “BADGES”/)).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: '' } })
    expect(switchRow('met')).toBeTruthy()
  })

  it('clears the filter when adding so the new row is visible', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter switches, variables and stages' }), { target: { value: 'door' } })
    fireEvent.click(screen.getByRole('button', { name: /Add switch/ }))
    await waitFor(() => expect(switchRow('switch_3')).toBeTruthy())
    expect(screen.getByRole('textbox', { name: 'Filter switches, variables and stages' })).toHaveValue('')
  })

  it('copies an id', () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Harness />)
    fireEvent.click(within(switchRow('met')).getByRole('button', { name: 'Copy id met' }))
    expect(writeText).toHaveBeenCalledWith('met')
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  })

  it('shows helpful empty states', () => {
    render(
      <DatabasePanel
        {...STAGE_PROPS}
        switches={[]}
        variables={[]}
        maps={[]}
        addSwitch={() => ''}
        renameSwitch={() => {}}
        removeSwitch={() => {}}
        addVariable={() => ''}
        renameVariable={() => {}}
        setVariableInitial={() => {}}
        removeVariable={() => {}}
      />,
    )
    expect(screen.getByText(/A switch is a global ON\/OFF flag/)).toBeInTheDocument()
    expect(screen.getByText(/A variable is a global number/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('explains stages when there are none', () => {
    render(<DatabasePanel {...STAGE_PROPS} switches={[]} variables={[]} maps={[]} addSwitch={() => ''} renameSwitch={noop} removeSwitch={noop} addVariable={() => ''} renameVariable={noop} setVariableInitial={noop} removeVariable={noop} />)
    expect(screen.getByText(/A stage is progress through named steps/)).toBeInTheDocument()
  })
})

describe('DatabasePanel: stages and folders', () => {
  const CAT: StageDef = {
    id: 'cat',
    name: 'Lost cat',
    folder: 'Quests',
    values: [
      { id: 'none', name: 'Not started' },
      { id: 'found', name: 'Found' },
      { id: 'done', name: 'Done' },
    ],
    initial: 'none',
  }

  function stagesMaps(): UsageMap[] {
    const talk = createDefaultEventState('Talk')
    talk.graph = commandsToGraph([createCommand('setStage', { id: 'cat', mode: 'set', value: 'found' })])
    const after = createDefaultEventState('After')
    after.conditions = [{ kind: 'stage', id: 'cat', op: '>=', value: 'found' }]
    return [{ fileName: 'town.json', name: 'Town', entities: [{ id: 'e1', name: 'Elder', components: { Event: { states: [talk, after] } } }] }]
  }

  function mount(overrides: Record<string, unknown> = {}, maps: UsageMap[] = []) {
    const fns = {
      addStage: vi.fn(() => 'new_stage'),
      renameStage: vi.fn(),
      removeStage: vi.fn(),
      addStageValue: vi.fn(() => 'new_value'),
      renameStageValue: vi.fn(),
      removeStageValue: vi.fn(),
      moveStageValue: vi.fn(),
      setStageInitial: vi.fn(),
      setFolder: vi.fn(),
    }
    render(
      <DatabasePanel
        switches={[]}
        variables={[]}
        stages={[CAT]}
        maps={maps}
        addSwitch={() => ''}
        renameSwitch={noop}
        removeSwitch={noop}
        addVariable={() => ''}
        renameVariable={noop}
        setVariableInitial={noop}
        removeVariable={noop}
        {...fns}
        {...overrides}
      />,
    )
    return fns
  }

  const stageCard = () => document.querySelector('[data-testid="stages-section"] li[data-row-id="cat"]') as HTMLElement

  it('lists a stage with its values in order, the folder as a heading and the starting value marked', () => {
    mount()
    const section = screen.getByTestId('stages-section')
    expect(within(section).getByText('Quests')).toBeInTheDocument()
    expect(within(stageCard()).getByLabelText('Stage name')).toHaveValue('Lost cat')
    const values = within(screen.getByRole('list', { name: 'Values of Lost cat' })).getAllByRole('listitem')
    expect(values.map((li) => within(li).getByRole('textbox').getAttribute('aria-label'))).toEqual(['Value 1 of Lost cat', 'Value 2 of Lost cat', 'Value 3 of Lost cat'])
    expect(screen.getByRole('radio', { name: 'Not started is the starting value' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Done is the starting value' })).not.toBeChecked()
    expect(within(stageCard()).getByText('unused')).toBeInTheDocument()
  })

  it('adds a stage and a value', () => {
    const fns = mount()
    fireEvent.click(screen.getByRole('button', { name: /Add stage/ }))
    expect(fns.addStage).toHaveBeenCalledTimes(1)
    fireEvent.click(within(stageCard()).getByRole('button', { name: /Add value/ }))
    expect(fns.addStageValue).toHaveBeenCalledWith('cat')
  })

  it('renames a stage and a value; a duplicate value name is refused', () => {
    const fns = mount()
    const name = within(stageCard()).getByLabelText('Stage name')
    fireEvent.change(name, { target: { value: 'The cat' } })
    fireEvent.blur(name)
    expect(fns.renameStage).toHaveBeenCalledWith('cat', 'The cat')

    const value = screen.getByLabelText('Value 2 of Lost cat')
    fireEvent.change(value, { target: { value: 'Done' } })
    fireEvent.blur(value)
    expect(fns.renameStageValue).not.toHaveBeenCalled()
    expect(screen.getByText('Another value has this name')).toBeInTheDocument()
    fireEvent.change(value, { target: { value: 'Cat located' } })
    fireEvent.blur(value)
    expect(fns.renameStageValue).toHaveBeenCalledWith('cat', 'found', 'Cat located')
  })

  it('moves values, but not past the ends, and picks the starting value', () => {
    const fns = mount()
    expect(screen.getByRole('button', { name: 'Move Not started earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Done later' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Move Found earlier' }))
    expect(fns.moveStageValue).toHaveBeenCalledWith('cat', 'found', -1)
    fireEvent.click(screen.getByRole('button', { name: 'Move Found later' }))
    expect(fns.moveStageValue).toHaveBeenCalledWith('cat', 'found', 1)
    fireEvent.click(screen.getByRole('radio', { name: 'Found is the starting value' }))
    expect(fns.setStageInitial).toHaveBeenCalledWith('cat', 'found')
  })

  it('deletes a value, but never the last one', () => {
    const fns = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Found' }))
    expect(fns.removeStageValue).toHaveBeenCalledWith('cat', 'found')
    cleanup()
    mount({ stages: [{ ...CAT, values: [CAT.values[0]] }] })
    expect(screen.getByRole('button', { name: 'Delete Not started' })).toBeDisabled()
  })

  it('deletes an unused stage at once', () => {
    const fns = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lost cat' }))
    expect(fns.removeStage).toHaveBeenCalledWith('cat')
  })

  it('asks before deleting a stage that events use', () => {
    const fns = mount({}, stagesMaps())
    expect(within(stageCard()).getByRole('button', { name: /1 event/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lost cat' }))
    expect(fns.removeStage).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Delete Lost cat?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lost cat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete anyway' }))
    expect(fns.removeStage).toHaveBeenCalledWith('cat')
  })

  it('shows where a stage is used when the count is clicked', () => {
    mount({}, stagesMaps())
    fireEvent.click(within(stageCard()).getByRole('button', { name: /1 event/ }))
    expect(screen.getByRole('list', { name: 'Where Lost cat is used' })).toHaveTextContent('Town > Elder')
  })

  it('has no read/write warning when a stage is both set and read', () => {
    mount({}, stagesMaps())
    expect(screen.queryByText('never set')).not.toBeInTheDocument()
    expect(screen.queryByText('never read')).not.toBeInTheDocument()
  })

  it('warns about a stage that is read but never set, and one that is set but never read', () => {
    const readOnly = createDefaultEventState('R')
    readOnly.conditions = [{ kind: 'stage', id: 'cat', op: '>=', value: 'found' }]
    mount({}, [{ fileName: 'a.json', name: 'A', entities: [{ id: 'e', name: 'E', components: { Event: { states: [readOnly] } } }] }])
    expect(screen.getByText('never set')).toBeInTheDocument()
    cleanup()
    const writeOnly = createDefaultEventState('W')
    writeOnly.graph = commandsToGraph([createCommand('setStage', { id: 'cat', mode: 'advance' })])
    mount({}, [{ fileName: 'a.json', name: 'A', entities: [{ id: 'e', name: 'E', components: { Event: { states: [writeOnly] } } }] }])
    expect(screen.getByText('never read')).toBeInTheDocument()
  })

  it('edits the folder of a stage, a switch and a variable', () => {
    const fns = mount({ switches: [{ id: 'met', name: 'Met' }], variables: [{ id: 'badges', name: 'Badges', initial: 0 }] })
    const stageFolder = screen.getByLabelText('Folder of Lost cat')
    expect(stageFolder).toHaveValue('Quests')
    fireEvent.change(stageFolder, { target: { value: 'Quests/Cat' } })
    fireEvent.blur(stageFolder)
    expect(fns.setFolder).toHaveBeenLastCalledWith('stage', 'cat', 'Quests/Cat')

    const switchFolder = screen.getByLabelText('Folder of Met')
    fireEvent.change(switchFolder, { target: { value: 'Story' } })
    fireEvent.keyDown(switchFolder, { key: 'Enter' })
    expect(fns.setFolder).toHaveBeenLastCalledWith('switch', 'met', 'Story')

    const variableFolder = screen.getByLabelText('Folder of Badges')
    fireEvent.change(variableFolder, { target: { value: 'Gyms' } })
    fireEvent.keyDown(variableFolder, { key: 'Escape' })
    expect(variableFolder).toHaveValue('')
    expect(fns.setFolder).toHaveBeenCalledTimes(2)
  })

  it('groups switches by folder: unfiled first, then folders alphabetically', () => {
    mount({
      stages: [],
      switches: [
        { id: 'z', name: 'Zed', folder: 'Zoo' },
        { id: 'a', name: 'Alpha' },
        { id: 'm', name: 'Mid', folder: 'Town/Gate' },
        { id: 'n', name: 'Next', folder: 'Town/Gate' },
      ],
    })
    const table = screen.getByRole('table', { name: 'Switches' })
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => tr.getAttribute('data-folder') ?? tr.getAttribute('data-row-id'))
    expect(rows).toEqual(['a', 'Town/Gate', 'm', 'n', 'Zoo', 'z'])
  })

  it('the filter also matches folders and the names of stage values', () => {
    mount({ switches: [{ id: 'g', name: 'Gate', folder: 'Town' }, { id: 'o', name: 'Other' }] })
    const filter = screen.getByRole('textbox', { name: 'Filter switches, variables and stages' })
    fireEvent.change(filter, { target: { value: 'town' } })
    expect(screen.getAllByLabelText('Switch name')).toHaveLength(1)
    expect(screen.getByLabelText('Switch name')).toHaveValue('Gate')
    fireEvent.change(filter, { target: { value: 'found' } }) // the name of a stage value
    expect(within(stageCard()).getByLabelText('Stage name')).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: 'zzz' } })
    expect(screen.getByText(/No stage matches/)).toBeInTheDocument()
  })
})
