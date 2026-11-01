// The "snap to tile size" switch of the entity inspector (the magnet next to the collider and sprite placement). One
// value for the whole editor, remembered in this browser; it works without storage too.

import { useSyncExternalStore } from 'react'

const KEY = 'editor.snapToTile'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let on = read()
const listeners = new Set<() => void>()

export function getSnapToTile(): boolean {
  return on
}

export function setSnapToTile(next: boolean): void {
  if (next === on) return
  on = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    /* blocked storage: the choice just is not remembered */
  }
  for (const l of [...listeners]) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function useSnapToTile(): [boolean, (next: boolean) => void] {
  return [useSyncExternalStore(subscribe, getSnapToTile, getSnapToTile), setSnapToTile]
}

/** `value` moved to the nearest multiple of `step`; with `min` never below it (a size cannot snap to nothing). */
export function snapValue(value: number, step: number, min?: number): number {
  const v = Math.round(value / step) * step || 0 // no -0
  return min === undefined ? v : Math.max(min, v)
}
