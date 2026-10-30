import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Returns a referentially stable function that always invokes the latest `fn`.
 * Only call the result from event handlers / effects (never during render).
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}
