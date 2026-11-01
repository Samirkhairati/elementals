import { describe, it, expect } from 'vitest'
import { validateEditorMap, validateTiledMap } from '../../../shared/mapSchema'
import { convertEditorMapToTiled } from '../../../shared/mapExport'
import type { EditorMap } from '../../../shared/mapTypes'

const map = (layers: EditorMap['layers']): EditorMap => ({ name: 'm', width: 4, height: 4, layers })

const imageLayer: EditorMap['layers'][number] = {
  id: 'i1',
  name: 'Trees',
  type: 'image',
  visible: true,
  z: 3,
  images: [
    { id: 'b', assetId: 'tree', x: 80, y: 96, z: 2, scale: 2, flipX: true, flipY: true, opacity: 0.5 },
    { id: 'a', assetId: 'rock', x: 16, y: 32 },
  ],
}

describe('image layers: validation', () => {
  it('accepts a well-formed image layer', () => {
    const r = validateEditorMap(map([imageLayer]))
    expect(r.errors).toEqual([])
  })

  it('reports bad items', () => {
    const r = validateEditorMap(
      map([{ ...imageLayer, images: [{ id: 'x', assetId: '', x: Number.NaN, y: 0 }, { id: 'x', assetId: 'a', x: 0, y: 0, scale: 0 }] }])
    )
    expect(r.errors.some((e) => e.includes('assetId'))).toBe(true)
    expect(r.errors.some((e) => e.includes('x/y must be finite'))).toBe(true)
    expect(r.errors.some((e) => e.includes('duplicate image id'))).toBe(true)
    expect(r.errors.some((e) => e.includes('scale must be a positive number'))).toBe(true)
  })

  it('warns when a non-image layer carries images', () => {
    const r = validateEditorMap(map([{ id: 't', name: 't', type: 'tile', visible: true, images: [] }]))
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes('only image layers'))).toBe(true)
  })
})

describe('image layers: export', () => {
  const tiled = convertEditorMapToTiled(map([imageLayer]), [])

  it('becomes an object group marked as an image layer, keeping z', () => {
    const layer = tiled.layers[0]
    expect(layer.type).toBe('objectgroup')
    expect(layer.data).toBeUndefined()
    expect(layer.properties).toEqual([
      { name: 'kind', type: 'string', value: 'image' },
      { name: 'z', type: 'int', value: 3 },
    ])
  })

  it('writes one object per image in draw order, with unique ids', () => {
    const objects = tiled.layers[0].objects!
    expect(objects.map((o) => o.name)).toEqual(['rock', 'tree']) // tree has z 2, rock 0
    expect(new Set(objects.map((o) => o.id)).size).toBe(2)
    expect(tiled.nextobjectid).toBe(3)
    expect(objects[1]).toMatchObject({ x: 80, y: 96, type: 'image' })
    expect(objects[1].properties).toEqual([
      { name: 'sprite', type: 'string', value: 'tree' },
      { name: 'z', type: 'int', value: 2 },
      { name: 'scale', type: 'float', value: 2 },
      { name: 'flipX', type: 'bool', value: true },
      { name: 'flipY', type: 'bool', value: true },
      { name: 'opacity', type: 'float', value: 0.5 },
    ])
  })

  it('produces a map the game-side validator accepts', () => {
    expect(validateTiledMap(tiled).errors).toEqual([])
  })

  it('a map without image layers keeps nextobjectid 1', () => {
    expect(convertEditorMapToTiled(map([]), []).nextobjectid).toBe(1)
  })
})
