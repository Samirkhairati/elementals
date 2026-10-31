import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { GameDatabase } from '../../../shared/engine/types'
import { createSaveQueue } from '@/lib/saveQueue'
import { installElectronAPI, uninstallElectronAPI } from '@/test/helpers'
import { idFromName, useDatabase } from './useDatabase'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

const initial = (): GameDatabase => ({
  version: 2,
  switches: [{ id: 'intro_done', name: 'Intro done' }],
  variables: [{ id: 'badges', name: 'Badges', initial: 0 }],
  stages: [],
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  uninstallElectronAPI()
})

async function setup(db: GameDatabase = initial(), overrides: Record<string, unknown> = {}) {
  const getDatabase = vi.fn(() => Promise.resolve({ success: true, database: db }))
  const saveDatabase = vi.fn((d: GameDatabase) => Promise.resolve({ success: true, database: d }))
  installElectronAPI({ getDatabase, saveDatabase, ...overrides } as never)
  const hook = renderHook(() => useDatabase({ queue: createSaveQueue({ delayMs: 300 }) }), { wrapper })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return { ...hook, getDatabase, saveDatabase }
}

const lastSaved = (save: ReturnType<typeof vi.fn>): GameDatabase => save.mock.calls[save.mock.calls.length - 1][0]

