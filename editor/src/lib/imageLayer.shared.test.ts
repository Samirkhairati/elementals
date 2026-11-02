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

  it('accepts a picture item and rejects an item with both or neither', () => {
    const items = (images: NonNullable<EditorMap['layers'][number]['images']>) => validateEditorMap(map([{ ...imageLayer, images }])).errors
    expect(items([{ id: 'p', graphicId: 'scenery/clouds.png', x: 0, y: 0 }])).toEqual([])
    expect(items([{ id: 'p', assetId: 'tree', graphicId: 'a.png', x: 0, y: 0 }]).some((e) => e.includes('exactly one'))).toBe(true)
    expect(items([{ id: 'p', x: 0, y: 0 }]).some((e) => e.includes('exactly one'))).toBe(true)
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

  it('writes a picture as a `graphic` property instead of `sprite`', () => {
    const out = convertEditorMapToTiled(map([{ ...imageLayer, images: [{ id: 'p', graphicId: 'scenery/clouds.png', x: 8, y: 9 }] }]), [])
    const object = out.layers[0].objects![0]
    expect(object.name).toBe('scenery/clouds.png')
    expect(object.properties).toEqual([{ name: 'graphic', type: 'string', value: 'scenery/clouds.png' }])
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

  it('writes a crop as four int properties, and names the object after the item', () => {
    const out = convertEditorMapToTiled(map([{ ...imageLayer, images: [{ id: 'p', graphicId: 'sheet.png', name: 'Cloud', crop: { x: 32, y: 8, w: 16, h: 24 }, x: 8, y: 9, z: 1 }] }]), [])
    const object = out.layers[0].objects![0]
    expect(object.name).toBe('Cloud')
    expect(object.properties).toEqual([
      { name: 'graphic', type: 'string', value: 'sheet.png' },
      { name: 'cropX', type: 'int', value: 32 },
      { name: 'cropY', type: 'int', value: 8 },
      { name: 'cropW', type: 'int', value: 16 },
      { name: 'cropH', type: 'int', value: 24 },
      { name: 'z', type: 'int', value: 1 },
    ])
  })

  it('accepts a crop on a picture, rejects a bad one and a crop on a sprite', () => {
    const check = (item: Record<string, unknown>) =>
      validateEditorMap({ name: 'm', width: 2, height: 2, layers: [{ id: 'i', name: 'I', type: 'image', visible: true, images: [{ id: 'a', x: 0, y: 0, ...item }] }] }).errors
    expect(check({ graphicId: 's.png', crop: { x: 0, y: 0, w: 4, h: 4 } })).toEqual([])
    expect(check({ graphicId: 's.png', crop: { x: -1, y: 0, w: 4, h: 4 } })[0]).toMatch(/crop must be whole numbers/)
    expect(check({ graphicId: 's.png', crop: { x: 0, y: 0, w: 0, h: 4 } })[0]).toMatch(/crop must be whole numbers/)
    expect(check({ graphicId: 's.png', crop: { x: 0.5, y: 0, w: 4, h: 4 } })[0]).toMatch(/crop must be whole numbers/)
    expect(check({ assetId: 'objects/chest', crop: { x: 0, y: 0, w: 4, h: 4 } })[0]).toMatch(/only a picture/)
  })
})
