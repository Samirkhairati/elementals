import React, { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { EventState } from '../../../../../shared/engine/types'
import { EventComponentEditor, OPEN_EVENT_EDITOR_EVENT } from './EventComponentEditor'
import { CUSTOM_EDITORS } from '../inspector/customEditors'
import { EditorProvider, type EditorBaseContextValue } from '../layout/EditorContext'
import { cmd, state, renderWithEnv, sequentialIds } from './eventTestUtils'

const ids = sequentialIds('n')
beforeEach(() => ids.start())
afterEach(() => ids.stop())

function Card({ states, onChange, entityId = 'self-1' }: { states: EventState[]; onChange?: (key: string, value: unknown) => void; entityId?: string }) {
  const [value, setValue] = useState<Record<string, unknown>>({ states })
  return (
    <EventComponentEditor
      entityId={entityId}
      value={value}
      components={{}}
      onChange={(key, v) => {
        onChange?.(key, v)
        setValue((prev) => ({ ...prev, [key]: v }))
      }}
      onChangeMany={() => {}}
    />
  )
}

describe('EventComponentEditor card', () => {
  it('is registered as the Event custom editor', () => {
    expect(CUSTOM_EDITORS.Event).toBe(EventComponentEditor)
  })

  it('summarises states, the active trigger and the first command lines with names', () => {
    renderWithEnv(
      <Card
        states={[
          state(
            'p1',
            [
              cmd('1', 'showText', { text: 'Hello' }),
              cmd('2', 'setSwitch', { id: 'met', value: true }),
              cmd('3', 'warp', { map: 'town', x: 1, y: 2 }),
              cmd('4', 'givePokemon', { species: 'pidgey' }),
              cmd('5', 'wait'),
              cmd('6', 'wait'),
            ],
            { trigger: 'playerTouch' },
          ),
        ]}
      />,
    )
    expect(screen.getByTestId('event-state-count')).toHaveTextContent('1 state')
    expect(screen.getByText('Player touch')).toBeInTheDocument()
    const lines = screen.getByTestId('event-summary-lines')
    expect(within(lines).getAllByRole('listitem')).toHaveLength(5) // 4 commands + "more"
    expect(within(lines).getByText('Switch "Met the guard" = ON')).toBeInTheDocument()
    expect(within(lines).getByText('Warp to "Town" (1, 2)')).toBeInTheDocument()
    expect(within(lines).getByText('planned')).toBeInTheDocument()
    expect(within(lines).getByText('+2 more (6 in total)')).toBeInTheDocument()
  })

  it('shows the state that is active with nothing set, plural state count', () => {
    renderWithEnv(
      <Card
        states={[
          state('p1', [cmd('1', 'showText', { text: 'first' })], { name: 'Before' }),
          state('p2', [cmd('2', 'showText', { text: 'second' })], { name: 'After', conditions: [{ kind: 'switch', id: 'met', value: true }] }),
        ]}
      />,
    )
    expect(screen.getByTestId('event-state-count')).toHaveTextContent('2 states')
    expect(screen.getByText('"first"')).toBeInTheDocument()
    expect(screen.queryByText('"second"')).not.toBeInTheDocument()
    expect(screen.getByText('Before')).toBeInTheDocument()
  })

  it('says so when nothing happens yet', () => {
    renderWithEnv(<Card states={[state('p1')]} />)
    expect(screen.getByText('Nothing happens yet')).toBeInTheDocument()
    expect(screen.getByTestId('event-validation')).toHaveTextContent('OK')
  })

  it('shows a warning badge for unfinished commands and an error badge for broken references', () => {
    const { unmount } = renderWithEnv(<Card states={[state('p1', [cmd('1', 'warp', { map: '' })])]} />)
    expect(screen.getByTestId('event-validation')).toHaveTextContent('1 warning')
    unmount()
    renderWithEnv(<Card states={[state('p1', [cmd('1', 'setSwitch', { id: 'ghost' }), cmd('2', 'setSwitch', { id: 'ghost2' })])]} />)
    const badge = screen.getByTestId('event-validation')
    expect(badge).toHaveTextContent('2 errors')
    expect(badge.getAttribute('title')).toContain('does not exist')
  })

  it('falls back to a default state when the event has none', () => {
    renderWithEnv(<Card states={[]} />)
    expect(screen.getByTestId('event-state-count')).toHaveTextContent('1 state')
  })
})

describe('opening the editor dialog', () => {
  it('opens a large dialog, edits go through onChange("states", ...) once each', () => {
    const onChange = vi.fn()
    renderWithEnv(<Card states={[state('p1', [cmd('1', 'showText', { text: 'Hello' })])]} onChange={onChange} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Open event editor/ }))
    const dialog = screen.getByRole('dialog', { name: /Event editor · Old man/ })
    expect(dialog.className).toContain('w-[90vw]')
    expect(dialog.className).toContain('h-[85vh]')
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Trigger' }), { target: { value: 'playerTouch' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toBe('states')
    expect((onChange.mock.calls[0][1] as EventState[])[0].trigger).toBe('playerTouch')
    // the card behind the dialog follows
    expect(screen.getAllByText('Player touch').length).toBeGreaterThan(0)
  })

  it('closes with Escape', () => {
    renderWithEnv(<Card states={[state('p1')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Open event editor/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /Event editor/ })).not.toBeInTheDocument()
  })

  it('Escape closes an open popover first and leaves the dialog open', () => {
    renderWithEnv(<Card states={[state('p1')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Open event editor/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add node' }))
    expect(screen.getByRole('dialog', { name: 'Add a node' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search nodes' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Add a node' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /Event editor/ })).toBeInTheDocument()
  })

  it('opens when another part of the editor asks for it (window event, matching entity only)', () => {
    renderWithEnv(<Card states={[state('p1')]} />)
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT_EDITOR_EVENT, { detail: 'someone-else' }))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT_EDITOR_EVENT, { detail: 'self-1' }))
    })
    expect(screen.getByRole('dialog', { name: /Event editor/ })).toBeInTheDocument()
  })

  it('keeps editor-wide single-key shortcuts (like Delete = delete entity) away while typing in the dialog', () => {
    const globalKey = vi.fn()
    window.addEventListener('keydown', globalKey)
    renderWithEnv(<Card states={[state('p1', [cmd('1', 'wait')])]} />)
    fireEvent.click(screen.getByRole('button', { name: /Open event editor/ }))
    fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'e' })
    fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'Delete' })
    window.removeEventListener('keydown', globalKey)
    expect(globalKey).not.toHaveBeenCalled()
  })

  it('lets Ctrl/Cmd+Z reach the editor-wide undo shortcut', () => {
    const globalKey = vi.fn()
    window.addEventListener('keydown', globalKey)
    renderWithEnv(<Card states={[state('p1', [cmd('1', 'wait')])]} />)
    fireEvent.click(screen.getByRole('button', { name: /Open event editor/ }))
    fireEvent.keyDown(screen.getByTestId('graph-canvas'), { key: 'z', ctrlKey: true })
    window.removeEventListener('keydown', globalKey)
    expect(globalKey).toHaveBeenCalledTimes(1)
  })
})

