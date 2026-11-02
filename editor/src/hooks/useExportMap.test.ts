import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MapData } from '@/types/editor'
import { exportMapToGame } from './useExportMap'

const map: MapData = { name: 'market', fileName: 'market.json', folderPath: null, width: 2, height: 2, layers: [], entities: [] }

afterEach(() => {
  delete (window as { electronAPI?: unknown }).electronAPI
})

describe('exportMapToGame', () => {
  it('tells the author to restart when the window predates the feature', async () => {
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {}
    const res = await exportMapToGame(map, [], null, [])
    expect(res).toMatchObject({ ok: false })
    expect((res as { error: string }).error).toMatch(/Restart the editor/)
  })

  it('reports a missing project connection', async () => {
    expect(await exportMapToGame(map, [], null, [])).toMatchObject({ ok: false, error: expect.stringMatching(/not connected/) })
  })

  it('turns a thrown IPC error into a failure instead of an unhandled rejection', async () => {
    ;(window as unknown as { electronAPI: unknown }).electronAPI = { exportMapToGame: vi.fn() }
    // An invalid map (no layers) fails validation before anything is written.
    const res = await exportMapToGame(map, [], null, [])
    expect(res.ok).toBe(false)
  })
})
