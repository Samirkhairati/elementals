import { describe, expect, it } from 'vitest'
import type { ImageGroup, ImageItem } from '@/types/editor'
import { expandLockedGroups, groupCopies, groupImages, imageRows, moveItems, pruneGroups, ungroupImages, uniqueGroupName } from './imageGroups'

const img = (id: string, groupId?: string, z?: number): ImageItem => ({ id, assetId: 'x', x: 0, y: 0, ...(groupId ? { groupId } : {}), ...(z !== undefined ? { z } : {}) })
const state = (images: ImageItem[], groups: ImageGroup[] = []) => ({ images, groups })

describe('uniqueGroupName', () => {
  it('numbers the second and later ones', () => {
    expect(uniqueGroupName('Group', [])).toBe('Group')
    expect(uniqueGroupName('Group', ['Group'])).toBe('Group 2')
    expect(uniqueGroupName('Group', ['Group', 'Group 2', 'Group 3'])).toBe('Group 4')
    expect(uniqueGroupName('Wall copy', ['Wall copy'])).toBe('Wall copy 2')
  })
})

describe('groupImages / ungroupImages', () => {
  it('groups at least two pictures into a new group', () => {
    const s = state([img('a'), img('b'), img('c')])
    const r = groupImages(s, ['a', 'c'], 'g1')!
    expect(r.groups).toEqual([{ id: 'g1', name: 'Group' }])
    expect(r.images.map((i) => i.groupId)).toEqual(['g1', undefined, 'g1'])
    expect(groupImages(s, ['a'], 'g1')).toBeNull()
    expect(groupImages(s, ['a', 'zzz'], 'g1')).toBeNull()
  })

  it('takes pictures out of their old group, and a group left empty goes away', () => {
    const s = state([img('a', 'old'), img('b', 'old'), img('c')], [{ id: 'old', name: 'Group' }])
    const r = groupImages(s, ['a', 'b', 'c'], 'new')!
    expect(r.groups.map((g) => g.id)).toEqual(['new'])
    expect(r.groups[0].name).toBe('Group 2') // the old name was taken when the new one was made
  })

  it('ungroup keeps every picture in place as a loose one, and drops the group', () => {
    const s = state([img('a', 'g'), img('b', 'g'), img('c', 'h')], [{ id: 'g', name: 'G' }, { id: 'h', name: 'H' }])
    const r = ungroupImages(s, 'g')
    expect(r.images.map((i) => i.groupId)).toEqual([undefined, undefined, 'h'])
    expect(r.groups.map((g) => g.id)).toEqual(['h'])
  })
})

describe('pruneGroups', () => {
  it('drops empty groups and forgets groups that no longer exist, and returns the same object when nothing changed', () => {
    const clean = state([img('a', 'g')], [{ id: 'g', name: 'G' }])
    expect(pruneGroups(clean)).toBe(clean)
    const dirty = state([img('a', 'gone'), img('b', 'g')], [{ id: 'g', name: 'G' }, { id: 'empty', name: 'E' }])
    const r = pruneGroups(dirty)
    expect(r.groups.map((g) => g.id)).toEqual(['g'])
    expect(r.images[0].groupId).toBeUndefined()
  })
})

describe('groupCopies', () => {
  const groups: ImageGroup[] = [{ id: 'g', name: 'Wall', locked: true }, { id: 'h', name: 'Roof' }]
  const source = [img('a', 'g'), img('b', 'g'), img('c', 'h'), img('d')]

  it('copies that shared a group share a new group again (same lock), loose ones stay loose', () => {
    let n = 0
    const r = groupCopies(source, groups, state([]), () => `new${++n}`)
    expect(r.groups).toEqual([{ id: 'new1', name: 'Wall copy', locked: true }, { id: 'new2', name: 'Roof copy' }])
    expect(r.items.map((i) => i.groupId)).toEqual(['new1', 'new1', 'new2', undefined])
  })

  it('names stay free in the target layer, and a picture of an unknown group becomes loose', () => {
    const r = groupCopies([img('a', 'g'), img('z', 'unknown')], groups, state([], [{ id: 'x', name: 'Wall copy' }]), () => 'n')
    expect(r.groups[0].name).toBe('Wall copy 2')
    expect(r.items[1].groupId).toBeUndefined()
  })
})

describe('expandLockedGroups', () => {
  const s = state([img('a', 'g'), img('b', 'g'), img('c', 'h'), img('d', 'h'), img('e')], [{ id: 'g', name: 'G', locked: true }, { id: 'h', name: 'H' }])

  it('a click on a member of a locked group picks the whole group', () => {
    expect(expandLockedGroups(['a'], s, null)).toEqual(['a', 'b'])
  })

  it('an unlocked group, a loose picture, and the open group are picked singly', () => {
    expect(expandLockedGroups(['c'], s, null)).toEqual(['c'])
    expect(expandLockedGroups(['e'], s, null)).toEqual(['e'])
    expect(expandLockedGroups(['a'], s, 'g')).toEqual(['a'])
  })

  it('keeps the list order and several picks together', () => {
    expect(expandLockedGroups(['e', 'b'], s, null)).toEqual(['a', 'b', 'e'])
  })
})

describe('moveItems', () => {
  it('moves only the given pictures', () => {
    const r = moveItems([{ ...img('a'), x: 10, y: 10 }, { ...img('b'), x: 5, y: 5 }], ['a'], 3, -4)
    expect(r.map((i) => [i.x, i.y])).toEqual([[13, 6], [5, 5]])
  })
})

describe('imageRows', () => {
  it('lists front first, a group once at its frontmost member with its members under it', () => {
    const images = [img('a', 'g', 1), img('b', undefined, 2), img('c', 'g', 3), img('d', undefined, 4)]
    const rows = imageRows(images, [{ id: 'g', name: 'G' }])
    expect(rows.map((r) => (r.kind === 'item' ? r.item.id : `group:${r.group.id}`))).toEqual(['d', 'group:g', 'b'])
    const group = rows[1]
    expect(group.kind === 'group' && group.members.map((m) => m.id)).toEqual(['c', 'a'])
  })

  it('a picture of a group that is not listed is a plain row', () => {
    const rows = imageRows([img('a', 'gone')], [])
    expect(rows).toEqual([{ kind: 'item', item: img('a', 'gone') }])
  })
})
