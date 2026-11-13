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
