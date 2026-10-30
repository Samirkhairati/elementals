import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import { createSaveQueue, mapKey, mapSaveQueue } from '@/lib/saveQueue'
import { installElectronAPI, makeLayer, makeMap, uninstallElectronAPI } from '@/test/helpers'
import { useMapAutosave } from './useMapAutosave'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

const edited = (map: MapData, name: string): MapData => ({ ...map, layers: [makeLayer('L1', { name })] })

function setup(initial: MapData | null) {
  const queue = createSaveQueue({ delayMs: 300 })
  const save = vi.fn()
  const hook = renderHook(({ map }: { map: MapData | null }) => useMapAutosave(map, { queue, save }), {
    wrapper,
    initialProps: { map: initial },
  })
  return { ...hook, queue, save }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  uninstallElectronAPI()
})

describe('useMapAutosave', () => {
  it('does not save when a map is first loaded', () => {
    const { save } = setup(makeMap())
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('does not save when re-rendered with an identical (new object) map', () => {
    const map = makeMap()
    const { rerender, save } = setup(map)
    rerender({ map: { ...map } })
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('saves once, debounced, after edits (last version wins)', () => {
    const base = makeMap()
    const { rerender, save } = setup(base)
    rerender({ map: edited(base, 'one') })
    vi.advanceTimersByTime(200)
    rerender({ map: edited(base, 'two') })
    vi.advanceTimersByTime(200)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].layers[0].name).toBe('two')
  })

  it('persists through window.electronAPI.saveMap by default, with the map identity', async () => {
    const saveMap = vi.fn(() => Promise.resolve({ success: true }))
    installElectronAPI({ saveMap })
    const base = makeMap({ folderPath: 'world', fileName: 'town.json' })
    const { rerender } = renderHook(({ map }: { map: MapData | null }) => useMapAutosave(map), {
      wrapper,
      initialProps: { map: base },
    })
    rerender({ map: edited(base, 'x') })
    await mapSaveQueue.flushAll()
    expect(saveMap).toHaveBeenCalledTimes(1)
    const [folder, file, payload] = saveMap.mock.calls[0] as unknown as [string, string, MapData]
    expect(folder).toBe('world')
    expect(file).toBe('town.json')
    expect(payload.layers[0].name).toBe('x')
  })

  it('does not re-save content that was already saved', () => {
    const base = makeMap()
    const { rerender, save } = setup(base)
    const v1 = edited(base, 'one')
    rerender({ map: v1 })
    vi.advanceTimersByTime(300)
    expect(save).toHaveBeenCalledTimes(1)
    rerender({ map: { ...v1 } })
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('switching maps flushes the previous map immediately and baselines the new one without saving it', () => {
    const a = makeMap({ fileName: 'a.json' })
    const b = makeMap({ fileName: 'b.json', name: 'B' })
    const { rerender, save } = setup(a)
    rerender({ map: edited(a, 'pending') })
    expect(save).not.toHaveBeenCalled()

    rerender({ map: b })
    expect(save).toHaveBeenCalledTimes(1) // flushed A right away
    expect(save.mock.calls[0][0].fileName).toBe('a.json')

    vi.advanceTimersByTime(5000)
    expect(save).toHaveBeenCalledTimes(1) // B was only baselined

    rerender({ map: edited(b, 'b-edit') })
    vi.advanceTimersByTime(300)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0].fileName).toBe('b.json')
  })

  it('the same file name in a different folder is a different map', () => {
    const a = makeMap({ folderPath: null })
    const b = makeMap({ folderPath: 'sub' })
    expect(mapKey(a)).not.toBe(mapKey(b))
    const { rerender, save } = setup(a)
    rerender({ map: edited(a, 'x') })
    rerender({ map: b })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].folderPath).toBeNull()
  })

  it('cancels the pending save when the active map becomes null (deleted)', () => {
    const base = makeMap()
    const { rerender, save, queue } = setup(base)
    rerender({ map: edited(base, 'x') })
    expect(queue.hasPending()).toBe(true)
    rerender({ map: null })
    expect(queue.hasPending()).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('after null, reopening the same map baselines again instead of saving', () => {
    const base = makeMap()
    const { rerender, save } = setup(base)
    rerender({ map: null })
    rerender({ map: edited(base, 'reopened') })
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('flushes pending saves on beforeunload and on unmount', async () => {
    const base = makeMap()
    const { rerender, save, unmount } = setup(base)
    rerender({ map: edited(base, 'x') })
    window.dispatchEvent(new Event('beforeunload'))
    expect(save).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(0) // let the first save settle (same-key saves are serialised)
    rerender({ map: edited(base, 'y') })
    unmount()
    expect(save).toHaveBeenCalledTimes(2)
  })
})
