import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { CommonEvent } from '../../../shared/engine/common'
import { createGraph } from '../../../shared/engine/graph'
import { createSaveQueue } from '@/lib/saveQueue'
import { installElectronAPI, uninstallElectronAPI } from '@/test/helpers'
import { useCommonEvents } from './useCommonEvents'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
const ev = (id: string, name = id): CommonEvent => ({ version: 1, id, name, graph: createGraph() })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  uninstallElectronAPI()
})

async function setup(initial: CommonEvent[] = [ev('heal', 'Heal')]) {
  const getCommonEvents = vi.fn(() => Promise.resolve({ success: true, events: initial, warnings: [] }))
  const saveCommonEvent = vi.fn((e: CommonEvent) => Promise.resolve({ success: true, event: e }))
  const deleteCommonEvent = vi.fn(() => Promise.resolve({ success: true }))
  installElectronAPI({ getCommonEvents, saveCommonEvent, deleteCommonEvent } as never)
  const hook = renderHook(() => useCommonEvents({ queue: createSaveQueue({ delayMs: 300 }) }), { wrapper })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return { ...hook, saveCommonEvent, deleteCommonEvent }
}

describe('useCommonEvents', () => {
  it('loads the events', async () => {
    const { result } = await setup()
    expect(result.current.loading).toBe(false)
    expect(result.current.events.map((e) => e.id)).toEqual(['heal'])
    expect(result.current.getEvent('heal')?.name).toBe('Heal')
  })

  it('add creates a unique slug id and saves that event once after the debounce', async () => {
    const { result, saveCommonEvent } = await setup()
    let id = ''
    act(() => {
      id = result.current.addEvent('Heal')
    })
    expect(id).toBe('heal_2')
    act(() => result.current.renameEvent('heal_2', 'Heal more'))
    expect(saveCommonEvent).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(saveCommonEvent).toHaveBeenCalledTimes(1)
    expect(saveCommonEvent.mock.calls[0][0]).toMatchObject({ id: 'heal_2', name: 'Heal more' })
  })

  it('does not save an event with an empty name', async () => {
    const { result, saveCommonEvent } = await setup()
    act(() => result.current.renameEvent('heal', ''))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(saveCommonEvent).not.toHaveBeenCalled()
  })

  it('remove deletes the file and drops pending saves', async () => {
    const { result, saveCommonEvent, deleteCommonEvent } = await setup()
    act(() => result.current.renameEvent('heal', 'Healing'))
    act(() => result.current.removeEvent('heal'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(deleteCommonEvent).toHaveBeenCalledWith('heal')
    expect(saveCommonEvent).not.toHaveBeenCalled()
    expect(result.current.events).toEqual([])
  })

  it('folder paths are tidied and empty removes the key', async () => {
    const { result } = await setup()
    act(() => result.current.setEventFolder('heal', ' a / b/ '))
    expect(result.current.getEvent('heal')?.folder).toBe('a/b')
    act(() => result.current.setEventFolder('heal', ''))
    expect(result.current.getEvent('heal')).not.toHaveProperty('folder')
  })
})
