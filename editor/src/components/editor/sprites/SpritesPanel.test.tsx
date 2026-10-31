/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial editor contexts and entity props */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within, act } from '@testing-library/react'
import { SpritesPanel } from './SpritesPanel'
import { ImportSpriteDialog } from './ImportSpriteDialog'
import { renderWithEditor, assetMap, characterMeta, makeAsset, objectMeta } from '@/test/editorContext'
import { installElectronAPI, makeEntity, makeMap, uninstallElectronAPI } from '@/test/helpers'

const hero = makeAsset('characters/hero', characterMeta())
const chest = makeAsset('objects/chest', objectMeta())
const flame = makeAsset('objects/flame', objectMeta({ name: 'Flame', animations: {} }))

const usageMaps = [
  makeMap({
    fileName: 'a.json',
    entities: [
      makeEntity('1', { components: { Sprite: { asset: 'objects/chest' } } }),
      makeEntity('2', { components: { Sprite: { asset: 'objects/chest' } } }),
      makeEntity('3', { components: { Sprite: { asset: 'characters/hero' } } }),
    ],
  }),
]

function ctx(over: Record<string, any> = {}) {
  return {
    spriteAssets: assetMap(hero, chest, flame),
    spriteList: [hero, chest, flame],
    spriteWarnings: [],
    reloadSprites: vi.fn(async () => undefined),
    maps: usageMaps,
    activeMap: null,
    entities: [],
    saveSpriteMeta: vi.fn(async (_id: string, meta: unknown) => ({ ok: true as const, meta })),
    renameSprite: vi.fn(async (_id: string, newId: string) => ({ ok: true as const, id: newId })),
    removeSprite: vi.fn(async () => ({ ok: true as const })),
    setConfirmDialog: vi.fn(),
    pickSpriteFile: vi.fn(),
    importSprite: vi.fn(),
    ...over,
  }
}

