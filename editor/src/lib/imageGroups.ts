// Groups of pictures inside one image layer: a group is a named set that is picked, duplicated and moved together. A locked
// group is picked as a whole by a click on any member, until the group itself is the selected one (then a click picks a
// single member). Groups are made freely (empty ones too) and only go away when they are ungrouped or deleted; pictures
// move in and out of them. Editor view only: the exported map and the game know nothing about groups.

import type { ImageGroup, ImageItem } from '@/types/editor'
import { sortedImages } from './layerOrder'

export interface GroupState {
  images: ImageItem[]
  groups: ImageGroup[]
}

/** "Group", "Group 2", ...: the first name not in `taken`. */
export function uniqueGroupName(base: string, taken: readonly string[]): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  const stem = base.replace(/ \d+$/, '')
  for (let n = 2; ; n++) if (!used.has(`${stem} ${n}`)) return `${stem} ${n}`
}

/** Members of a group, in the layer's list order. */
export const membersOf = (images: readonly ImageItem[], groupId: string): ImageItem[] => images.filter((i) => i.groupId === groupId)

/** Pictures whose group is gone no longer point at it (empty groups stay: they are made on purpose). */
export function pruneGroups(state: GroupState): GroupState {
  const ids = new Set(state.groups.map((g) => g.id))
  const images: ImageItem[] = state.images.some((i) => i.groupId !== undefined && !ids.has(i.groupId))
    ? state.images.map((i) => {
        if (i.groupId === undefined || ids.has(i.groupId)) return i
        const { groupId: _gone, ...rest } = i
        return rest
      })
    : state.images
  return images === state.images ? state : { images, groups: state.groups }
}

/** A new, empty group ("Group", "Group 2", ...). */
export function createGroup(state: GroupState, newId: string): GroupState & { groupId: string } {
  const name = uniqueGroupName('Group', state.groups.map((g) => g.name))
  return { images: state.images, groups: [...state.groups, { id: newId, name }], groupId: newId }
}

/** The pictures `ids` moved into `groupId`, or out of whatever group they are in (null). Null when nothing changes. */
export function setGroupOf(state: GroupState, ids: readonly string[], groupId: string | null): GroupState | null {
  if (groupId !== null && !state.groups.some((g) => g.id === groupId)) return null
  const wanted = new Set(ids)
  let changed = false
  const images = state.images.map((i) => {
    if (!wanted.has(i.id) || (i.groupId ?? null) === groupId) return i
    changed = true
    if (groupId !== null) return { ...i, groupId }
    const { groupId: _out, ...rest } = i
    return rest
  })
  return changed ? { images, groups: state.groups } : null
}

/** A group deleted together with its pictures. */
export function deleteGroup(state: GroupState, groupId: string): GroupState & { removed: string[] } {
  const removed = state.images.filter((i) => i.groupId === groupId).map((i) => i.id)
  return { images: state.images.filter((i) => i.groupId !== groupId), groups: state.groups.filter((g) => g.id !== groupId), removed }
}

/**
 * Puts the pictures `ids` into one new group (taking them out of any group they were in). Needs at least one picture;
 * returns null otherwise.
 */
export function groupImages(state: GroupState, ids: readonly string[], newId: string): (GroupState & { groupId: string }) | null {
  const wanted = new Set(ids)
  if (!state.images.some((i) => wanted.has(i.id))) return null
  const name = uniqueGroupName('Group', state.groups.map((g) => g.name))
  const images = state.images.map((i) => (wanted.has(i.id) ? { ...i, groupId: newId } : i))
  const next = pruneGroups({ images, groups: [...state.groups, { id: newId, name }] })
  return { ...next, groupId: newId }
}

/** Dissolves a group: its pictures stay where they are, as plain pictures. */
export function ungroupImages(state: GroupState, groupId: string): GroupState {
  return pruneGroups({
    images: state.images.map((i) => {
      if (i.groupId !== groupId) return i
      const { groupId: _gone, ...rest } = i
      return rest
    }),
    groups: state.groups.filter((g) => g.id !== groupId),
  })
}

/**
 * Copies of the pictures `source` for pasting into a layer that has `state`: the pictures that shared a group share a new
 * group again ("Wall copy"), taken from `sourceGroups`; pictures of no (known) group stay loose.
 */
export function groupCopies(source: readonly ImageItem[], sourceGroups: readonly ImageGroup[], state: GroupState, newGroupId: () => string): { items: ImageItem[]; groups: ImageGroup[] } {
  const known = new Map(sourceGroups.map((g) => [g.id, g]))
  const made = new Map<string, ImageGroup>()
  const taken = state.groups.map((g) => g.name)
  const items = source.map((item) => {
    const old = item.groupId ? known.get(item.groupId) : undefined
    if (!old) {
      const { groupId: _none, ...rest } = item
      return rest
    }
    let group = made.get(old.id)
    if (!group) {
      const name = uniqueGroupName(`${old.name} copy`, taken)
      taken.push(name)
      group = { id: newGroupId(), name, ...(old.locked ? { locked: true } : {}) }
      made.set(old.id, group)
    }
    return { ...item, groupId: group.id }
  })
  return { items, groups: [...made.values()] }
}

/**
 * The pictures a click should pick: `ids`, plus every member of a locked group one of them belongs to, unless that group is
 * the open one (its row was selected), where single members can be picked.
 */
export function expandLockedGroups(ids: readonly string[], state: GroupState, openGroupId: string | null): string[] {
  const out = new Set(ids)
  const locked = new Set(state.groups.filter((g) => g.locked && g.id !== openGroupId).map((g) => g.id))
  for (const item of state.images) {
    if (ids.includes(item.id) && item.groupId && locked.has(item.groupId)) for (const m of membersOf(state.images, item.groupId)) out.add(m.id)
  }
  return state.images.filter((i) => out.has(i.id)).map((i) => i.id)
}

/** Every picture of `ids` moved by (dx, dy). */
export const moveItems = (images: readonly ImageItem[], ids: readonly string[], dx: number, dy: number): ImageItem[] => {
  const moving = new Set(ids)
  return images.map((i) => (moving.has(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i))
}

export type ImageRow = { kind: 'item'; item: ImageItem } | { kind: 'group'; group: ImageGroup; members: ImageItem[] }

/**
 * The rows of the pictures list, front first: a group is one row (with its members under it) where its frontmost member
 * is, an empty group sits on top (newest first); everything else is a row of its own.
 */
export function imageRows(images: readonly ImageItem[], groups: readonly ImageGroup[]): ImageRow[] {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const front = sortedImages([...images]).reverse()
  const done = new Set<string>()
  const used = new Set(images.map((i) => i.groupId))
  const rows: ImageRow[] = groups.filter((g) => !used.has(g.id)).reverse().map((group) => ({ kind: 'group', group, members: [] }))
  for (const item of front) {
    const group = item.groupId ? byId.get(item.groupId) : undefined
    if (!group) {
      rows.push({ kind: 'item', item })
    } else if (!done.has(group.id)) {
      done.add(group.id)
      rows.push({ kind: 'group', group, members: front.filter((i) => i.groupId === group.id) })
    }
  }
  return rows
}
