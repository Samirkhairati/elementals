import { useEffect, useRef } from 'react'
import type { MapData } from '@/types/editor'
import { mapKey, mapSaveQueue, type SaveQueue } from '@/lib/saveQueue'

export interface UseMapAutosaveOptions {
  /** Defaults to the shared `mapSaveQueue`. */
  queue?: SaveQueue
  /** Defaults to `window.electronAPI.saveMap`. */
  save?: (map: MapData) => void | Promise<unknown>
}

const defaultSave = (map: MapData) => window.electronAPI?.saveMap(map.folderPath, map.fileName, map)

/**
 * The single place that persists maps. Watches the active map and, whenever its
 * serialised content differs from the last saved/baseline version, schedules a
 * debounced save on the queue.
 *
 *  - Selecting a different map flushes the previous one and records a baseline (no save).
 *  - The active map becoming `null` (deleted) cancels any pending save for it.
 *  - Pending saves are flushed on `beforeunload` and on unmount.
 */
export function useMapAutosave(activeMap: MapData | null, options: UseMapAutosaveOptions = {}) {
  const queue = options.queue ?? mapSaveQueue
  const saveRef = useRef(options.save ?? defaultSave)
  saveRef.current = options.save ?? defaultSave

  const tracked = useRef<{ key: string | null; json: string | null }>({ key: null, json: null })

  useEffect(() => {
    const prev = tracked.current

    if (!activeMap) {
      if (prev.key) queue.cancel(prev.key)
      tracked.current = { key: null, json: null }
      return
    }

    const key = mapKey(activeMap)
    const json = JSON.stringify(activeMap)

    if (prev.key !== key) {
      // New map identity: flush whatever was pending for the old one, baseline the new one.
      if (prev.key) void queue.flush(prev.key)
      tracked.current = { key, json }
      return
    }

    if (json === prev.json) return
    tracked.current = { key, json }
    const snapshot: MapData = { ...activeMap }
    queue.schedule(key, () => saveRef.current(snapshot))
  }, [activeMap, queue])

  useEffect(() => {
    const flush = () => {
      void queue.flushAll()
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [queue])
}
