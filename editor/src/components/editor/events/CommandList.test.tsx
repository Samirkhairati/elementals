import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { Command, CommandIssue } from '../../../../../shared/engine/types'
import { findCommand } from '../../../../../shared/engine/commands'
import { CommandList } from './CommandList'
import { cmd, flat, makeEnv, renderWithEnv, sequentialIds } from './eventTestUtils'
import { setMemoryClipboard } from './eventModel'

const ids = sequentialIds('n')
beforeEach(() => {
  ids.start()
  setMemoryClipboard(null)
})
afterEach(() => ids.stop())

interface HarnessProps {
  initial: Command[]
  onChange?: (next: Command[], select?: string | null) => void
  onApplyTemplate?: (...args: unknown[]) => void
  onRequestEdit?: () => void
  issues?: Map<string, CommandIssue[]>
  initialSelected?: string | null
}

function Harness({ initial, onChange, onApplyTemplate, onRequestEdit, issues, initialSelected = null }: HarnessProps) {
  const [tree, setTree] = useState(initial)
  const [selected, setSelected] = useState<string | null>(initialSelected)
  return (
    <>
      <CommandList
        commands={tree}
        selectedId={selected}
        onSelect={setSelected}
        issues={issues ?? new Map()}
        onRequestEdit={onRequestEdit ?? (() => {})}
        onApplyTemplate={(t, target) => onApplyTemplate?.(t, target)}
        onChange={(next, select) => {
          onChange?.(next, select)
          setTree(next)
          if (select !== undefined) setSelected(select)
        }}
      />
      <output data-testid="selected">{selected ?? ''}</output>
    </>
  )
}

function sample(): Command[] {
  return [
    cmd('a', 'showText', { text: 'Hello there' }),
    cmd('b', 'showChoices', {}, { opt1: [cmd('b1', 'setSwitch', { id: 'met', value: true })], opt2: [] }),
    cmd('c', 'wait', { ms: 250 }),
  ]
}

/** The toolbar's button (rows also have add buttons, but the toolbar comes first in the DOM). */
const toolbarAdd = () => screen.getAllByRole('button', { name: 'Add command' })[0]
const tree = () => screen.getByRole('tree', { name: 'Commands' })
const rowOf = (id: string) => {
  const item = document.querySelector(`[data-command-id="${id}"]`) as HTMLElement
  return item.querySelector('[draggable="true"]') as HTMLElement
}
const lastTree = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls[spy.mock.calls.length - 1][0] as Command[]