describe('with the real editor context', () => {
  function contextValue(overrides: Record<string, unknown> = {}): EditorBaseContextValue {
    return {
      switches: [{ id: 'met', name: 'Met the guard' }],
      variables: [],
      maps: [{ name: 'Town', fileName: 'town.json', folderPath: null }],
      entities: [
        { id: 'self-1', name: 'Old man' },
        { id: 'e2', name: 'Guard' },
      ],
      spriteList: [{ id: 'objects/chest', meta: { name: 'Chest', kind: 'object' } }],
      getSpriteAsset: () => undefined,
      addSwitch: vi.fn(() => 'new_switch'),
      addVariable: vi.fn(() => 'new_var'),
      handleUndo: vi.fn(),
      handleRedo: vi.fn(),
      historyIndex: 1,
      historyLength: 3,
      ...overrides,
    } as unknown as EditorBaseContextValue
  }

  it('builds names, validation ids and undo availability from the editor context', () => {
    const value = contextValue()
    render(
      <StrictMode>
        <EditorProvider value={value}>
          <Card states={[state('p1', [cmd('1', 'warp', { map: 'town', x: 0, y: 0 }), cmd('2', 'setSwitch', { id: 'met' })])]} />
        </EditorProvider>
      </StrictMode>,
    )
    expect(screen.getByText('Warp to "Town" (0, 0)')).toBeInTheDocument()
    expect(screen.getByText('Switch "Met the guard" = ON')).toBeInTheDocument()
    expect(screen.getByTestId('event-validation')).toHaveTextContent('OK')
    fireEvent.click(screen.getByRole('button', { name: /Open event editor/ }))
    expect(screen.getByRole('dialog', { name: /Event editor · Old man/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect((value as unknown as { handleUndo: ReturnType<typeof vi.fn> }).handleUndo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Redo' })).not.toBeDisabled()
  })
})
