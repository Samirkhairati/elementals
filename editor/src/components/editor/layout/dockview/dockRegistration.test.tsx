import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { DockviewApi, DockviewReadyEvent } from 'dockview-react'

// Konva needs a real canvas; the dock registration does not care about the map canvas itself.
vi.mock('@/components/editor/canvas/MapCanvas', () => ({ MapCanvas: () => null }))
// The Sprites panel belongs to another agent (it may be a placeholder); the wrapper just renders it.
vi.mock('@/components/editor/panels/SpritesPanel', () => ({ SpritesPanel: () => <div data-testid="sprites-panel" /> }))

import { ALL_PANELS, DEFAULT_PANEL_IDS } from './types'
import { DatabaseWrapper, SpritesWrapper, dockviewComponents } from './PanelWrappers'
import { useDockviewLayout } from './useDockviewLayout'
import { EditorProvider, type EditorBaseContextValue } from '../EditorContext'
import type { IDockviewPanelProps } from 'dockview-react'

interface FakePanel {
  id: string
  component: string
  api: { setSize: ReturnType<typeof vi.fn>; setActive: ReturnType<typeof vi.fn>; close: () => void; isActive: boolean }
}

function createFakeApi() {
  const panels = new Map<string, FakePanel>()
  const addPanel = vi.fn((opts: { id: string; component: string }) => {
    const panel: FakePanel = {
      id: opts.id,
      component: opts.component,
      api: { setSize: vi.fn(), setActive: vi.fn(), close: () => void panels.delete(opts.id), isActive: false },
    }
    panels.set(opts.id, panel)
    return panel
  })
  const api = {
    width: 1200,
    height: 800,
    get panels() {
      return [...panels.values()]
    },
    addPanel,
    getPanel: (id: string) => panels.get(id),
    clear: () => panels.clear(),
    layout: vi.fn(),
    onDidAddPanel: vi.fn(),
    onDidActivePanelChange: vi.fn(),
    onDidRemovePanel: vi.fn(),
  }
  return { api: api as unknown as DockviewApi, addPanel, panels }
}

function mountLayout() {
  const fake = createFakeApi()
  const hook = renderHook(() => useDockviewLayout({}))
  act(() => {
    hook.result.current.onReady({ api: fake.api } as unknown as DockviewReadyEvent)
  })
  return { ...fake, hook }
}

const DEFAULT_OPEN = ['empty_canvas', 'maps', 'layers', 'entities', 'properties', 'tilesets', 'preview', 'activeSelection']

describe('panel registry', () => {
  it('lists Database and Sprites in the right column with their shortcuts', () => {
    const database = ALL_PANELS.find((p) => p.id === 'database')
    const sprites = ALL_PANELS.find((p) => p.id === 'sprites')
    expect(database).toEqual({ id: 'database', title: 'Database', column: 'right', shortcut: 'Alt+D' })
    expect(sprites).toEqual({ id: 'sprites', title: 'Sprites', column: 'right', shortcut: 'Alt+S' })
  })

  it('keeps the default layout unchanged: the new panels are on demand only', () => {
    expect(DEFAULT_PANEL_IDS).toEqual(['maps', 'layers', 'entities', 'properties', 'canvas', 'tilesets', 'preview', 'activeSelection'])
    expect(DEFAULT_PANEL_IDS).not.toContain('database')
    expect(DEFAULT_PANEL_IDS).not.toContain('sprites')
  })

  it('has a dockview component for every panel and unique ids and shortcuts', () => {
    for (const p of ALL_PANELS) expect(Object.keys(dockviewComponents)).toContain(p.id === 'canvas' ? 'canvas' : p.id)
    expect(new Set(ALL_PANELS.map((p) => p.id)).size).toBe(ALL_PANELS.length)
    const shortcuts = ALL_PANELS.map((p) => p.shortcut).filter(Boolean)
    expect(new Set(shortcuts).size).toBe(shortcuts.length)
  })
})