describe('CommandList rendering', () => {
  it('shows names instead of ids in summaries', () => {
    renderWithEnv(
      <Harness
        initial={[
          cmd('1', 'setSwitch', { id: 'met', value: true }),
          cmd('2', 'setVariable', { id: 'badges', op: 'add', operand: 'const', value: 1 }),
          cmd('3', 'warp', { map: 'town', x: 3, y: 4 }),
          cmd('4', 'changeSprite', { target: { entity: 'e2' }, asset: 'objects/chest' }),
          cmd('5', 'setFacing', { target: 'player', facing: 'left' }),
        ]}
      />,
    )
    expect(screen.getByText('Switch "Met the guard" = ON')).toBeInTheDocument()
    expect(screen.getByText('Variable "Badges earned" += 1')).toBeInTheDocument()
    expect(screen.getByText('Warp to "Town" (3, 4)')).toBeInTheDocument()
    expect(screen.getByText('Sprite of "Guard" = "Chest"')).toBeInTheDocument()
    expect(screen.getByText('Face the player left')).toBeInTheDocument()
  })

  it('renders names with a coloured bold label per command', () => {
    renderWithEnv(<Harness initial={sample()} />)
    const label = within(document.querySelector('[data-command-id="a"]') as HTMLElement).getAllByText('Show Text')[0]
    expect(label.className).toContain('font-semibold')
    expect(label.className).toContain('text-sky-400')
  })

  it('nests branches with labelled headers and indentation levels', () => {
    renderWithEnv(
      <Harness
        initial={[
          cmd('q', 'showChoices'),
          cmd('i', 'conditional', { conditions: [{ kind: 'switch', id: 'met', value: true }] }, { then: [cmd('t', 'wait')], else: [] }),
          cmd('l', 'loop', {}, { body: [cmd('x', 'breakLoop')] }),
        ]}
      />,
    )
    expect(screen.getByRole('group', { name: 'Choice: Yes' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Choice: No' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Then' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Else' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Loop body' })).toBeInTheDocument()
    expect(screen.getByText('If Switch "Met the guard" is ON')).toBeInTheDocument()
    expect(document.querySelector('[data-command-id="q"]')).toHaveAttribute('aria-level', '1')
    expect(document.querySelector('[data-command-id="t"]')).toHaveAttribute('aria-level', '2')
    expect(document.querySelector('[data-command-id="x"]')).toHaveAttribute('aria-level', '2')
  })

  it('collapses and expands a container', () => {
    renderWithEnv(<Harness initial={sample()} />)
    expect(document.querySelector('[data-command-id="b1"]')).toBeInTheDocument()
    const item = document.querySelector('[data-command-id="b"]') as HTMLElement
    fireEvent.click(within(item).getAllByRole('button', { name: 'Collapse' })[0])
    expect(document.querySelector('[data-command-id="b1"]')).not.toBeInTheDocument()
    expect(item).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('(1 hidden)')).toBeInTheDocument()
    fireEvent.click(within(item).getAllByRole('button', { name: 'Expand' })[0])
    expect(document.querySelector('[data-command-id="b1"]')).toBeInTheDocument()
  })

  it('badges planned commands only', () => {
    renderWithEnv(<Harness initial={[cmd('g', 'givePokemon', { species: 'pidgey' }), cmd('w', 'wait')]} />)
    expect(within(document.querySelector('[data-command-id="g"]') as HTMLElement).getByText('planned')).toBeInTheDocument()
    expect(within(document.querySelector('[data-command-id="w"]') as HTMLElement).queryByText('planned')).not.toBeInTheDocument()
  })

  it('shows validation markers with the message as tooltip', () => {
    const issues = new Map<string, CommandIssue[]>([
      ['a', [{ commandId: 'a', path: [0], severity: 'error', code: 'x', message: 'Switch "ghost" does not exist' }]],
      ['c', [{ commandId: 'c', path: [2], severity: 'warning', code: 'y', message: 'Duration is not set' }]],
    ])
    renderWithEnv(<Harness initial={sample()} issues={issues} />)
    const err = screen.getByRole('img', { name: /Error: Switch "ghost" does not exist/ })
    expect(err).toHaveAttribute('title', 'Switch "ghost" does not exist')
    expect(err).toHaveAttribute('data-severity', 'error')
    expect(screen.getByRole('img', { name: /Warning: Duration is not set/ })).toHaveAttribute('data-severity', 'warning')
  })

  it('describes unknown commands instead of crashing', () => {
    renderWithEnv(<Harness initial={[{ id: 'u', type: 'mystery', params: {} }]} />)
    expect(screen.getByText('Unknown command "mystery"')).toBeInTheDocument()
  })

  it('shows removed branches that still hold commands, and can delete them', () => {
    const onChange = vi.fn()
    const orphan: Command = { ...cmd('l', 'loop'), branches: { body: [], gone: [cmd('g', 'wait')] } }
    renderWithEnv(<Harness initial={[orphan]} onChange={onChange} />)
    expect(screen.getByRole('group', { name: /Removed branch "gone"/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete branch' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(Object.keys(lastTree(onChange)[0].branches ?? {})).toEqual(['body'])
  })
})

describe('empty state', () => {
  it('offers a one-click first command and templates', () => {
    const onChange = vi.fn()
    const onApplyTemplate = vi.fn()
    renderWithEnv(<Harness initial={[]} onChange={onChange} onApplyTemplate={onApplyTemplate} />)
    expect(screen.getByTestId('empty-commands')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes / No question' }))
    expect(onApplyTemplate).toHaveBeenCalledTimes(1)
    expect((onApplyTemplate.mock.calls[0][0] as { id: string }).id).toBe('yes-no')
    fireEvent.click(screen.getByRole('button', { name: /Add your first command/ }))
    fireEvent.click(screen.getByRole('option', { name: /Show Text/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(flat(lastTree(onChange))).toEqual(['showText'])
    expect(screen.queryByTestId('empty-commands')).not.toBeInTheDocument()
  })
})

describe('adding commands', () => {
  it('lists every catalog command grouped by category with descriptions and planned badges', () => {
    renderWithEnv(<Harness initial={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Add your first command/ }))
    const dialog = screen.getByRole('dialog', { name: 'Add a command' })
    for (const group of ['Dialogue', 'Flow', 'State', 'Character', 'Map & Screen', 'Audio', 'RPG', 'Advanced']) {
      expect(within(dialog).getByText(group)).toBeInTheDocument()
    }
    expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(30)
    expect(within(dialog).getByText('Show a dialogue box and wait for the player to dismiss it.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('planned').length).toBeGreaterThan(5)
  })

  it('filters by search and adds on Enter', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Add your first command/ }))
    const search = screen.getByRole('textbox', { name: 'Search' })
    fireEvent.change(search, { target: { value: 'weather' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(flat(lastTree(onChange))).toEqual(['setWeather'])
  })

  it('moves the highlight with the arrow keys', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Add your first command/ }))
    const search = screen.getByRole('textbox', { name: 'Search' })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(flat(lastTree(onChange))).toEqual(['showChoices'])
  })

  it('inserts after the selected row from the toolbar and selects the new command', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} initialSelected="a" />)
    fireEvent.click(toolbarAdd())
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'comment' } })
    fireEvent.click(screen.getByRole('option', { name: /Comment/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastTree(onChange).map((c) => c.type)).toEqual(['showText', 'comment', 'showChoices', 'wait'])
    expect(screen.getByTestId('selected')).toHaveTextContent('n-1')
  })

  it('appends to the end of the page when nothing is selected', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    fireEvent.click(toolbarAdd())
    fireEvent.click(screen.getByRole('option', { name: /^Exit Event/ }))
    expect(lastTree(onChange).map((c) => c.type)).toEqual(['showText', 'showChoices', 'wait', 'exitEvent'])
  })

  it('adds to the end of a branch from its add row', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    const noBranch = screen.getByRole('group', { name: 'Choice: No' })
    fireEvent.click(within(noBranch).getByRole('button', { name: 'Add command' }))
    fireEvent.click(screen.getByRole('option', { name: /Show Text/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(findCommand(lastTree(onChange), 'n-1')).toMatchObject({ parentId: 'b', branch: 'opt2', index: 0 })
  })

  it('inserts before a row with the hover plus line', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Insert command before Choices: Yes \/ No/ }))
    fireEvent.click(screen.getByRole('option', { name: /Wait/ }))
    expect(lastTree(onChange).map((c) => c.type)).toEqual(['showText', 'wait', 'showChoices', 'wait'])
  })

  it('creates choices with their branches ready', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Add your first command/ }))
    fireEvent.click(screen.getByRole('option', { name: /Show Choices/ }))
    expect(Object.keys(lastTree(onChange)[0].branches ?? {})).toEqual(['opt1', 'opt2'])
    expect(screen.getByRole('group', { name: 'Choice: Yes' })).toBeInTheDocument()
  })

  it('closes the popover with Escape', () => {
    renderWithEnv(<Harness initial={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Add your first command/ }))
    expect(screen.getByRole('dialog', { name: 'Add a command' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Add a command' })).not.toBeInTheDocument()
  })

  it('applies a template at the selected row', () => {
    const onApplyTemplate = vi.fn()
    renderWithEnv(<Harness initial={sample()} onApplyTemplate={onApplyTemplate} initialSelected="a" />)
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Warp/ }))
    expect(onApplyTemplate).toHaveBeenCalledTimes(1)
    expect(onApplyTemplate.mock.calls[0][1]).toEqual({ kind: 'after', id: 'a' })
  })
})

