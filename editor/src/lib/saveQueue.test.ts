import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSaveQueue, mapKey, mapSaveQueue } from './saveQueue'

describe('saveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces: runs once, trailing, after the delay', () => {
    const q = createSaveQueue({ delayMs: 300 })
    const fn = vi.fn()
    q.schedule('a', fn)
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('restarts the timer on every schedule and keeps only the latest fn (last write wins)', () => {
    const q = createSaveQueue({ delayMs: 300 })
    const first = vi.fn()
    const second = vi.fn()
    q.schedule('a', first)
    vi.advanceTimersByTime(200)
    q.schedule('a', second)
    vi.advanceTimersByTime(200)
    expect(second).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('keeps keys independent', () => {
    const q = createSaveQueue({ delayMs: 100 })
    const a = vi.fn()
    const b = vi.fn()
    q.schedule('a', a)
    vi.advanceTimersByTime(50)
    q.schedule('b', b)
    vi.advanceTimersByTime(50)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('flush(key) runs pending work immediately, once, and clears the timer', async () => {
    const q = createSaveQueue({ delayMs: 300 })
    const fn = vi.fn()
    q.schedule('a', fn)
    await q.flush('a')
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(q.hasPending('a')).toBe(false)
  })

  it('flush of an unknown key is a no-op', async () => {
    const q = createSaveQueue()
    await expect(q.flush('nope')).resolves.toBeUndefined()
  })

  it('cancel drops pending work', () => {
    const q = createSaveQueue({ delayMs: 100 })
    const fn = vi.fn()
    q.schedule('a', fn)
    q.cancel('a')
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
    expect(q.hasPending()).toBe(false)
  })

  it('flushAll runs everything and resolves only after in-flight saves settle', async () => {
    const q = createSaveQueue({ delayMs: 300 })
    let resolveA!: () => void
    const done: string[] = []
    q.schedule('a', () => new Promise<void>(r => { resolveA = () => { done.push('a'); r() } }))
    q.schedule('b', () => { done.push('b') })

    let settled = false
    const p = q.flushAll().then(() => { settled = true })
    await Promise.resolve()
    await Promise.resolve()
    expect(done).toContain('b')
    expect(settled).toBe(false)
    resolveA()
    await p
    expect(settled).toBe(true)
    expect(done.sort()).toEqual(['a', 'b'])
  })

  it('flushAll waits for a save that already started from the timer', async () => {
    const q = createSaveQueue({ delayMs: 10 })
    let release!: () => void
    q.schedule('a', () => new Promise<void>(r => { release = r }))
    vi.advanceTimersByTime(10)
    let settled = false
    const p = q.flushAll().then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await p
    expect(settled).toBe(true)
  })

  it('never overlaps saves for the same key', async () => {
    const q = createSaveQueue({ delayMs: 10 })
    const order: string[] = []
    let releaseFirst!: () => void
    q.schedule('a', () => new Promise<void>(r => { order.push('first:start'); releaseFirst = () => { order.push('first:end'); r() } }))
    vi.advanceTimersByTime(10)
    await Promise.resolve()
    q.schedule('a', () => { order.push('second') })
    const p = q.flush('a')
    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    releaseFirst()
    await p
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('a failing save is reported and does not break the queue', async () => {
    const onError = vi.fn()
    const q = createSaveQueue({ delayMs: 10, onError })
    q.schedule('a', () => { throw new Error('boom') })
    await q.flush('a')
    expect(onError).toHaveBeenCalledWith('a', expect.any(Error))
    const fn = vi.fn()
    q.schedule('a', fn)
    await q.flush('a')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses injected timers', () => {
    const handles: Array<() => void> = []
    const q = createSaveQueue({
      delayMs: 5,
      timers: {
        setTimeout: fn => { handles.push(fn); return handles.length - 1 },
        clearTimeout: () => {},
      },
    })
    const fn = vi.fn()
    q.schedule('a', fn)
    expect(fn).not.toHaveBeenCalled()
    handles[0]()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('exposes a shared singleton and a stable map key', () => {
    expect(mapSaveQueue.schedule).toBeTypeOf('function')
    expect(mapKey({ folderPath: null, fileName: 'a.json' })).toBe('/a.json')
    expect(mapKey({ folderPath: 'x/y', fileName: 'a.json' })).toBe('x/y/a.json')
  })
})