describe('useDatabase', () => {
  it('loads the database', async () => {
    const { result } = await setup()
    expect(result.current.loading).toBe(false)
    expect(result.current.database).toEqual(initial())
    expect(result.current.switches).toHaveLength(1)
    expect(result.current.getSwitch('intro_done')?.name).toBe('Intro done')
    expect(result.current.getVariable('badges')?.initial).toBe(0)
    expect(result.current.getSwitch('zzz')).toBeUndefined()
  })

  it('reports a load failure and does not crash edits', async () => {
    installElectronAPI({ getDatabase: () => Promise.resolve({ success: false, error: 'corrupt' }) } as never)
    const { result } = renderHook(() => useDatabase(), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.error).toBe('corrupt')
    expect(result.current.database).toBeNull()
    expect(result.current.switches).toEqual([])
    act(() => {
      expect(result.current.addSwitch('x')).toBe('')
    })
    expect(result.current.database).toBeNull()
  })

  it('does not save on load', async () => {
    const { saveDatabase } = await setup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(saveDatabase).not.toHaveBeenCalled()
  })

  it('adds switches and variables with unique ids derived from the name', async () => {
    const { result } = await setup()
    let ids: string[] = []
    act(() => {
      ids = [result.current.addSwitch('Intro done'), result.current.addSwitch('Intro done'), result.current.addSwitch(), result.current.addSwitch('Café!')]
    })
    expect(ids).toEqual(['intro_done_2', 'intro_done_3', 'switch', 'cafe'])
    expect(result.current.switches.map((s) => s.name)).toEqual(['Intro done', 'Intro done', 'Intro done', 'Switch 4', 'Café!'])
    act(() => {
      ids = [result.current.addVariable('Steps', 5), result.current.addVariable()]
    })
    expect(ids).toEqual(['steps', 'variable'])
    expect(result.current.variables.map((v) => [v.id, v.name, v.initial])).toEqual([
      ['badges', 'Badges', 0],
      ['steps', 'Steps', 5],
      ['variable', 'Variable 3', 0],
    ])
  })

  it('renames, changes the initial value and removes', async () => {
    const { result } = await setup()
    act(() => {
      result.current.renameSwitch('intro_done', 'Intro finished')
      result.current.renameVariable('badges', 'Gym badges')
      result.current.setVariableInitial('badges', 3)
    })
    expect(result.current.getSwitch('intro_done')?.name).toBe('Intro finished')
    expect(result.current.getVariable('badges')).toEqual({ id: 'badges', name: 'Gym badges', initial: 3 })
    act(() => {
      result.current.setVariableInitial('badges', NaN) // ignored
      result.current.renameSwitch('missing', 'x') // ignored
      result.current.removeSwitch('intro_done')
      result.current.removeVariable('badges')
    })
    expect(result.current.database).toEqual({ version: 2, switches: [], variables: [], stages: [] })
  })

  describe('stages', () => {
    it('addStage creates a stage with two values and a unique id', async () => {
      const { result } = await setup()
      let first = ''
      let second = ''
      act(() => {
        first = result.current.addStage('Lost cat')
        second = result.current.addStage('Lost cat')
      })
      expect(first).toBe('lost_cat')
      expect(second).toBe('lost_cat_2')
      expect(result.current.getStage('lost_cat')).toEqual({
        id: 'lost_cat',
        name: 'Lost cat',
        values: [
          { id: 'not_started', name: 'Not started' },
          { id: 'done', name: 'Done' },
        ],
        initial: 'not_started',
      })
    })

    it('adds, renames, orders and removes values; a stage keeps at least one', async () => {
      const { result } = await setup()
      act(() => void result.current.addStage('Cat'))
      let accepted = ''
      act(() => {
        accepted = result.current.addStageValue('cat', 'Accepted')
      })
      expect(accepted).toBe('accepted')
      act(() => result.current.moveStageValue('cat', 'accepted', -1))
      expect(result.current.getStage('cat')?.values.map((v) => v.id)).toEqual(['not_started', 'accepted', 'done'])
      act(() => {
        result.current.moveStageValue('cat', 'not_started', -1) // already first: ignored
        result.current.moveStageValue('cat', 'done', 1) // already last: ignored
        result.current.renameStageValue('cat', 'accepted', 'Taken on')
      })
      expect(result.current.getStage('cat')?.values.map((v) => v.name)).toEqual(['Not started', 'Taken on', 'Done'])
      act(() => result.current.removeStageValue('cat', 'accepted'))
      act(() => result.current.removeStageValue('cat', 'done'))
      act(() => result.current.removeStageValue('cat', 'not_started')) // the last one stays
      expect(result.current.getStage('cat')?.values.map((v) => v.id)).toEqual(['not_started'])
    })

    it('removing the starting value moves the start to the first value; setStageInitial validates', async () => {
      const { result } = await setup()
      act(() => void result.current.addStage('Cat'))
      act(() => result.current.setStageInitial('cat', 'done'))
      expect(result.current.getStage('cat')?.initial).toBe('done')
      act(() => result.current.setStageInitial('cat', 'nope')) // ignored
      expect(result.current.getStage('cat')?.initial).toBe('done')
      act(() => result.current.removeStageValue('cat', 'done'))
      expect(result.current.getStage('cat')?.initial).toBe('not_started')
    })

    it('renames and removes a stage', async () => {
      const { result } = await setup()
      act(() => void result.current.addStage('Cat'))
      act(() => result.current.renameStage('cat', 'The cat'))
      expect(result.current.getStage('cat')?.name).toBe('The cat')
      act(() => result.current.removeStage('cat'))
      expect(result.current.stages).toEqual([])
    })

    it('setFolder tidies the path and an empty folder removes it', async () => {
      const { result } = await setup()
      act(() => void result.current.addStage('Cat'))
      act(() => {
        result.current.setFolder('stage', 'cat', ' Quests / Cat ')
        result.current.setFolder('switch', 'intro_done', 'Story')
        result.current.setFolder('variable', 'badges', 'Gyms')
      })
      expect(result.current.getStage('cat')?.folder).toBe('Quests/Cat')
      expect(result.current.getSwitch('intro_done')?.folder).toBe('Story')
      expect(result.current.getVariable('badges')?.folder).toBe('Gyms')
      act(() => result.current.setFolder('stage', 'cat', ''))
      expect(result.current.getStage('cat')).not.toHaveProperty('folder')
    })

    it('does not save while a stage or value name is empty', async () => {
      const { result, saveDatabase } = await setup()
      act(() => void result.current.addStage('Cat'))
      act(() => result.current.renameStageValue('cat', 'done', ''))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(saveDatabase).not.toHaveBeenCalled()
      act(() => result.current.renameStageValue('cat', 'done', 'Finished'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(saveDatabase).toHaveBeenCalledTimes(1)
    })
  })

  it('debounces: many edits produce one save with the final state', async () => {
    const { result, saveDatabase } = await setup()
    act(() => result.current.renameSwitch('intro_done', 'A'))
    expect(result.current.dirty).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    act(() => result.current.renameSwitch('intro_done', 'AB'))
    act(() => {
      result.current.addVariable('Steps')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299)
    })
    expect(saveDatabase).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(saveDatabase).toHaveBeenCalledTimes(1)
    expect(lastSaved(saveDatabase).switches[0].name).toBe('AB')
    expect(lastSaved(saveDatabase).variables.map((v) => v.id)).toEqual(['badges', 'steps'])
    expect(result.current.dirty).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('flush writes immediately', async () => {
    const { result, saveDatabase } = await setup()
    act(() => result.current.removeSwitch('intro_done'))
    await act(async () => {
      await result.current.flush()
    })
    expect(saveDatabase).toHaveBeenCalledTimes(1)
    expect(lastSaved(saveDatabase).switches).toEqual([])
  })

  it('flushes pending edits on unmount', async () => {
    const { result, saveDatabase, unmount } = await setup()
    act(() => result.current.renameSwitch('intro_done', 'Last words'))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(saveDatabase).toHaveBeenCalledTimes(1)
    expect(lastSaved(saveDatabase).switches[0].name).toBe('Last words')
  })

  it('does not write while a name is empty (the store would refuse it) and writes once it is valid', async () => {
    const { result, saveDatabase } = await setup()
    act(() => result.current.renameSwitch('intro_done', ''))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(saveDatabase).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
    act(() => result.current.renameSwitch('intro_done', 'Back'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(saveDatabase).toHaveBeenCalledTimes(1)
  })

  it('surfaces save failures and recovers on the next successful save', async () => {
    const saveDatabase = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'Invalid database: nope' })
      .mockResolvedValue({ success: true })
    const { result } = await setup(initial(), { saveDatabase })
    act(() => result.current.renameSwitch('intro_done', 'One'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(result.current.error).toBe('Invalid database: nope')
    expect(result.current.dirty).toBe(true)
    act(() => result.current.renameSwitch('intro_done', 'Two'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.dirty).toBe(false)
  })

  it('reload re-reads from disk after flushing pending changes', async () => {
    const { result, saveDatabase, getDatabase } = await setup()
    act(() => result.current.removeSwitch('intro_done'))
    await act(async () => {
      await result.current.reload()
    })
    expect(saveDatabase).toHaveBeenCalledTimes(1)
    expect(getDatabase.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(result.current.switches).toHaveLength(1) // the mocked disk still has the original
  })
})

describe('idFromName', () => {
  it('slugifies', () => {
    expect(idFromName('Badges earned', 'x')).toBe('badges_earned')
    expect(idFromName('  ', 'switch')).toBe('switch')
    expect(idFromName('Ünï Cödé 2', 'x')).toBe('uni_code_2')
  })
})
