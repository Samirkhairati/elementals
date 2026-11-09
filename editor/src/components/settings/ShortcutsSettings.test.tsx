import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ShortcutsSettings } from './ShortcutsSettings'
import { useShortcutStore } from '@/store/shortcutStore'

afterEach(() => useShortcutStore.getState().resetAll())

const record = (label: string, key: string, init: KeyboardEventInit = {}) => {
  fireEvent.click(screen.getByLabelText(`Add a key to ${label}`))
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

describe('ShortcutsSettings', () => {
  it('lists every action with its default keys', () => {
    render(<ShortcutsSettings />)
    expect(screen.getByText('Undo')).toBeTruthy()
    expect(screen.getByText('Next view')).toBeTruthy()
    expect(screen.getByText('Brush tool')).toBeTruthy()
  })

  it('records a new key for an action and can reset it', () => {
    render(<ShortcutsSettings />)
    record('Brush tool', 'q')
    expect(useShortcutStore.getState().overrides['tool.brush']).toEqual(['B', 'Q'])
    fireEvent.click(screen.getByLabelText('Reset Brush tool'))
    expect(useShortcutStore.getState().overrides['tool.brush']).toBeUndefined()
  })

  it('warns about a key that another action uses and lets the author take it over', () => {
    render(<ShortcutsSettings />)
    record('Eraser tool', 'b')
    expect(screen.getByRole('alert').textContent).toContain('Brush tool')
    expect(useShortcutStore.getState().overrides['tool.eraser']).toBeUndefined()
    fireEvent.click(screen.getByText('Use it here instead'))
    const { overrides } = useShortcutStore.getState()
    expect(overrides['tool.eraser']).toEqual(['E', 'B'])
    expect(overrides['tool.brush']).toEqual([])
  })

  it('Esc cancels recording', () => {
    render(<ShortcutsSettings />)
    fireEvent.click(screen.getByLabelText('Add a key to Brush tool'))
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(useShortcutStore.getState().overrides).toEqual({})
  })

  it('removes a key from an action', () => {
    render(<ShortcutsSettings />)
    fireEvent.click(screen.getByLabelText(/Remove .*Y from Redo/))
    expect(useShortcutStore.getState().overrides['edit.redo']).toEqual(['Mod+Shift+Z'])
  })

  it('Reset all asks first and only resets once confirmed', () => {
    render(<ShortcutsSettings />)
    record('Brush tool', 'q')
    fireEvent.click(screen.getByRole('button', { name: /Reset all/ }))
    expect(screen.getByRole('dialog').textContent).toContain('Reset all shortcuts?')
    expect(useShortcutStore.getState().overrides['tool.brush']).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(useShortcutStore.getState().overrides['tool.brush']).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /Reset all/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reset all/ }))
    expect(useShortcutStore.getState().overrides).toEqual({})
  })

  it('each group collapses and opens again', () => {
    render(<ShortcutsSettings />)
    const group = screen.getAllByRole('button', { expanded: true })[0]
    expect(screen.getByText('Undo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Edit/i }))
    expect(screen.queryByText('Undo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Edit/i }))
    expect(screen.getByText('Undo')).toBeTruthy()
    void group
  })
})
