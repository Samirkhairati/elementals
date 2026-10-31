import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { DockviewApi, DockviewReadyEvent } from 'dockview-react'

// Konva needs a real canvas; the dock registration does not care about the map canvas itself.
vi.mock('@/components/editor/canvas/MapCanvas', () => ({ MapCanvas: () => null }))

import { ALL_PANELS, DEFAULT_PANEL_IDS } from './types'
import { DatabaseWrapper, dockviewComponents } from './PanelWrappers'
import { useDockviewLayout } from './useDockviewLayout'
import { EditorProvider, type EditorBaseContextValue } from '../EditorContext'
import type { IDockviewPanelProps } from 'dockview-react'

interface FakePanel {
  id: string
  component: string
  api: { setSize: ReturnType<typeof vi.fn>; setActive: ReturnType<typeof vi.fn>; close: () => void; isActive: boolean }
  group: { api: { setVisible: ReturnType<typeof vi.fn> } }
}

function createFakeApi() {
  const panels = new Map<string, FakePanel>()
  const addPanel = vi.fn((opts: { id: string; component: string }) => {
    const panel: FakePanel = {
      id: opts.id,
      component: opts.component,
      api: { setSize: vi.fn(), setActive: vi.fn(), close: () => void panels.delete(opts.id), isActive: false },
      group: { api: { setVisible: vi.fn() } },
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

function mountLayout(options: { entityFocus?: boolean } = {}) {
  const fake = createFakeApi()
  const hook = renderHook((props: { entityFocus?: boolean }) => useDockviewLayout(props), { initialProps: options })
  act(() => {
    hook.result.current.onReady({ api: fake.api } as unknown as DockviewReadyEvent)
  })
  return { ...fake, hook }
}

const DEFAULT_OPEN = ['empty_canvas', 'maps', 'layers', 'entities', 'properties', 'tilesets', 'inspector', 'preview', 'activeSelection']

describe('panel registry', () => {
  it('lists the Database in the right column with its shortcut', () => {
    const database = ALL_PANELS.find((p) => p.id === 'database')
    expect(database).toEqual({ id: 'database', title: 'Database', column: 'right', shortcut: 'Alt+D' })
  })

  it('keeps the default layout unchanged: the new panels are on demand only', () => {
    expect(DEFAULT_PANEL_IDS).toEqual(['maps', 'layers', 'entities', 'properties', 'canvas', 'tilesets', 'preview', 'activeSelection'])
    expect(DEFAULT_PANEL_IDS).not.toContain('database')
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

})

describe('entity focus', () => {
  const visible = (panels: Map<string, FakePanel>, id: string) => panels.get(id)!.group.api.setVisible.mock.calls.at(-1)?.[0]

  it('shows the inspector instead of the tileset panels while an entity is selected, and back again', () => {
    const { hook, panels } = mountLayout({ entityFocus: false })
    expect(visible(panels, 'inspector')).toBe(false)
    expect(visible(panels, 'tilesets')).toBe(true)
    hook.rerender({ entityFocus: true })
    expect(visible(panels, 'inspector')).toBe(true)
    for (const id of ['tilesets', 'preview', 'activeSelection']) expect(visible(panels, id)).toBe(false)
    expect(visible(panels, 'maps')).toBeUndefined() // the left sidebar is untouched
    hook.rerender({ entityFocus: false })
    expect(visible(panels, 'inspector')).toBe(false)
    expect(visible(panels, 'tilesets')).toBe(true)
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
  })

  it('opens the Database as a tab next to the Tileset Browser', () => {
    const { hook, addPanel, panels } = mountLayout()
    act(() => hook.result.current.openPanel('database'))
    const calls = addPanel.mock.calls.map((c) => c[0] as { id: string; component: string; title: string; position?: { referencePanel: unknown; direction: string } })
    const db = calls.find((c) => c.id === 'database')!
    expect(db).toMatchObject({ component: 'database', title: 'DATABASE', position: { direction: 'within' } })
    expect(db.position?.referencePanel).toBe(panels.get('tilesets'))
    expect(hook.result.current.openPanels).toEqual(expect.arrayContaining(['database']))
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
  })

  it('reset layout restores the default layout (without the on-demand panels)', () => {
    const { hook } = mountLayout()
    act(() => hook.result.current.openPanel('database'))
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
      window.dispatchEvent(new CustomEvent('editor:toggle-panel', { detail: 'database' }))
    })
    expect(hook.result.current.isPanelOpen('database')).toBe(false) // toggled again
  })

  describe('keyboard shortcuts', () => {
    it('Alt+D toggles Database (by key code, so macOS Alt keys work)', () => {
      const { hook } = mountLayout()
      const event = new KeyboardEvent('keydown', { key: '∂', code: 'KeyD', altKey: true, cancelable: true, bubbles: true })
      act(() => {
        window.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(true)
      expect(hook.result.current.isPanelOpen('database')).toBe(true)
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
