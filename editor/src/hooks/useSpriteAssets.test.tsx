import { StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { CharacterDef } from '../../../shared/engine/characters'
import type { CharacterInfo } from '../../../shared/engine/graphics'
import { installElectronAPI, uninstallElectronAPI } from '@/test/helpers'
import { useSpriteAssets } from './useSpriteAssets'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

const def = (name: string): CharacterDef => ({
  version: 2, name, tags: [], facing: 'none', pivot: { x: 0.5, y: 1 },
  sheets: { sheet: { image: 'props/a.png', frameWidth: 24, frameHeight: 24, margin: 0, spacing: 0 } }, clips: {}, bindings: {}, still: { sheet: 'sheet', frame: 0 },
})
const info = (id: string, name = id): CharacterInfo => ({ id, def: def(name), images: { 'props/a.png': 'data:image/png;base64,AAAA' } })
const listing = (characters: CharacterInfo[]) => ({ success: true, characters, graphics: [{ id: 'props/a.png', width: 24, height: 24, bytes: 1, mtimeMs: 0 }], images: { 'props/a.png': 'data:image/png;base64,AAAA' }, folders: ['objects'], warnings: [{ file: 'x.json', error: 'bad' }] })

afterEach(() => uninstallElectronAPI())

function setup(initial = [info('objects/b'), info('characters/a')], overrides: Record<string, unknown> = {}) {
  const getCharacters = vi.fn(() => Promise.resolve(listing(initial)))
  installElectronAPI({ getCharacters, ...overrides } as never)
  return { ...renderHook(() => useSpriteAssets(), { wrapper }), getCharacters }
}

describe('useSpriteAssets', () => {
  it('loads characters and graphics, exposing the v2 data and the SpriteAssetInfo view', async () => {
    const { result } = setup()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.list.map((a) => a.id)).toEqual(['characters/a', 'objects/b'])
    expect(result.current.getAsset('objects/b')?.meta).toMatchObject({ kind: 'object', name: 'objects/b', sheet: 'a.png' })
    expect(result.current.getAsset('objects/b')?.sheets).toEqual({ 'a.png': 'data:image/png;base64,AAAA' })
    expect(result.current.getCharacter('objects/b')?.def.facing).toBe('none')
    expect(result.current.getAsset('nope')).toBeUndefined()
    expect(result.current.getCharacter(null)).toBeUndefined()
    expect(result.current.graphics.map((g) => g.id)).toEqual(['props/a.png'])
    expect(Object.keys(result.current.images)).toEqual(['props/a.png'])
    expect(result.current.folders).toEqual(['objects'])
    expect(result.current.warnings).toEqual([{ file: 'x.json', error: 'bad' }])
  })

  it('reports a failing or rejected load and a missing API', async () => {
    installElectronAPI({ getCharacters: () => Promise.resolve({ success: false, error: 'disk on fire' }) } as never)
    const a = renderHook(() => useSpriteAssets(), { wrapper })
    await waitFor(() => expect(a.result.current.error).toBe('disk on fire'))
    installElectronAPI({ getCharacters: () => Promise.reject(new Error('ipc down')) } as never)
    const b = renderHook(() => useSpriteAssets(), { wrapper })
    await waitFor(() => expect(b.result.current.error).toBe('ipc down'))
    uninstallElectronAPI()
    const c = renderHook(() => useSpriteAssets(), { wrapper })
    await waitFor(() => expect(c.result.current.error).toMatch(/not available/))
  })

  it('saveCharacter adds or replaces from the main process answer; failures keep the old state', async () => {
    const saved = info('objects/new', 'New')
    const saveCharacter = vi.fn().mockResolvedValueOnce({ success: true, character: saved }).mockResolvedValueOnce({ success: false, error: 'Graphic "x.png" does not exist' })
    const { result } = setup([], { saveCharacter })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect((await result.current.saveCharacter('objects/new', def('New'))).ok).toBe(true) })
    expect(result.current.getCharacter('objects/new')?.def.name).toBe('New')
    await act(async () => { expect(await result.current.saveCharacter('objects/new', def('Bad'))).toEqual({ ok: false, error: 'Graphic "x.png" does not exist' }) })
    expect(result.current.getCharacter('objects/new')?.def.name).toBe('New')
    expect(result.current.error).toMatch(/does not exist/)
  })

  it('importGraphic adds the graphic and its picture', async () => {
    const importGraphic = vi.fn().mockResolvedValue({ success: true, graphic: { id: 'props/b.png', width: 8, height: 8, bytes: 1, mtimeMs: 0 }, image: 'data:image/png;base64,BBBB' })
    const { result } = setup([], { importGraphic })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.importGraphic('/tmp/b.png', 'props/b.png') })
    expect(importGraphic).toHaveBeenCalledWith('/tmp/b.png', 'props/b.png')
    expect(result.current.graphics.map((g) => g.id)).toEqual(['props/a.png', 'props/b.png'])
    expect(result.current.images['props/b.png']).toBe('data:image/png;base64,BBBB')
  })

  it('rename moves the character, remove deletes on success only', async () => {
    const renameCharacter = vi.fn().mockResolvedValue({ success: true, id: 'npcs/a' })
    const deleteCharacter = vi.fn().mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValueOnce({ success: true })
    const { result } = setup([info('objects/a'), info('objects/z')], { renameCharacter, deleteCharacter })
    await waitFor(() => expect(result.current.list).toHaveLength(2))
    await act(async () => { expect(await result.current.rename('objects/a', 'npcs/a')).toEqual({ ok: true, id: 'npcs/a' }) })
    expect(result.current.list.map((a) => a.id)).toEqual(['npcs/a', 'objects/z'])
    await act(async () => { expect(await result.current.remove('objects/z')).toEqual({ ok: false, error: 'nope' }) })
    expect(result.current.list).toHaveLength(2)
    await act(async () => { expect(await result.current.remove('objects/z')).toEqual({ ok: true }) })
    expect(result.current.list.map((a) => a.id)).toEqual(['npcs/a'])
  })

  it('folder operations re-read the project; pickFile maps the dialog result', async () => {
    const createCharacterFolder = vi.fn().mockResolvedValue({ success: true, folderId: 'npcs' })
    const pickSpriteFile = vi.fn().mockResolvedValueOnce({ success: true, sourcePath: '/x/hero.png', defaultName: 'hero' }).mockResolvedValueOnce({ success: false, canceled: true }).mockResolvedValueOnce({ success: false, error: 'no window' })
    const { result, getCharacters } = setup([], { createCharacterFolder, pickSpriteFile })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const before = getCharacters.mock.calls.length
    await act(async () => { expect(await result.current.createFolder(null, 'npcs')).toEqual({ ok: true, folderId: 'npcs' }) })
    expect(getCharacters.mock.calls.length).toBeGreaterThan(before)
    expect(await result.current.pickFile()).toEqual({ ok: true, sourcePath: '/x/hero.png', defaultName: 'hero' })
    expect(await result.current.pickFile()).toEqual({ ok: true, sourcePath: null, defaultName: '' })
    expect(await result.current.pickFile()).toEqual({ ok: false, error: 'no window' })
  })
})
