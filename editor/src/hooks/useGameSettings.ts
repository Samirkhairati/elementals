import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultGameSettings, normalizeGameSettings, withSetting, type GameSettings, type SettingCategoryId } from '../../../shared/gameSettings'
import { createSaveQueue, DEFAULT_SAVE_DELAY_MS, type SaveQueue } from '@/lib/saveQueue'
import { runIpc } from '@/lib/opResult'

export interface UseGameSettingsOptions {
  /** Debounce before a change is written. Default 300 ms (the map autosave delay). */
  delayMs?: number
  /** Inject a queue (tests). Default: a private queue per hook instance. */
  queue?: SaveQueue
}

export interface UseGameSettings {
  /** null until the first load finished. */
  settings: GameSettings | null
  loading: boolean
  /** Last load/save failure, or null. */
  error: string | null
  /** True while a change waits for (or is in) the debounced save. */
  dirty: boolean
  /** Why the game's copy was not written after the last save (project copy, packaged editor, project errors); null when it was. */
  syncNote: string | null
  set: (category: SettingCategoryId, key: string, value: number | boolean) => void
  reset: () => void
  flush: () => Promise<void>
}

const SAVE_KEY = 'game-settings'

/**
 * The game settings (`project/game-settings.json`) with debounced autosave, like the database. Saving also copies them
 * to the game (`game/public/data/settings.json`), so a change is in the game as soon as it is saved.
 */
export function useGameSettings(options: UseGameSettingsOptions = {}): UseGameSettings {
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const ref = useRef<GameSettings | null>(null)

  const queue = useMemo(
    () => options.queue ?? createSaveQueue({ delayMs: options.delayMs ?? DEFAULT_SAVE_DELAY_MS }),
    // The queue identity must not change after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const save = useCallback(async () => {
    const current = ref.current
    if (!current) return
    const result = await runIpc(
      () => window.electronAPI?.saveGameSettings(current),
      (r) => ({ skipped: r.assets?.skipped ?? null })
    )
    if (!result.ok) {
      setError(result.error) // stays dirty: the next edit (or flush) tries again
      return
    }
    if (ref.current === current) setDirty(false)
    setError(null)
    setSyncNote(result.skipped)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await runIpc(
        () => window.electronAPI?.getGameSettings(),
        (r) => ({ stored: r.settings })
      )
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      ref.current = normalizeGameSettings(result.stored)
      setSettings(ref.current)
    })()
    const flushAll = () => void queue.flushAll()
    window.addEventListener('beforeunload', flushAll)
    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', flushAll)
      void queue.flushAll() // do not lose the last edit when the page closes
    }
  }, [queue])

  const change = useCallback(
    (next: GameSettings) => {
      ref.current = next
      setSettings(next)
      setDirty(true)
      queue.schedule(SAVE_KEY, save)
    },
    [queue, save]
  )

  const set = useCallback(
    (category: SettingCategoryId, key: string, value: number | boolean) => {
      const current = ref.current
      if (!current) return
      const next = withSetting(current, category, key, value)
      if (JSON.stringify(next) !== JSON.stringify(current)) change(next)
    },
    [change]
  )

  const reset = useCallback(() => {
    if (ref.current) change(defaultGameSettings())
  }, [change])

  const flush = useCallback(() => queue.flushAll(), [queue])

  return { settings, loading, error, dirty, syncNote, set, reset, flush }
}
