import { describe, it, expect } from 'vitest'
import { validateEditorMap, validateTiledMap } from '../../../shared/mapSchema'
import { convertEditorMapToTiled } from '../../../shared/mapExport'
import type { EditorMap } from '../../../shared/mapTypes'

const map = (layers: EditorMap['layers']): EditorMap => ({ name: 'm', width: 2, height: 2, layers })
const layers: EditorMap['layers'] = [
  { id: 'F', name: 'Scenery', type: 'folder', visible: true, collapsed: true },
  { id: 'a', name: 'Ground', type: 'tile', visible: true, folderId: 'F', data: {} },
  { id: 'b', name: 'Trees', type: 'image', visible: false, folderId: 'F', images: [] },
]

describe('layer folders in maps', () => {
  it('are valid, and the exported map has only the layers they hold (no folder rows)', () => {
    const m = map(layers)
    expect(validateEditorMap(m).errors).toEqual([])
    const tiled = convertEditorMapToTiled(m, [])
    expect(tiled.layers.map((l) => l.name)).toEqual(['Ground', 'Trees'])
    expect(validateTiledMap(tiled).errors).toEqual([])
    expect(tiled.layers[1].visible).toBe(false)
  })

  it('warn about a folderId that points nowhere or at a layer kind that cannot sit in a folder', () => {
    const w = validateEditorMap(map([layers[0], { ...layers[1], folderId: 'nope' }, { id: 'c', name: 'Col', type: 'collision', visible: true, folderId: 'F' }])).warnings
    expect(w.some((x) => x.includes('is not a folder'))).toBe(true)
    expect(w.some((x) => x.includes('only tile and image'))).toBe(true)
  })
})