describe('panel wrappers', () => {
  const props = {} as IDockviewPanelProps

  it('DatabaseWrapper feeds the panel from the editor context', () => {
    const value = {
      switches: [{ id: 'met', name: 'Met the guard' }],
      variables: [{ id: 'badges', name: 'Badges earned', initial: 0 }],
      maps: [],
      addSwitch: vi.fn(),
      renameSwitch: vi.fn(),
      removeSwitch: vi.fn(),
      addVariable: vi.fn(),
      renameVariable: vi.fn(),
      setVariableInitial: vi.fn(),
      removeVariable: vi.fn(),
    } as unknown as EditorBaseContextValue
    render(
      <React.StrictMode>
        <EditorProvider value={value}>
          <DatabaseWrapper {...props} />
        </EditorProvider>
      </React.StrictMode>,
    )
    expect(screen.getByDisplayValue('Met the guard')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Badges earned')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add switch/ }))
    expect((value as unknown as { addSwitch: ReturnType<typeof vi.fn> }).addSwitch).toHaveBeenCalledTimes(1)
  })

  it('SpritesWrapper renders the Sprites panel', () => {
    render(<SpritesWrapper {...props} />)
    expect(screen.getByTestId('sprites-panel')).toBeInTheDocument()
  })
})

describe('useDockviewLayout with the new panels', () => {
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    vi.restoreAllMocks()
  })

  it('does not open them by default', () => {
    const { hook } = mountLayout()
    expect(hook.result.current.openPanels).toEqual(DEFAULT_OPEN)
    expect(hook.result.current.isPanelOpen('database')).toBe(false)
    expect(hook.result.current.isPanelOpen('sprites')).toBe(false)
  })

  it('opens Database and Sprites as tabs next to the Tileset Browser', () => {
    const { hook, addPanel, panels } = mountLayout()
    act(() => hook.result.current.openPanel('database'))
    act(() => hook.result.current.openPanel('sprites'))
    const calls = addPanel.mock.calls.map((c) => c[0] as { id: string; component: string; title: string; position?: { referencePanel: unknown; direction: string } })
    const db = calls.find((c) => c.id === 'database')!
    expect(db).toMatchObject({ component: 'database', title: 'DATABASE', position: { direction: 'within' } })
    expect(db.position?.referencePanel).toBe(panels.get('tilesets'))
    const sp = calls.find((c) => c.id === 'sprites')!
    expect(sp).toMatchObject({ component: 'sprites', title: 'SPRITES', position: { direction: 'within' } })
    expect(sp.position?.referencePanel).toBe(panels.get('tilesets'))
    expect(hook.result.current.openPanels).toEqual(expect.arrayContaining(['database', 'sprites']))
  })

  it('activates an already open panel instead of adding it twice', () => {
    const { hook, addPanel, panels } = mountLayout()
    act(() => hook.result.current.openPanel('database'))
    const before = addPanel.mock.calls.length
    act(() => hook.result.current.openPanel('database'))
    expect(addPanel.mock.calls.length).toBe(before)
    expect(panels.get('database')!.api.setActive).toHaveBeenCalledTimes(1)
  })

  it('toggles and closes', () => {
    const { hook } = mountLayout()
    act(() => hook.result.current.togglePanel('database'))
    expect(hook.result.current.isPanelOpen('database')).toBe(true)
    act(() => hook.result.current.togglePanel('database'))
    expect(hook.result.current.isPanelOpen('database')).toBe(false)
    act(() => hook.result.current.openPanel('sprites'))
    act(() => hook.result.current.closePanel('sprites'))
    expect(hook.result.current.isPanelOpen('sprites')).toBe(false)
  })

  it('still opens when the whole right column is gone', () => {
    const { hook, panels } = mountLayout()
    act(() => {
      hook.result.current.closePanel('tilesets')
      hook.result.current.closePanel('preview')
      hook.result.current.closePanel('activeSelection')
    })
    expect(panels.has('tilesets')).toBe(false)
    act(() => hook.result.current.openPanel('database'))
    expect(panels.has('database')).toBe(true)
    // the second on-demand panel joins the first
    act(() => hook.result.current.openPanel('sprites'))
    expect(panels.has('sprites')).toBe(true)
  })

  it('reset layout restores the default layout (without the on-demand panels)', () => {
    const { hook } = mountLayout()
    act(() => hook.result.current.openPanel('database'))
    act(() => hook.result.current.openPanel('sprites'))
    act(() => hook.result.current.closePanel('maps'))
    act(() => hook.result.current.resetLayout())
    expect(hook.result.current.openPanels).toEqual(DEFAULT_OPEN)
    // and they can be opened again afterwards
    act(() => hook.result.current.openPanel('database'))
    expect(hook.result.current.isPanelOpen('database')).toBe(true)
  })

  it('responds to the menu path (electron IPC) and to the editor:toggle-panel event', () => {
    let toggle: ((id: string) => void) | undefined
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      onTogglePanel: (cb: (id: string) => void) => {
        toggle = cb
        return () => {}
      },
      onResetLayout: () => () => {},
    }
    const { hook } = mountLayout()
    act(() => toggle?.('database'))
    expect(hook.result.current.isPanelOpen('database')).toBe(true)
    act(() => {
      window.dispatchEvent(new CustomEvent('editor:toggle-panel', { detail: 'sprites' }))
    })
    expect(hook.result.current.isPanelOpen('sprites')).toBe(true)
  })

  describe('keyboard shortcuts', () => {
    it('Alt+D toggles Database, Alt+S toggles Sprites (by key code, so macOS Alt keys work)', () => {
      const { hook } = mountLayout()
      const event = new KeyboardEvent('keydown', { key: '∂', code: 'KeyD', altKey: true, cancelable: true, bubbles: true })
      act(() => {
        window.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(true)
      expect(hook.result.current.isPanelOpen('database')).toBe(true)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ß', code: 'KeyS', altKey: true, bubbles: true }))
      })
      expect(hook.result.current.isPanelOpen('sprites')).toBe(true)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '∂', code: 'KeyD', altKey: true, bubbles: true }))
      })
      expect(hook.result.current.isPanelOpen('database')).toBe(false)
    })

    it('ignores other combinations and typing in fields', () => {
      const { hook } = mountLayout()
      const input = document.createElement('input')
      document.body.appendChild(input)
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', altKey: true, bubbles: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', altKey: true, ctrlKey: true, bubbles: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', altKey: true, shiftKey: true, bubbles: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', altKey: true, bubbles: true }))
      })
      input.remove()
      expect(hook.result.current.isPanelOpen('database')).toBe(false)
    })

    it('stops listening after unmount', () => {
      const { hook } = mountLayout()
      hook.unmount()
      const event = new KeyboardEvent('keydown', { code: 'KeyD', altKey: true, cancelable: true, bubbles: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    })
  })

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
  })
})
