import { afterEach, describe, expect, it, vi } from 'vitest'
import { openEventEditor } from './openEventEditor'

afterEach(() => vi.useRealTimers())

describe('openEventEditor', () => {
  it('dispatches the window event with the entity id, immediately or after a delay', () => {
    vi.useFakeTimers()
    const seen: string[] = []
    const l = (e: Event) => seen.push((e as CustomEvent<string>).detail)
    window.addEventListener('editor:open-event-editor', l)
    openEventEditor('a')
    expect(seen).toEqual(['a'])
    openEventEditor('b', 50)
    expect(seen).toEqual(['a'])
    vi.advanceTimersByTime(50)
    expect(seen).toEqual(['a', 'b'])
    window.removeEventListener('editor:open-event-editor', l)
  })
})
