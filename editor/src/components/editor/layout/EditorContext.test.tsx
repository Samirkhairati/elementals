import { act, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import type { DockviewLayoutValue, EditorBaseContextValue } from './EditorContext'
import {
  EditorExtensionProvider,
  EditorProvider,
  shallowEqual,
  useEditorContext,
  useEditorSelector,
} from './EditorContext'

// Only the fields the tests touch are real; the rest of the (large) value is irrelevant here.
const NO_LAYERS: unknown[] = []
const NO_ENTITIES: unknown[] = []
const makeValue = (over: Partial<EditorBaseContextValue>): EditorBaseContextValue =>
  ({ layers: NO_LAYERS, entities: NO_ENTITIES, activeLayerId: null, ...over }) as unknown as EditorBaseContextValue

let setValue: (v: Partial<EditorBaseContextValue>) => void = () => {}

function Host({ children }: { children: React.ReactNode }) {
  const [value, set] = useState<Partial<EditorBaseContextValue>>({})
  setValue = v => set(prev => ({ ...prev, ...v }))
  return <EditorProvider value={makeValue(value)}>{children}</EditorProvider>
}

describe('useEditorSelector', () => {
  it('does not re-render a layers consumer when only entities change', () => {
    const layerRenders = vi.fn()
    const entityRenders = vi.fn()
    const layers = [{ id: 'L1' }] as unknown as EditorBaseContextValue['layers']

    function LayersView() {
      const l = useEditorSelector(c => c.layers)
      layerRenders()
      return <div data-testid="layers">{l.length}</div>
    }
    function EntitiesView() {
      const e = useEditorSelector(c => c.entities)
      entityRenders()
      return <div data-testid="entities">{e.length}</div>
    }

    render(
      <StrictMode>
        <Host>
          <LayersView />
          <EntitiesView />
        </Host>
      </StrictMode>
    )
    act(() => setValue({ layers }))
    expect(screen.getByTestId('layers').textContent).toBe('1')

    layerRenders.mockClear()
    entityRenders.mockClear()

    act(() => setValue({ entities: [{ id: 'e1' }] as unknown as EditorBaseContextValue['entities'] }))
    expect(screen.getByTestId('entities').textContent).toBe('1')
    expect(entityRenders).toHaveBeenCalled()
    expect(layerRenders).not.toHaveBeenCalled()
  })

  it('re-renders when the selected slice changes', () => {
    function View() {
      const id = useEditorSelector(c => c.activeLayerId)
      return <div data-testid="id">{id ?? 'none'}</div>
    }
    render(
      <Host>
        <View />
      </Host>
    )
    expect(screen.getByTestId('id').textContent).toBe('none')
    act(() => setValue({ activeLayerId: 'L2' }))
    expect(screen.getByTestId('id').textContent).toBe('L2')
  })

  it('shallow-compares object selections: a fresh object with equal fields does not re-render', () => {
    const renders = vi.fn()
    function View() {
      const s = useEditorSelector(c => ({ layers: c.layers, active: c.activeLayerId }))
      renders()
      return <div data-testid="v">{s.active ?? 'none'}</div>
    }
    render(
      <Host>
        <View />
      </Host>
    )
    renders.mockClear()
    act(() => setValue({ entities: [{ id: 'x' }] as unknown as EditorBaseContextValue['entities'] }))
    expect(renders).not.toHaveBeenCalled()
    act(() => setValue({ activeLayerId: 'L9' }))
    expect(screen.getByTestId('v').textContent).toBe('L9')
  })

  it('honours a custom equality function', () => {
    const renders = vi.fn()
    function View() {
      const n = useEditorSelector(
        c => c.layers.length,
        (a, b) => Math.floor(a / 10) === Math.floor(b / 10)
      )
      renders()
      return <div>{n}</div>
    }
    render(
      <Host>
        <View />
      </Host>
    )
    renders.mockClear()
    act(() => setValue({ layers: new Array(3).fill({ id: 'x' }) as unknown as EditorBaseContextValue['layers'] }))
    expect(renders).not.toHaveBeenCalled()
  })

  it('works with an inline (unstable) selector without looping', () => {
    function View() {
      const l = useEditorSelector(c => ({ n: c.layers.length }))
      return <div data-testid="n">{l.n}</div>
    }
    render(
      <StrictMode>
        <Host>
          <View />
        </Host>
      </StrictMode>
    )
    act(() => setValue({ layers: [{ id: 'a' }] as unknown as EditorBaseContextValue['layers'] }))
    expect(screen.getByTestId('n').textContent).toBe('1')
  })

  it('throws a helpful error outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function View() {
      useEditorSelector(c => c.layers)
      return null
    }
    expect(() => render(<View />)).toThrow(/EditorProvider/)
    spy.mockRestore()
  })
})