describe('row actions and keyboard', () => {
  it('selects on click', () => {
    renderWithEnv(<Harness initial={sample()} />)
    fireEvent.click(rowOf('c'))
    expect(screen.getByTestId('selected')).toHaveTextContent('c')
    expect(document.querySelector('[data-command-id="c"]')).toHaveAttribute('aria-selected', 'true')
  })

  it('duplicates with the row button (fresh ids, one change)', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    fireEvent.click(within(rowOf('c')).getByRole('button', { name: 'Duplicate' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastTree(onChange).map((c) => c.type)).toEqual(['showText', 'showChoices', 'wait', 'wait'])
    expect(lastTree(onChange)[3].id).not.toBe('c')
  })

  it('deletes with the row button', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    fireEvent.click(within(rowOf('a')).getByRole('button', { name: 'Delete' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['b', 'c'])
    expect(screen.getByTestId('selected')).toHaveTextContent('b')
  })

  it('ArrowUp/ArrowDown move the selection through nested rows', () => {
    renderWithEnv(<Harness initial={sample()} />)
    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(screen.getByTestId('selected')).toHaveTextContent('a')
    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(screen.getByTestId('selected')).toHaveTextContent('b1')
    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(screen.getByTestId('selected')).toHaveTextContent('c')
    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(screen.getByTestId('selected')).toHaveTextContent('c')
    fireEvent.keyDown(tree(), { key: 'ArrowUp' })
    expect(screen.getByTestId('selected')).toHaveTextContent('b1')
  })

  it('double-clicking a row selects it and asks the editor to focus the form', () => {
    const onRequestEdit = vi.fn()
    renderWithEnv(<Harness initial={sample()} onRequestEdit={onRequestEdit} />)
    fireEvent.doubleClick(rowOf('c'))
    expect(screen.getByTestId('selected')).toHaveTextContent('c')
    expect(onRequestEdit).toHaveBeenCalledTimes(1)
  })

  it('Enter asks the editor to focus the parameter form', () => {
    const onRequestEdit = vi.fn()
    renderWithEnv(<Harness initial={sample()} onRequestEdit={onRequestEdit} initialSelected="a" />)
    fireEvent.keyDown(tree(), { key: 'Enter' })
    expect(onRequestEdit).toHaveBeenCalledTimes(1)
  })

  it('Delete removes the selected command and keeps the key away from global shortcuts', () => {
    const onChange = vi.fn()
    const outer = vi.fn()
    window.addEventListener('keydown', outer)
    renderWithEnv(<Harness initial={sample()} onChange={onChange} initialSelected="c" />)
    fireEvent.keyDown(tree(), { key: 'Delete' })
    window.removeEventListener('keydown', outer)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['a', 'b'])
    expect(outer).not.toHaveBeenCalled()
    expect(screen.getByTestId('selected')).toHaveTextContent('b1')
  })

  it('Ctrl/Cmd+D duplicates', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} initialSelected="a" />)
    fireEvent.keyDown(tree(), { key: 'd', ctrlKey: true })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastTree(onChange).map((c) => c.type)).toEqual(['showText', 'showText', 'showChoices', 'wait'])
    fireEvent.keyDown(tree(), { key: 'D', metaKey: true })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('Alt+Arrow moves within the list', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} initialSelected="a" />)
    fireEvent.keyDown(tree(), { key: 'ArrowDown', altKey: true })
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['b', 'a', 'c'])
    fireEvent.keyDown(tree(), { key: 'ArrowUp', altKey: true })
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['a', 'b', 'c'])
    fireEvent.keyDown(tree(), { key: 'ArrowUp', altKey: true })
    expect(onChange).toHaveBeenCalledTimes(2) // already first: nothing happens
  })

  it('ArrowLeft/Right collapse and expand', () => {
    renderWithEnv(<Harness initial={sample()} initialSelected="b" />)
    fireEvent.keyDown(tree(), { key: 'ArrowLeft' })
    expect(document.querySelector('[data-command-id="b1"]')).not.toBeInTheDocument()
    fireEvent.keyDown(tree(), { key: 'ArrowRight' })
    expect(document.querySelector('[data-command-id="b1"]')).toBeInTheDocument()
  })

  it('"/" opens the add-command search', () => {
    renderWithEnv(<Harness initial={sample()} />)
    fireEvent.keyDown(tree(), { key: '/' })
    expect(screen.getByRole('dialog', { name: 'Add a command' })).toBeInTheDocument()
  })

  it('copies and pastes commands with fresh ids (also nested subtrees)', async () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} initialSelected="b" />)
    fireEvent.keyDown(tree(), { key: 'c', ctrlKey: true })
    await act(async () => {
      fireEvent.keyDown(tree(), { key: 'v', ctrlKey: true })
    })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const pasted = lastTree(onChange)
    expect(pasted.map((c) => c.type)).toEqual(['showText', 'showChoices', 'showChoices', 'wait'])
    expect(pasted[2].id).not.toBe('b')
    expect(pasted[2].branches?.opt1?.[0].id).not.toBe('b1')
    expect(pasted[2].branches?.opt1?.[0].params).toEqual({ id: 'met', value: true })
    expect(screen.getByTestId('selected')).toHaveTextContent(pasted[2].id)
  })

  it('cut removes the command and keeps it for pasting', async () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} initialSelected="c" />)
    fireEvent.keyDown(tree(), { key: 'x', metaKey: true })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['a', 'b'])
    await act(async () => {
      fireEvent.keyDown(tree(), { key: 'v', metaKey: true })
    })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    // pasted after the selection that follows a cut (the command inside the first choice)
    expect(flat(lastTree(onChange))).toEqual(['showText', 'showChoices', 'setSwitch', 'wait'])
  })

  it('ignores keys typed into inputs and events that bubble out of popovers', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} initialSelected="a" />)
    fireEvent.click(toolbarAdd())
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'Delete' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'd', ctrlKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toolbar buttons are disabled without a selection', () => {
    renderWithEnv(<Harness initial={sample()} />)
    expect(screen.getByRole('button', { name: /^Duplicate \(/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Move up/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Delete \(Del\)/ })).toBeDisabled()
  })
})

