/* eslint-disable @typescript-eslint/no-explicit-any -- tests record react-konva nodes */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

// react-konva needs a real canvas; here its nodes are recorded and rendered as plain elements.
const recorded: { kind: string; props: Record<string, any> }[] = []
vi.mock('react-konva', () => {
  const make = (kind: string) =>
    function Node({ children, ...props }: any) {
      recorded.push({ kind, props })
      return <div data-kind={kind}>{children}</div>
    }
  return { Group: make('Group'), Rect: make('Rect'), Shape: make('Shape'), Line: make('Line') }
})

import { KonvaImageItems } from './KonvaImageItems'
import { makeLayer } from '@/test/helpers'

const imageLayer = (id: string, over: Record<string, any> = {}) =>
  makeLayer(id, { type: 'image', name: id, images: [{ id: `${id}-1`, x: 32, y: 32, z: 0 }], ...over } as any)

const handles = () => recorded.filter((r) => r.kind === 'Group' && r.props.name === 'image-handle')
const down = (handle: { props: Record<string, any> }, evt: Record<string, any> = {}) => {
  const e = { cancelBubble: false, evt: { button: 0, shiftKey: false, ...evt } }
  handle.props.onMouseDown(e)
  return e
}

function renderItems(over: Record<string, any> = {}) {
  recorded.length = 0
  const props = { selectedImageId: null, setSelectedImageId: vi.fn(), moveImage: vi.fn(), snapToGrid: true, activateLayer: vi.fn(), ...over }
  render(<KonvaImageItems {...(props as any)} />)
  return props
}

beforeEach(() => (recorded.length = 0))