describe('useEditorContext', () => {
  it('returns the full value and subscribes to every change', () => {
    const renders = vi.fn()
    function View() {
      const ctx = useEditorContext()
      renders()
      return (
        <div data-testid="full">
          {ctx.layers.length}/{ctx.entities.length}/{ctx.activeLayerId ?? 'none'}
        </div>
      )
    }
    render(
      <StrictMode>
        <Host>
          <View />
        </Host>
      </StrictMode>
    )
    expect(screen.getByTestId('full').textContent).toBe('0/0/none')
    act(() => setValue({ entities: [{ id: 'e' }] as unknown as EditorBaseContextValue['entities'] }))
    expect(screen.getByTestId('full').textContent).toBe('0/1/none')
    act(() => setValue({ activeLayerId: 'L' }))
    expect(screen.getByTestId('full').textContent).toBe('0/1/L')
    expect(renders.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('EditorExtensionProvider', () => {
  const ext = (over: Partial<DockviewLayoutValue> = {}): DockviewLayoutValue => ({
    openPanels: ['maps'],
    openPanel: () => {},
    closePanel: () => {},
    togglePanel: () => {},
    resetLayout: () => {},
    openMapTab: () => {},
    closeMapTab: () => {},
    isPanelOpen: () => true,
    ...over,
  })

  it('layers extra fields over the parent value and follows both sources', () => {
    let setExt: (v: DockviewLayoutValue) => void = () => {}
    function Ext({ children }: { children: React.ReactNode }) {
      const [e, set] = useState(ext())
      setExt = set
      return <EditorExtensionProvider extension={e}>{children}</EditorExtensionProvider>
    }
    function View() {
      const s = useEditorSelector(c => ({ panels: c.openPanels.join(','), active: c.activeLayerId }))
      return (
        <div data-testid="v">
          {s.panels}|{s.active ?? 'none'}
        </div>
      )
    }
    render(
      <StrictMode>
        <Host>
          <Ext>
            <View />
          </Ext>
        </Host>
      </StrictMode>
    )
    expect(screen.getByTestId('v').textContent).toBe('maps|none')
    act(() => setValue({ activeLayerId: 'L1' }))
    expect(screen.getByTestId('v').textContent).toBe('maps|L1')
    act(() => setExt(ext({ openPanels: ['maps', 'layers'] })))
    expect(screen.getByTestId('v').textContent).toBe('maps,layers|L1')
  })

  it('a parent change does not re-render consumers of unrelated extension fields', () => {
    const renders = vi.fn()
    function View() {
      const openPanels = useEditorSelector(c => c.openPanels)
      renders()
      return <div>{openPanels.length}</div>
    }
    const stable = ext()
    render(
      <Host>
        <EditorExtensionProvider extension={stable}>
          <View />
        </EditorExtensionProvider>
      </Host>
    )
    renders.mockClear()
    act(() => setValue({ activeLayerId: 'zzz' }))
    expect(renders).not.toHaveBeenCalled()
  })
})

describe('shallowEqual', () => {
  it('compares primitives, arrays and objects one level deep', () => {
    expect(shallowEqual(1, 1)).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false)
    expect(shallowEqual([1, 2], [1, 2])).toBe(true)
    expect(shallowEqual([1], [1, 2])).toBe(false)
    expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false)
    expect(shallowEqual(null, {})).toBe(false)
    expect(shallowEqual([], {})).toBe(false)
  })
})
