import { useCallback, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

/**
 * `useState` plus a ref that always holds the latest value, updated *synchronously*
 * by the setter. This lets event handlers compute the next state from the ref
 * (outside of React updaters, which must stay pure and are double-invoked in
 * StrictMode) and compose correctly when called several times in one tick.
 *
 * The returned setter is referentially stable.
 */
export function useSyncedState<T>(
  initial: T | (() => T)
): [T, Dispatch<SetStateAction<T>>, MutableRefObject<T>] {
  const [state, setState] = useState<T>(initial)
  const ref = useRef<T>(state)

  const set = useCallback((value: SetStateAction<T>) => {
    const next = typeof value === 'function' ? (value as (prev: T) => T)(ref.current) : value
    ref.current = next
    setState(next)
  }, [])

  return [state, set, ref]
}
