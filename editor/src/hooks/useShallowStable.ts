import { useRef } from 'react'

/** True when both objects have the same keys and every value is the same (`Object.is`). */
export function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(ra[k], rb[k]))
}

/**
 * The same object as last render while none of its values changed, so it can be a context value or a dependency.
 * Use it instead of `useMemo(() => ({ ... }), [every, single, field])`: there is no dependency list to keep in step
 * with the object, so a new field can never be forgotten (which would leave consumers with a stale value).
 */
export function useShallowStable<T extends object>(value: T): T {
  const ref = useRef(value)
  if (!shallowEqual(ref.current, value)) ref.current = value
  return ref.current
}

/**
 * The same array as last render while it holds the same items (`Object.is`, in the same order): a list derived from a
 * bigger structure (the entities of the scene tree) keeps its identity while the structure changes elsewhere.
 */
export function useStableArray<T>(list: readonly T[]): readonly T[] {
  const ref = useRef(list)
  if (ref.current !== list && (ref.current.length !== list.length || ref.current.some((x, i) => !Object.is(x, list[i])))) ref.current = list
  return ref.current
}
