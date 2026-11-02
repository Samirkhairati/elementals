/* eslint-disable @typescript-eslint/no-explicit-any -- tests record react-konva nodes */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// react-konva needs a real canvas; here its nodes are recorded and rendered as plain elements.
const recorded: { kind: string; props: Record<string, any> }[] = []
vi.mock('react-konva', () => {
  const make = (kind: string) =>
    function Node({ children, ...props }: any) {
      recorded.push({ kind, props })
      return <div data-kind={kind}>{children}</div>
    }
  return { Group: make('Group'), Rect: make('Rect'), Shape: make('Shape') }
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
})