describe('drag and drop', () => {
  const dt = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' })

  // jsdom has no DragEvent, so clientY is attached by hand. Rects are 0x0, so clientY > 0 is the lower half.
  function fireDrag(type: 'dragOver' | 'drop', el: Element, data: ReturnType<typeof dt>, clientY: number) {
    const event = createEvent[type](el, { dataTransfer: data })
    Object.defineProperty(event, 'clientY', { value: clientY })
    fireEvent(el, event)
  }

  function drag(from: string, to: string, clientY: number) {
    const data = dt()
    fireEvent.dragStart(rowOf(from), { dataTransfer: data })
    fireDrag('dragOver', rowOf(to), data, clientY)
    fireDrag('drop', rowOf(to), data, clientY)
    fireEvent.dragEnd(rowOf(from), { dataTransfer: data })
  }

  it('reorders inside a list, showing a drop indicator while dragging', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    const data = dt()
    fireEvent.dragStart(rowOf('a'), { dataTransfer: data })
    fireDrag('dragOver', rowOf('c'), data, 5)
    expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
    fireDrag('drop', rowOf('c'), data, 5)
    fireEvent.dragEnd(rowOf('a'), { dataTransfer: data })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['b', 'c', 'a'])
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
  })

  it('drops above a row when the pointer is in its upper half', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    drag('c', 'a', -1)
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('moves into another branch by dropping on its end row', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    const data = dt()
    fireEvent.dragStart(rowOf('a'), { dataTransfer: data })
    const noGroup = screen.getByRole('group', { name: 'Choice: No' })
    const endRow = within(noGroup).getByRole('button', { name: 'Add command' }).parentElement as HTMLElement
    fireEvent.dragOver(endRow, { dataTransfer: data })
    fireEvent.drop(endRow, { dataTransfer: data })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(findCommand(lastTree(onChange), 'a')).toMatchObject({ parentId: 'b', branch: 'opt2' })
  })

  it('moves a nested command out to the root', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    drag('b1', 'c', 5)
    expect(lastTree(onChange).map((c) => c.id)).toEqual(['a', 'b', 'c', 'b1'])
  })

  it('does nothing when dropped on itself or into its own subtree', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    drag('a', 'a', 5)
    drag('b', 'b1', 5)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores drops that were not started from a row', () => {
    const onChange = vi.fn()
    renderWithEnv(<Harness initial={sample()} onChange={onChange} />)
    fireDrag('drop', rowOf('a'), dt(), 5)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('env usage', () => {
  it('uses unresolved ids as a fallback in summaries', () => {
    renderWithEnv(<Harness initial={[cmd('1', 'setSwitch', { id: 'ghost', value: false })]} />, makeEnv({ switches: [] }))
    expect(screen.getByText('Switch "ghost" = OFF')).toBeInTheDocument()
  })
})