describe('SpritesPanel browser', () => {
  it('lists assets by folder with kind badges and usage counts', () => {
    renderWithEditor(<SpritesPanel />, ctx() as any)
    const browser = screen.getByTestId('sprite-browser')
    expect(within(browser).getByText('characters')).toBeInTheDocument()
    expect(within(browser).getByText('objects')).toBeInTheDocument()
    const chestItem = within(browser).getByRole('button', { name: 'Sprite objects/chest' })
    expect(within(chestItem).getByText('object')).toBeInTheDocument()
    expect(within(chestItem).getByTitle('Entities using it')).toHaveTextContent('2')
    expect(within(within(browser).getByRole('button', { name: 'Sprite characters/hero' })).getByTitle('Entities using it')).toHaveTextContent('1')
    expect(within(within(browser).getByRole('button', { name: 'Sprite objects/flame' })).getByTitle('Entities using it')).toHaveTextContent('0')
  })

  it('counts the live entities of the open map instead of its saved copy', () => {
    const active = usageMaps[0]
    renderWithEditor(<SpritesPanel />, ctx({ activeMap: active, entities: [makeEntity('x', { components: { Sprite: { asset: 'objects/flame' } } })] }) as any)
    const browser = screen.getByTestId('sprite-browser')
    expect(within(within(browser).getByRole('button', { name: 'Sprite objects/flame' })).getByTitle('Entities using it')).toHaveTextContent('1')
    expect(within(within(browser).getByRole('button', { name: 'Sprite objects/chest' })).getByTitle('Entities using it')).toHaveTextContent('0')
  })

  it('filters with the search box and switches to list view', () => {
    renderWithEditor(<SpritesPanel />, ctx() as any)
    fireEvent.change(screen.getByLabelText('Search sprites'), { target: { value: 'fla' } })
    expect(screen.queryByRole('button', { name: 'Sprite objects/chest' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sprite objects/flame' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search sprites'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No sprite matches/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search sprites'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('button', { name: 'Sprite objects/chest' })).toHaveClass('ed-row')
  })

  it('collapses a folder', () => {
    renderWithEditor(<SpritesPanel />, ctx() as any)
    fireEvent.click(screen.getByRole('button', { name: /objects/, expanded: true }))
    expect(screen.queryByRole('button', { name: 'Sprite objects/chest' })).toBeNull()
  })

  it('reports invalid sprite folders', () => {
    renderWithEditor(<SpritesPanel />, ctx({ spriteWarnings: [{ file: 'objects/broken', error: 'bad json' }] }) as any)
    expect(screen.getByRole('status')).toHaveTextContent('objects/broken')
  })

  it('shows an empty state with no sprites', () => {
    renderWithEditor(<SpritesPanel />, ctx({ spriteList: [], spriteAssets: {} }) as any)
    expect(screen.getByText('No sprites yet.')).toBeInTheDocument()
  })
})

describe('SpritesPanel editor', () => {
  const open = (id: string, over: Record<string, any> = {}) => {
    const c = ctx(over)
    renderWithEditor(<SpritesPanel />, c as any)
    fireEvent.click(screen.getByRole('button', { name: `Sprite ${id}` }))
    return c
  }

  it('edits the metadata as a draft and saves it with saveSpriteMeta', async () => {
    const c = open('objects/chest')
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
    const w = screen.getByLabelText('Frame width')
    fireEvent.change(w, { target: { value: '16' } })
    fireEvent.keyDown(w, { key: 'Enter' })
    expect(c.saveSpriteMeta).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(c.saveSpriteMeta).toHaveBeenCalledTimes(1))
    const [id, meta] = c.saveSpriteMeta.mock.calls[0] as unknown as [string, { frameWidth: number; frameHeight: number }]
    expect(id).toBe('objects/chest')
    expect(meta.frameWidth).toBe(16)
    expect(meta.frameHeight).toBe(24)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('reverts unsaved changes', () => {
    open('objects/chest')
    const w = screen.getByLabelText('Frame width')
    fireEvent.change(w, { target: { value: '16' } })
    fireEvent.keyDown(w, { key: 'Enter' })
    expect(screen.getByLabelText('Frame width')).toHaveValue('16')
    fireEvent.click(screen.getByRole('button', { name: /Revert/ }))
    expect(screen.getByLabelText('Frame width')).toHaveValue('24')
  })

  it('creates animations, takes frames by number lists and removes frames', () => {
    open('objects/flame')
    fireEvent.click(screen.getByRole('button', { name: /Add animation/ }))
    const row = screen.getByTestId('animation-anim')
    const list = within(row).getByLabelText('Frame list of anim')
    fireEvent.change(list, { target: { value: '0-3, 5' } })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(within(row).getAllByRole('button', { name: /Remove frame/ })).toHaveLength(5)
    fireEvent.click(within(row).getByRole('button', { name: 'Remove frame 5 at position 5' }))
    expect(within(row).getAllByRole('button', { name: /Remove frame/ })).toHaveLength(4)
    fireEvent.change(within(row).getByLabelText('FPS of anim'), { target: { value: '12' } })
    fireEvent.keyDown(within(row).getByLabelText('FPS of anim'), { key: 'Enter' })
    expect(screen.getByRole('button', { name: /Save/ })).toBeEnabled()
  })

  it('validates the metadata and blocks Save on errors', () => {
    open('objects/chest')
    const row = screen.getByTestId('animation-open')
    // remove every frame: an animation needs at least one
    for (const f of [1, 2, 3]) fireEvent.click(within(row).getByRole('button', { name: new RegExp(`Remove frame ${f} `) }))
    expect(screen.getByTestId('validation')).toHaveTextContent(/animation "open": frames must be a non-empty list/)
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
  })

  it('character assets get character settings instead of animations', () => {
    open('characters/hero')
    expect(screen.getByLabelText('Frames per direction')).toHaveValue('4')
    expect(screen.getByLabelText('Idle frame')).toHaveValue('1')
    expect(screen.getByLabelText('Walk fps')).toHaveValue('8')
    expect(screen.queryByRole('button', { name: /Add animation/ })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Sheet' })).toBeInTheDocument()
  })

  it('renaming a used sprite asks for confirmation first', () => {
    const c = open('objects/chest')
    fireEvent.change(screen.getByLabelText('Asset id'), { target: { value: 'objects/crate' } })
    fireEvent.blur(screen.getByLabelText('Asset id'))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(c.setConfirmDialog).toHaveBeenCalledTimes(1)
    const dialog = c.setConfirmDialog.mock.calls[0][0] as { description: string; action: () => void }
    expect(dialog.description).toContain('used by 2 entities')
    expect(c.renameSprite).not.toHaveBeenCalled()
    dialog.action()
    expect(c.renameSprite).toHaveBeenCalledWith('objects/chest', 'objects/crate')
  })

  it('renaming an unused sprite needs no confirmation', async () => {
    const c = open('objects/flame')
    fireEvent.change(screen.getByLabelText('Asset id'), { target: { value: 'objects/torch' } })
    fireEvent.blur(screen.getByLabelText('Asset id'))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(c.renameSprite).toHaveBeenCalledWith('objects/flame', 'objects/torch'))
    expect(c.setConfirmDialog).not.toHaveBeenCalled()
  })

  it('deleting warns when the sprite is in use', () => {
    const c = open('objects/chest')
    fireEvent.click(screen.getByRole('button', { name: /Delete sprite/ }))
    const dialog = c.setConfirmDialog.mock.calls[0][0] as { description: string; action: () => void }
    expect(dialog.description).toContain('used by 2 entities')
    dialog.action()
    expect(c.removeSprite).toHaveBeenCalledWith('objects/chest')
  })
})

describe('Import flow', () => {
  const DATA = 'data:image/png;base64,AAAA'
  const OriginalImage = globalThis.Image

  beforeEach(() => {
    // jsdom never decodes images: pretend every image is a 64x32 sheet.
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 64
      naturalHeight = 32
      width = 64
      height = 32
      set src(_v: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    ;(globalThis as unknown as { Image: unknown }).Image = FakeImage
  })
  afterEach(() => {
    ;(globalThis as unknown as { Image: unknown }).Image = OriginalImage
    uninstallElectronAPI()
  })

  async function startImport() {
    const importDraft = vi.fn(async (_p: string, o: { id: string }) => ({ success: true, asset: { id: o.id, meta: {}, sheets: { 'sheet.png': DATA } } }))
    const deleteSprite = vi.fn(async () => ({ success: true }))
    installElectronAPI({ importSprite: importDraft as never, deleteSprite: deleteSprite as never })
    const c = ctx({
      pickSpriteFile: vi.fn(async () => ({ ok: true as const, sourcePath: '/tmp/Flame Sheet.png', defaultName: 'Flame Sheet' })),
      importSprite: vi.fn(async (_p: string, o: { id: string }) => ({ ok: true as const, asset: { id: o.id, meta: objectMeta(), sheets: {} } })),
    })
    const onOpenChange = vi.fn()
    const onImported = vi.fn()
    renderWithEditor(<ImportSpriteDialog open onOpenChange={onOpenChange} onImported={onImported} />, c as any)
    fireEvent.click(screen.getByRole('button', { name: /Choose PNG/ }))
    await screen.findByTestId('import-grid-summary')
    return { c, importDraft, deleteSprite, onOpenChange, onImported }
  }

  it('previews the sheet with the computed columns x rows x frames, live while typing', async () => {
    await startImport()
    // object: the whole 64x32 image is one frame
    expect(screen.getByTestId('import-grid-summary')).toHaveTextContent('1 × 1 = 1 frames')
    fireEvent.change(screen.getByLabelText('Frame width'), { target: { value: '16' } })
    fireEvent.keyDown(screen.getByLabelText('Frame width'), { key: 'Enter' })
    expect(screen.getByTestId('import-grid-summary')).toHaveTextContent('4 × 1 = 4 frames')
    fireEvent.change(screen.getByLabelText('Frame height'), { target: { value: '16' } })
    fireEvent.keyDown(screen.getByLabelText('Frame height'), { key: 'Enter' })
    expect(screen.getByTestId('import-grid-summary')).toHaveTextContent('4 × 2 = 8 frames')
    expect(screen.getByTestId('sheet-viewer')).toBeInTheDocument()
  })

  it('kind picks sensible frame sizes and character sheets are checked for a 4x4 layout', async () => {
    await startImport()
    fireEvent.click(screen.getByRole('radio', { name: 'Character' }))
    expect(screen.getByTestId('import-grid-summary')).toHaveTextContent('4 × 4 = 16 frames')
    expect(screen.getByLabelText('Asset id')).toHaveValue('characters/flame-sheet')
    fireEvent.click(screen.getByRole('radio', { name: 'Animated' }))
    expect(screen.getByTestId('import-grid-summary')).toHaveTextContent('2 × 1 = 2 frames')
    expect(screen.getByLabelText('Asset id')).toHaveValue('objects/flame-sheet')
  })

  it('imports with the chosen kind, id and frame size, removes the draft and reports the new id', async () => {
    const { c, importDraft, deleteSprite, onImported, onOpenChange } = await startImport()
    expect(importDraft).toHaveBeenCalledWith('/tmp/Flame Sheet.png', expect.objectContaining({ kind: 'object' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Animated' }))
    const w = screen.getByLabelText('Frame width')
    fireEvent.change(w, { target: { value: '16' } })
    fireEvent.keyDown(w, { key: 'Enter' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import sprite' }))
    })
    await waitFor(() => expect(c.importSprite).toHaveBeenCalledTimes(1))
    expect(c.importSprite).toHaveBeenCalledWith('/tmp/Flame Sheet.png', { id: 'objects/flame-sheet', name: 'Flame Sheet', kind: 'animated', frameWidth: 16, frameHeight: 32 })
    expect(deleteSprite).toHaveBeenCalled()
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('objects/flame-sheet'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('refuses an id that already exists', async () => {
    await startImport()
    const id = screen.getByLabelText('Asset id')
    fireEvent.change(id, { target: { value: 'objects/chest' } })
    fireEvent.blur(id)
    expect(screen.getByText(/already exists/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import sprite' })).toBeDisabled()
  })

  it('refuses a malformed id', async () => {
    await startImport()
    const id = screen.getByLabelText('Asset id')
    fireEvent.change(id, { target: { value: 'bad id!' } })
    fireEvent.blur(id)
    expect(screen.getByText(/Use letters, digits/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import sprite' })).toBeDisabled()
  })

  it('does nothing when the picker is cancelled', async () => {
    const c = ctx({ pickSpriteFile: vi.fn(async () => ({ ok: true as const, sourcePath: null, defaultName: '' })) })
    installElectronAPI()
    renderWithEditor(<ImportSpriteDialog open onOpenChange={vi.fn()} />, c as any)
    fireEvent.click(screen.getByRole('button', { name: /Choose PNG/ }))
    await waitFor(() => expect(c.pickSpriteFile).toHaveBeenCalled())
    expect(screen.getByText('No sheet chosen yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import sprite' })).toBeDisabled()
  })

  it('shows an error when the picker fails', async () => {
    const c = ctx({ pickSpriteFile: vi.fn(async () => ({ ok: false as const, error: 'The editor API is not available' })) })
    installElectronAPI()
    renderWithEditor(<ImportSpriteDialog open onOpenChange={vi.fn()} />, c as any)
    fireEvent.click(screen.getByRole('button', { name: /Choose PNG/ }))
    expect(await screen.findByText('The editor API is not available')).toBeInTheDocument()
  })
})
