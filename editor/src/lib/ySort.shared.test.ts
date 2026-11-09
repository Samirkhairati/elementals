import { describe, expect, it } from 'vitest'
import { inheritedLayerYSort, itemYSort, layerYSort } from '../../../shared/ySort'
import { convertEditorMapToTiled } from '../../../shared/mapExport'

const folder = (ySort?: boolean) => ({ id: 'f', type: 'folder', name: 'F', visible: true, ...(ySort === undefined ? {} : { ySort }) })
const imageLayer = (extra: Record<string, unknown> = {}) => ({ id: 'i', type: 'image', name: 'I', visible: true, folderId: 'f', images: [], ...extra })

describe('y-sort inheritance (shared/ySort)', () => {
  it('a layer follows its folder unless it says otherwise', () => {
    const layers = [folder(true), imageLayer()]
    expect(layerYSort(layers[1], layers)).toBe(true)
    expect(inheritedLayerYSort(layers[1], layers)).toBe(true)
    const off = [folder(true), imageLayer({ ySort: false })]
    expect(layerYSort(off[1], off)).toBe(false)
  })

  it('nothing set anywhere is off', () => {
    const layers = [folder(), imageLayer()]
    expect(layerYSort(layers[1], layers)).toBe(false)
  })

  it('a picture: its own setting, else its group, else its layer, else the folder', () => {
    const layer = imageLayer({ groups: [{ id: 'g', name: 'G', ySort: false }] })
    const layers = [folder(true), layer]
    expect(itemYSort({}, layer, layers)).toBe(true)
    expect(itemYSort({ groupId: 'g' }, layer, layers)).toBe(false)
    expect(itemYSort({ groupId: 'g', ySort: true }, layer, layers)).toBe(true)
  })

  it('the exporter writes the resolved flag on each picture', () => {
    const map = {
      name: 'm', width: 4, height: 4,
      layers: [folder(true), imageLayer({ images: [{ id: 'a', graphicId: 'p.png', x: 16, y: 32 }, { id: 'b', graphicId: 'p.png', x: 16, y: 32, ySort: false }] })],
    }
    const tiled = convertEditorMapToTiled(map as never, [])
    const objects = tiled.layers[0].objects!
    expect(objects[0].properties).toContainEqual({ name: 'ySort', type: 'bool', value: true })
    expect(objects[1].properties?.some((p) => p.name === 'ySort')).toBe(false)
  })
})
