/**
 * Debounced, per-key save queue.
 *
 * - `schedule(key, fn)` (re)starts a trailing debounce for `key`; the latest
 *   `fn` for a key always wins.
 * - `flush(key)` / `flushAll()` run pending work immediately and resolve once
 *   the corresponding in-flight saves have settled.
 * - `cancel(key)` drops pending (not yet started) work for a key.
 *
 * Saves for the same key never overlap: a new save waits for the previous one.
 */

export interface QueueTimers {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface SaveQueueOptions {
  delayMs?: number
  /** Injectable for tests; defaults to the (possibly faked) global timers, looked up lazily. */
  timers?: QueueTimers
  onError?: (key: string, error: unknown) => void
}

export type SaveFn = () => void | Promise<unknown>

export interface SaveQueue {
  schedule: (key: string, fn: SaveFn) => void
  flush: (key?: string) => Promise<void>
  flushAll: () => Promise<void>
  cancel: (key: string) => void
  hasPending: (key?: string) => boolean
}

export const DEFAULT_SAVE_DELAY_MS = 300

const defaultTimers: QueueTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createSaveQueue(options: SaveQueueOptions = {}): SaveQueue {
  const delayMs = options.delayMs ?? DEFAULT_SAVE_DELAY_MS
  const timers = options.timers ?? defaultTimers
  const onError =
    options.onError ??
    ((key: string, error: unknown) => {
      console.error(`[saveQueue] save failed for "${key}"`, error)
    })

  const pending = new Map<string, { fn: SaveFn; handle: unknown }>()
  const tails = new Map<string, Promise<void>>()

  const run = (key: string, fn: SaveFn): Promise<void> => {
    const previous = tails.get(key)
    const exec = (): Promise<unknown> => {
      try {
        return Promise.resolve(fn())
      } catch (error) {
        return Promise.reject(error)
      }
    }
    // Start synchronously when nothing is in flight for this key; otherwise queue behind it.
    const started = previous ? previous.then(exec) : exec()
    const next = started
      .then(
        () => undefined,
        error => onError(key, error)
      )
      .finally(() => {
        if (tails.get(key) === next) tails.delete(key)
      })
    tails.set(key, next)
    return next
  }

  const fire = (key: string): Promise<void> => {
    const entry = pending.get(key)
    if (!entry) return tails.get(key) ?? Promise.resolve()
    timers.clearTimeout(entry.handle)
    pending.delete(key)
    return run(key, entry.fn)
  }

  const flushAll = async (): Promise<void> => {
    for (const key of Array.from(pending.keys())) void fire(key)
    await Promise.all(Array.from(tails.values()))
  }

  return {
    schedule(key, fn) {
      const existing = pending.get(key)
      if (existing) timers.clearTimeout(existing.handle)
      const handle = timers.setTimeout(() => {
        void fire(key)
      }, delayMs)
      pending.set(key, { fn, handle })
    },

    flush(key) {
      if (key === undefined) return flushAll()
      return fire(key)
    },

    flushAll,

    cancel(key) {
      const entry = pending.get(key)
      if (!entry) return
      timers.clearTimeout(entry.handle)
      pending.delete(key)
    },

    hasPending(key) {
      return key === undefined ? pending.size > 0 : pending.has(key)
    },
  }
}

/** Identity of a map on disk. */
export function mapKey(map: { folderPath: string | null; fileName: string }): string {
  return `${map.folderPath ?? ''}/${map.fileName}`
}

/** Shared queue for map autosave; flushed before any IPC that moves/deletes files. */
export const mapSaveQueue: SaveQueue = createSaveQueue()
