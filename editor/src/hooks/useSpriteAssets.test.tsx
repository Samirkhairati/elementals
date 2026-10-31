import { StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { SpriteAssetInfo, SpriteAssetMeta } from '../../../shared/engine/types'
import { installElectronAPI, uninstallElectronAPI } from '@/test/helpers'
import { useSpriteAssets } from './useSpriteAssets'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

const meta = (name: string): SpriteAssetMeta => ({
  version: 1,
  name,
  kind: 'object',
  frameWidth: 24,
  frameHeight: 24,
  margin: 0,
  spacing: 0,
  pivotX: 0.5,
  pivotY: 1,
  sheet: 'a.png',
})
const asset = (id: string, name = id): SpriteAssetInfo => ({ id, meta: meta(name), sheets: { 'a.png': 'data:image/png;base64,AAAA' } })

afterEach(() => uninstallElectronAPI())

function setup(initial: SpriteAssetInfo[] = [asset('objects/b'), asset('characters/a')], overrides: Record<string, never> = {}) {
  const getSprites = vi.fn(() => Promise.resolve({ success: true, assets: initial, warnings: [{ file: 'x/sprite.json', error: 'bad' }] }))
  installElectronAPI({ getSprites, ...overrides } as never)
  const hook = renderHook(() => useSpriteAssets(), { wrapper })
  return { ...hook, getSprites }
}

describe('useSpriteAssets', () => {
  it('loads assets (once per mount, StrictMode safe) and exposes them by id and sorted', async () => {
    const { result, getSprites } = setup()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(Object.keys(result.current.assets).sort()).toEqual(['characters/a', 'objects/b'])
    expect(result.current.list.map((a) => a.id)).toEqual(['characters/a', 'objects/b'])
    expect(result.current.getAsset('objects/b')?.meta.name).toBe('objects/b')
    expect(result.current.getAsset('nope')).toBeUndefined()
    expect(result.current.getAsset(null)).toBeUndefined()
    expect(result.current.warnings).toEqual([{ file: 'x/sprite.json', error: 'bad' }])
    expect(getSprites.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('reports a failing load', async () => {
    installElectronAPI({ getSprites: () => Promise.resolve({ success: false, error: 'disk on fire' }) } as never)
    const { result } = renderHook(() => useSpriteAssets(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('disk on fire')
    expect(result.current.list).toEqual([])
  })

  it('reports a rejected load and a missing API', async () => {
    installElectronAPI({ getSprites: () => Promise.reject(new Error('ipc down')) } as never)
    const a = renderHook(() => useSpriteAssets(), { wrapper })
    await waitFor(() => expect(a.result.current.error).toBe('ipc down'))
    uninstallElectronAPI()
    const b = renderHook(() => useSpriteAssets(), { wrapper })
    await waitFor(() => expect(b.result.current.error).toMatch(/not available/))
  })

  it('reload picks up changes on disk and ignores superseded answers', async () => {
    let call = 0
    const getSprites = vi.fn(() => {
      call++
      return Promise.resolve({ success: true, assets: call === 1 ? [asset('a')] : [asset('a'), asset('b')], warnings: [] })
    })
    installElectronAPI({ getSprites } as never)
    const { result } = renderHook(() => useSpriteAssets(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.reload())
    await waitFor(() => expect(Object.keys(result.current.assets).sort()).toEqual(['a', 'b']))
  })

  it('importSprite adds the asset on success and surfaces failures', async () => {
    const imported = asset('objects/new')
    const importSprite = vi
      .fn()
      .mockResolvedValueOnce({ success: true, asset: imported })
      .mockResolvedValueOnce({ success: false, error: 'already exists' })
    const { result } = setup([], { importSprite } as never)
    await waitFor(() => expect(result.current.loading).toBe(false))

    let r: Awaited<ReturnType<typeof result.current.importSprite>> | undefined
    await act(async () => {
      r = await result.current.importSprite('/tmp/a.png', { name: 'New', kind: 'object' })
    })
    expect(importSprite).toHaveBeenCalledWith('/tmp/a.png', { name: 'New', kind: 'object' })
    expect(r).toEqual({ ok: true, asset: imported })
    expect(result.current.getAsset('objects/new')).toEqual(imported)

    await act(async () => {
      r = await result.current.importSprite('/tmp/a.png', { name: 'New', kind: 'object' })
    })
    expect(r).toEqual({ ok: false, error: 'already exists' })
    expect(result.current.error).toBe('already exists')
    expect(result.current.list).toHaveLength(1)
  })

  it('saveMeta updates only the meta of the asset', async () => {
    const saved = { ...meta('Renamed'), pivotY: 0.25 }
    const saveSpriteMeta = vi.fn().mockResolvedValue({ success: true, meta: saved })
    const { result } = setup([asset('objects/a')], { saveSpriteMeta } as never)
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => {
      expect((await result.current.saveMeta('objects/a', saved)).ok).toBe(true)
    })
    expect(saveSpriteMeta).toHaveBeenCalledWith('objects/a', saved)
    expect(result.current.getAsset('objects/a')?.meta).toEqual(saved)
    expect(result.current.getAsset('objects/a')?.sheets).toEqual({ 'a.png': 'data:image/png;base64,AAAA' })
  })

  it('saveMeta failure keeps the previous meta', async () => {
    const saveSpriteMeta = vi.fn().mockResolvedValue({ success: false, error: 'Invalid sprite: frameWidth' })
    const { result } = setup([asset('objects/a', 'Original')], { saveSpriteMeta } as never)
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => {
      expect(await result.current.saveMeta('objects/a', meta('Broken'))).toEqual({ ok: false, error: 'Invalid sprite: frameWidth' })
    })
    expect(result.current.getAsset('objects/a')?.meta.name).toBe('Original')
    expect(result.current.error).toBe('Invalid sprite: frameWidth')
  })

  it('rename moves the asset to its new id', async () => {
    const renameSprite = vi.fn().mockResolvedValue({ success: true, id: 'npcs/a' })
    const { result } = setup([asset('objects/a'), asset('objects/z')], { renameSprite } as never)
    await waitFor(() => expect(result.current.list).toHaveLength(2))
    await act(async () => {
      expect(await result.current.rename('objects/a', 'npcs/a')).toEqual({ ok: true, id: 'npcs/a' })
    })
    expect(renameSprite).toHaveBeenCalledWith('objects/a', 'npcs/a')
    expect(result.current.list.map((a) => a.id)).toEqual(['npcs/a', 'objects/z'])
    expect(result.current.getAsset('npcs/a')?.id).toBe('npcs/a')
    expect(result.current.getAsset('objects/a')).toBeUndefined()
  })

  it('rename failure changes nothing', async () => {
    const renameSprite = vi.fn().mockResolvedValue({ success: false, error: 'A sprite with id "objects/z" already exists' })
    const { result } = setup([asset('objects/a'), asset('objects/z')], { renameSprite } as never)
    await waitFor(() => expect(result.current.list).toHaveLength(2))
    await act(async () => {
      expect((await result.current.rename('objects/a', 'objects/z')).ok).toBe(false)
    })
    expect(result.current.list.map((a) => a.id)).toEqual(['objects/a', 'objects/z'])
  })

  it('remove deletes on success only', async () => {
    const deleteSprite = vi.fn().mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValueOnce({ success: true })
    const { result } = setup([asset('objects/a')], { deleteSprite } as never)
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => {
      expect(await result.current.remove('objects/a')).toEqual({ ok: false, error: 'nope' })
    })
    expect(result.current.list).toHaveLength(1)
    await act(async () => {
      expect(await result.current.remove('objects/a')).toEqual({ ok: true })
    })
    expect(result.current.list).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('pickFile maps the dialog result', async () => {
    const pickSpriteFile = vi
      .fn()
      .mockResolvedValueOnce({ success: true, sourcePath: '/x/hero.png', defaultName: 'hero' })
      .mockResolvedValueOnce({ success: false, canceled: true })
      .mockResolvedValueOnce({ success: false, error: 'no window' })
    const { result } = setup([], { pickSpriteFile } as never)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(await result.current.pickFile()).toEqual({ ok: true, sourcePath: '/x/hero.png', defaultName: 'hero' })
    expect(await result.current.pickFile()).toEqual({ ok: true, sourcePath: null, defaultName: '' })
    expect(await result.current.pickFile()).toEqual({ ok: false, error: 'no window' })
  })
})
