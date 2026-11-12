import { describe, expect, it, vi } from 'vitest'
import { trackWindowDrag, trackWindowPan } from './windowDrag'

const mouse = (type: string, init: MouseEventInit = {}) => window.dispatchEvent(new MouseEvent(type, init))

describe('trackWindowDrag', () => {
  it('follows moves until the button is released, then removes its listeners', () => {
    const move = vi.fn()
    const up = vi.fn()
    trackWindowDrag({ move, up })
    mouse('mousemove', { clientX: 3 })
    mouse('mouseup')
    mouse('mousemove', { clientX: 9 })
    mouse('mouseup')
    expect(move).toHaveBeenCalledTimes(1)
    expect(up).toHaveBeenCalledTimes(1)
  })

  it('with endButton, only that button ends it', () => {
    const up = vi.fn()
    trackWindowDrag({ move: () => {}, up, endButton: 1 })
    mouse('mouseup', { button: 0 })
    expect(up).not.toHaveBeenCalled()
    mouse('mouseup', { button: 1 })
    expect(up).toHaveBeenCalledTimes(1)
  })

  it('stopping early removes the listeners without calling up', () => {
    const move = vi.fn()
    const up = vi.fn()
    trackWindowDrag({ move, up })()
    mouse('mousemove')
    mouse('mouseup')
    expect(move).not.toHaveBeenCalled()
    expect(up).not.toHaveBeenCalled()
  })
})

describe('trackWindowPan', () => {
  it('reports the distance since the previous event, and the end', () => {
    const deltas: [number, number][] = []
    const onEnd = vi.fn()
    trackWindowPan({ clientX: 10, clientY: 10 }, (dx, dy) => deltas.push([dx, dy]), { onEnd })
    mouse('mousemove', { clientX: 15, clientY: 8 })
    mouse('mousemove', { clientX: 20, clientY: 8 })
    mouse('mouseup')
    expect(deltas).toEqual([
      [5, -2],
      [5, 0],
    ])
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
