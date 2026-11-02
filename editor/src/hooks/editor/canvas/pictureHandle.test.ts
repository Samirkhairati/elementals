import { describe, expect, it } from 'vitest'
import { isPictureHandle } from './useCanvasInteraction'

// Konva needs a real canvas to build nodes; only name() and getParent() matter here.
interface Node { name(): string; getParent(): Node | null }
const node = (name: string, parent: Node | null = null): Node => ({ name: () => name, getParent: () => parent })

describe('isPictureHandle', () => {
  it('is true for a picture handle and for anything drawn inside one', () => {
    const handle = node('image-handle')
    expect(isPictureHandle(handle)).toBe(true)
    expect(isPictureHandle(node('', handle))).toBe(true)
  })

  it('is false for entities and other nodes, so they keep their own right-click', () => {
    expect(isPictureHandle(node('', node('entity')))).toBe(false)
    expect(isPictureHandle(null)).toBe(false)
  })
})
