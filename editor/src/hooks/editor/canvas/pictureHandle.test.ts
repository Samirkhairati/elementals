import { describe, expect, it } from 'vitest'
import { isPictureHandle, pictureHandleId } from './useCanvasInteraction'

// Konva needs a real canvas to build nodes; only name() and getParent() matter here.
interface Node { name(): string; getParent(): Node | null; getAttr(n: string): unknown }
const node = (name: string, parent: Node | null = null, imageId?: string): Node => ({ name: () => name, getParent: () => parent, getAttr: (n) => (n === 'imageId' ? imageId : undefined) })

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

describe('pictureHandleId', () => {
  it('is the id of the picture whose handle the node is, or is drawn inside', () => {
    const handle = node('image-handle', null, 'pic-1')
    expect(pictureHandleId(handle)).toBe('pic-1')
    expect(pictureHandleId(node('', handle))).toBe('pic-1')
  })

  it('is null for anything else', () => {
    expect(pictureHandleId(node('', node('entity')))).toBeNull()
    expect(pictureHandleId(node('image-handle'))).toBeNull()
    expect(pictureHandleId(null)).toBeNull()
  })
})