describe('KonvaImageItems', () => {
  it('only the active image layer has handles unless other layers are handed in', () => {
    renderItems({ layer: imageLayer('A'), otherLayers: [] })
    expect(handles()).toHaveLength(1)
    renderItems({ layer: imageLayer('A'), otherLayers: [imageLayer('B'), imageLayer('C')] })
    expect(handles()).toHaveLength(3)
  })

  it('leaves out hidden and locked layers among the others, and stacks the active layer last (on top)', () => {
    const at = (id: string, x: number, over: Record<string, any> = {}) => imageLayer(id, { images: [{ id: `${id}-1`, x, y: 32, z: 0 }], ...over })
    renderItems({ layer: at('A', 1), otherLayers: [at('B', 2, { visible: false }), at('C', 3, { locked: true }), at('D', 4)] })
    expect(handles().map((h) => h.props.x)).toEqual([4, 1])
  })

  it('picking an image of another layer makes its layer active first, then selects the image', () => {
    const calls: string[] = []
    const props = renderItems({
      layer: imageLayer('A'),
      otherLayers: [imageLayer('B')],
      activateLayer: (id: string) => calls.push(`layer:${id}`),
      setSelectedImageId: (id: string) => calls.push(`image:${id}`),
    })
    void props
    const e = down(handles()[0]) // B's handle is first
    expect(calls).toEqual(['layer:B', 'image:B-1'])
    expect(e.cancelBubble).toBe(true)
  })

  it('picking an image of the active layer does not re-activate it', () => {
    const props = renderItems({ layer: imageLayer('A'), otherLayers: [imageLayer('B')] })
    down(handles()[1])
    expect(props.activateLayer).not.toHaveBeenCalled()
    expect(props.setSelectedImageId).toHaveBeenCalledWith('A-1')
  })

  it('the selection frame shows on the active layer only, even if another layer reuses the id', () => {
    renderItems({ layer: imageLayer('A'), otherLayers: [imageLayer('B', { images: [{ id: 'A-1', x: 0, y: 0, z: 0 }] })], selectedImageId: 'A-1' })
    const frames = recorded.filter((r) => r.kind === 'Rect' && r.props.dash)
    expect(frames).toHaveLength(1)
  })

  it('Shift + left is left to the canvas (secondary click), and handles do not listen while placing', () => {
    const props = renderItems({ layer: imageLayer('A'), otherLayers: [] })
    const e = down(handles()[0], { shiftKey: true })
    expect(e.cancelBubble).toBe(false)
    expect(props.setSelectedImageId).not.toHaveBeenCalled()

    renderItems({ layer: imageLayer('A'), otherLayers: [], placing: true })
    expect(handles()[0].props.listening).toBe(false)
  })

  describe('Shift locks a drag to one axis', () => {
    const target = (x: number, y: number) => ({ _x: x, _y: y, x(v?: number) { if (v !== undefined) this._x = v; return this._x }, y(v?: number) { if (v !== undefined) this._y = v; return this._y }, getStage: () => null })
    const move = (handle: { props: Record<string, any> }, t: ReturnType<typeof target>, at: [number, number], shiftKey: boolean) => {
      t.x(at[0])
      t.y(at[1])
      act(() => handle.props.onDragMove({ cancelBubble: false, target: t, evt: { shiftKey } }))
    }
    const start = () => {
      const props = renderItems({ layer: imageLayer('A'), otherLayers: [], snapToGrid: false })
      const handle = handles()[0]
      const t = target(32, 32)
      act(() => handle.props.onDragStart({ cancelBubble: false, target: t, evt: { shiftKey: false } }))
      return { props, handle, t }
    }

    it('keeps the other coordinate where Shift went down, and shows two guide lines along the edges', () => {
      const { handle, t } = start()
      move(handle, t, [100, 100], true)
      expect([t.x(), t.y()]).toEqual([100, 100])
      move(handle, t, [160, 108], true)
      expect([t.x(), t.y()]).toEqual([160, 100])
      move(handle, t, [20, 300], true)
      expect([t.x(), t.y()]).toEqual([20, 100])
      const lines = recorded.filter((r) => r.kind === 'Line')
      expect(lines.length).toBeGreaterThanOrEqual(2)
      const last = lines.slice(-2).map((l) => l.props.points)
      // horizontal lines (same y at both ends), one per top / bottom edge of the picture
      expect(last.every((p: number[]) => p[1] === p[3])).toBe(true)
      expect(last[0][1]).not.toBe(last[1][1])
    })

    it('lets go of the lock when Shift is released, and the drop lands where the last move put it', () => {
      const { props, handle, t } = start()
      move(handle, t, [100, 100], true)
      move(handle, t, [160, 108], true)
      move(handle, t, [170, 140], false)
      expect([t.x(), t.y()]).toEqual([170, 140])
      act(() => handle.props.onDragEnd({ cancelBubble: false, target: t, evt: {} }))
      expect(props.moveImage).toHaveBeenCalledWith('A', 'A-1', 170, 140)
    })
  })

  describe('dragging a picked set (a group)', () => {
    const target = (x: number, y: number) => ({ _x: x, _y: y, x(v?: number) { if (v !== undefined) this._x = v; return this._x }, y(v?: number) { if (v !== undefined) this._y = v; return this._y }, getStage: () => null })
    const layer = () => imageLayer('A', { images: [{ id: 'g1', x: 32, y: 32, z: 0 }, { id: 'g2', x: 96, y: 64, z: 1 }, { id: 'solo', x: 200, y: 200, z: 2 }] })

    it('dragging a picked picture moves every picked one by the same amount, as one move, while the rest of the group follows in the preview', () => {
      const dragRef = { current: null as any }
      const moveImages = vi.fn()
      const props = renderItems({ layer: layer(), otherLayers: [], snapToGrid: false, pickedImageIds: ['g1', 'g2'], selectedImageId: 'g1', moveImages, dragRef })
      const handle = handles().find((h) => h.props.x === 32)!
      const t = target(32, 32)
      act(() => handle.props.onDragStart({ cancelBubble: false, target: t, evt: {} }))
      t.x(50)
      t.y(40)
      act(() => handle.props.onDragMove({ cancelBubble: false, target: t, evt: { shiftKey: false } }))
      expect(dragRef.current).toMatchObject({ id: 'g1', x: 50, y: 40, along: { ids: ['g1', 'g2'], dx: 18, dy: 8 } })
      act(() => handle.props.onDragEnd({ cancelBubble: false, target: t, evt: {} }))
      expect(moveImages).toHaveBeenCalledWith('A', ['g1', 'g2'], 18, 8)
      expect(props.moveImage).not.toHaveBeenCalled()
      expect(dragRef.current).toBeNull()
    })

    it('a picture outside the picked set, or a single pick, moves alone', () => {
      const moveImages = vi.fn()
      const props = renderItems({ layer: layer(), otherLayers: [], snapToGrid: false, pickedImageIds: ['g1', 'g2'], selectedImageId: 'g1', moveImages })
      const solo = handles().find((h) => h.props.x === 200)!
      const t = target(200, 200)
      act(() => solo.props.onDragStart({ cancelBubble: false, target: t, evt: {} }))
      t.x(210)
      act(() => solo.props.onDragMove({ cancelBubble: false, target: t, evt: { shiftKey: false } }))
      act(() => solo.props.onDragEnd({ cancelBubble: false, target: t, evt: {} }))
      expect(props.moveImage).toHaveBeenCalledWith('A', 'solo', 210, 200)
      expect(moveImages).not.toHaveBeenCalled()
    })
  })
})
