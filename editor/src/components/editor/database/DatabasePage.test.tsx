import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { CharacterDef } from '../../../../../shared/engine/characters'
import { chooseOption, installElectronAPI, uninstallElectronAPI } from '@/test/helpers'
import { DatabasePage } from './DatabasePage'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const def = (name: string, image: string, over: Partial<CharacterDef> = {}): CharacterDef => ({
  version: 2, name, tags: ['npc'], facing: 'none', pivot: { x: 0.5, y: 1 },
  sheets: { sheet: { image, frameWidth: 32, frameHeight: 32, margin: 0, spacing: 0 } }, clips: {}, bindings: {}, still: { sheet: 'sheet', frame: 0 }, ...over,
})
const graphic = (id: string, width = 64, height = 32) => ({ id, width, height, bytes: 2048, mtimeMs: 0 })

function install(extra: Record<string, unknown> = {}) {
  installElectronAPI({
    getCharacters: () => Promise.resolve({
      success: true,
      characters: [
        { id: 'objects/chest', def: def('Chest', 'props/chest.png'), images: { 'props/chest.png': PNG } },
        { id: 'objects/broken', def: def('Broken', 'props/missing.png'), images: {} },
      ],
      graphics: [graphic('props/chest.png'), graphic('props/orphan.png'), graphic('sprites/a/walk.png')],
      images: { 'props/chest.png': PNG, 'props/orphan.png': PNG, 'sprites/a/walk.png': PNG },
      folders: ['objects'], warnings: [],
    }),
    getTilesets: () => Promise.resolve({ success: true, tilesets: [{ name: 'grass', fileName: 'grass.png', folderPath: null, dataUrl: PNG }, { name: 'lonely', fileName: 'lonely.png', folderPath: null, dataUrl: PNG }] }),
    getMaps: () => Promise.resolve({ success: true, maps: [{
      name: 'Town', fileName: 'town.json', folderPath: null, width: 10, height: 8, schemaVersion: 4,
      layers: [{ id: 'g', name: 'ground', type: 'tile', visible: true, locked: false, data: { 0: { tilesetId: 'grass.png', x: 0, y: 0 } } }],
      entities: [{ id: 'c', name: 'Chest', x: 0, y: 0, components: { Sprite: { asset: 'objects/chest' } } }],
    }] }),
    getDatabase: () => Promise.resolve({ success: true, database: { version: 2, switches: [{ id: 's', name: 'Seen' }], variables: [], stages: [] } }),
    getCommonEvents: () => Promise.resolve({ success: true, events: [], warnings: [] }),
    ...extra,
  } as never)
}

function renderAt(url: string) {
  const root = createRootRoute()
  const db = createRoute({ getParentRoute: () => root, path: '/database', component: DatabasePage, validateSearch: (s: Record<string, unknown>) => ({ table: s.table as string | undefined, id: s.id as string | undefined, tab: s.tab as string | undefined }) })
  const editor = createRoute({ getParentRoute: () => root, path: '/editor', component: () => <p>editor</p> })
  const router = createRouter({ routeTree: root.addChildren([db, editor]), history: createMemoryHistory({ initialEntries: [url] }) })
  return { router, ...render(<RouterProvider router={router} />) }
}

beforeEach(() => install())
afterEach(() => uninstallElectronAPI())

describe('Database shell', () => {
  it('groups the tables, marks only Maps read-only and lists unbuilt tables as planned', async () => {
    renderAt('/database')
    const nav = await screen.findByRole('navigation', { name: 'Database tables' })
    for (const g of ['Visual', 'Design', 'World', 'Planned']) expect(within(nav).getByText(g)).toBeInTheDocument()
    expect(within(within(nav).getByRole('button', { name: /Maps/ })).getByLabelText('Read-only')).toBeInTheDocument()
    expect(within(within(nav).getByRole('button', { name: /Graphics/ })).queryByLabelText('Read-only')).toBeNull()
    expect(within(within(nav).getByRole('button', { name: /Sprites/ })).queryByLabelText('Read-only')).toBeNull()
    // the planned tables sit under their own heading, disabled
    const plannedList = within(nav).getByText('Planned').nextElementSibling as HTMLElement
    for (const name of [/Dialogue & strings/, /Pokémon/, /Items/, /Moves/]) {
      expect(within(plannedList).getByRole('button', { name })).toBeDisabled()
    }
    expect(within(nav).getByRole('button', { name: /Graphics/ })).toBeEnabled()
  })

  it('shows counters from the data: graphics, tilesets, maps and character errors', async () => {
    renderAt('/database')
    const nav = await screen.findByRole('navigation', { name: 'Database tables' })
    await waitFor(() => expect(within(within(nav).getByRole('button', { name: /Graphics/ })).getByText('3')).toBeInTheDocument())
    expect(within(within(nav).getByRole('button', { name: /Tilesets/ })).getByText('2')).toBeInTheDocument()
    expect(within(within(nav).getByRole('button', { name: /Maps/ })).getByText('1')).toBeInTheDocument()
    expect(within(within(nav).getByRole('button', { name: /Sprites/ })).getByText('1 ✕')).toBeInTheDocument() // the broken one
  })

  it('opens the table named in the URL and selects the deep-linked record', async () => {
    renderAt('/database?table=characters&id=objects/chest')
    const detail = await screen.findByTestId('character-detail')
    expect(within(detail).getByText('Chest')).toBeInTheDocument()
  })

  it('/database?table=graphics lists the folder tree and badges unused graphics', async () => {
    renderAt('/database?table=graphics')
    const tree = await screen.findByRole('tree')
    await waitFor(() => expect(within(tree).getByText('orphan.png')).toBeInTheDocument())
    expect(within(within(tree).getByText('orphan.png').closest('button') as HTMLElement).getByText('unused')).toBeInTheDocument()
    expect(within(within(tree).getByText('chest.png').closest('button') as HTMLElement).queryByText('unused')).toBeNull()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'walk' } })
    expect(within(tree).queryByText('orphan.png')).toBeNull()
    expect(within(tree).getByText('walk.png')).toBeInTheDocument()
  })
})

describe('List and tile views', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('characters show their picture in the list and as tiles, and the choice is remembered', async () => {
    renderAt('/database?table=characters')
    await screen.findByRole('button', { name: /Chest/ })
    expect(screen.getAllByTestId('character-thumb').length).toBe(1) // the broken one has no readable image
    fireEvent.click(screen.getByRole('button', { name: 'Tile view' }))
    expect(screen.getByRole('button', { name: 'Chest' })).toHaveAttribute('title', expect.stringContaining('objects/chest'))
    expect(screen.getByText('Objects')).toBeInTheDocument() // section heading: still, animation-less characters are objects
    expect(store.get('database.view.characters')).toBe('tiles')
    fireEvent.click(screen.getByRole('button', { name: 'Chest' }))
    expect(await screen.findByTestId('character-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(store.get('database.view.characters')).toBe('list')
  })

  it('starts in tiles when that was the last choice', async () => {
    store.set('database.view.characters', 'tiles')
    renderAt('/database?table=characters')
    expect(await screen.findByRole('button', { name: 'Chest' })).toHaveAttribute('title', expect.stringContaining('objects/chest'))
  })

  it('graphics and tilesets have tiles too; maps have no toggle', async () => {
    renderAt('/database?table=graphics')
    fireEvent.click(await screen.findByRole('button', { name: 'Tile view' }))
    expect(await screen.findByRole('button', { name: 'orphan.png' })).toHaveAttribute('title', 'props/orphan.png')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Database tables' })).getByRole('button', { name: /Tilesets/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tile view' }))
    expect(await screen.findByRole('button', { name: 'grass' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Database tables' })).getByRole('button', { name: /Maps/ }))
    await screen.findByRole('button', { name: /Town/ })
    expect(screen.queryByRole('button', { name: 'Tile view' })).toBeNull()
  })
})

describe('Graphics', () => {
  const calls: unknown[][] = []
  beforeEach(() => {
    calls.length = 0
    const record = (name: string, result: unknown = { success: true }) => (...args: unknown[]) => { calls.push([name, ...args]); return Promise.resolve(result) }
    install({
      renameGraphic: record('renameGraphic', { success: true, id: 'x' }),
      deleteGraphic: record('deleteGraphic'),
      createGraphicFolder: record('createGraphicFolder', { success: true, folderId: 'scenery' }),
      saveCharacter: (id: string, d: CharacterDef) => { calls.push(['saveCharacter', id, d]); return Promise.resolve({ success: true, character: { id, def: d, images: {} } }) },
      saveMap: record('saveMap'),
    })
  })

  it('the search box lives at the top of the list, not in the page header', async () => {
    renderAt('/database?table=graphics')
    const pane = await screen.findByTestId('list-pane')
    expect(within(pane).getByLabelText('Search')).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).queryByLabelText('Search')).toBeNull()
    fireEvent.change(within(pane).getByLabelText('Search'), { target: { value: 'orph' } })
    fireEvent.click(within(pane).getByRole('button', { name: 'Clear search' }))
    expect(within(pane).getByLabelText('Search')).toHaveValue('')
  })

  it('shows size, where it is used and offers rename, move and delete', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(within(detail).getByText(/64×32 px · 2\.0 KB/)).toBeInTheDocument()
    expect(within(detail).getByText('Chest › sheet sheet')).toBeInTheDocument() // the sprite that is cut from it
    expect(within(detail).getByText('Town › Chest › Sprite')).toBeInTheDocument() // where that sprite ends up
    expect(within(detail).getByRole('button', { name: /Rename \/ move/ })).toBeEnabled()
    expect(within(detail).getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(within(detail).getByRole('img', { name: 'props/chest.png' })).toBeInTheDocument()
  })

  it('views the picture in a zoom pane with a slider, steps, fit and 1:1', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(within(detail).getByRole('slider', { name: 'Zoom' })).toBeInTheDocument()
    const readout = within(detail).getByTestId('zoom-readout')
    expect(readout).toHaveTextContent('100%')
    fireEvent.click(within(detail).getByRole('button', { name: 'Zoom in' }))
    expect(readout).toHaveTextContent('200%')
    expect(within(detail).getByRole('img', { name: 'props/chest.png' })).toHaveAttribute('width', '128')
    fireEvent.keyDown(within(detail).getByRole('slider', { name: 'Zoom' }), { key: 'End' })
    expect(readout).toHaveTextContent('3200%')
    fireEvent.click(within(detail).getByRole('button', { name: 'Actual size' }))
    expect(readout).toHaveTextContent('100%')
    fireEvent.click(within(detail).getByRole('button', { name: 'Zoom out' }))
    expect(readout).toHaveTextContent('50%')
    fireEvent.click(within(detail).getByRole('button', { name: 'Fit view' }))
  })

  it('the pixel grid says it needs a close zoom, and draws from 400% up', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    const detail = await screen.findByTestId('graphic-detail')
    fireEvent.click(within(detail).getByRole('checkbox', { name: 'Pixel grid' }))
    expect(within(detail).getByTestId('pixel-grid-hint')).toHaveTextContent('400%')
    expect(screen.getByTestId('graphic-grid').style.background).toBe('')
    fireEvent.click(within(detail).getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(within(detail).getByRole('button', { name: 'Zoom in' }))
    expect(within(detail).getByTestId('zoom-readout')).toHaveTextContent('300%')
    fireEvent.click(within(detail).getByRole('button', { name: 'Zoom in' }))
    expect(within(detail).queryByTestId('pixel-grid-hint')).toBeNull()
    expect(screen.getByTestId('graphic-grid').getAttribute('style')).toContain('4px')
  })

  it('lays the cut of a sprite over the picture, frame by frame, with a summary and a link to edit it', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(screen.queryByTestId('cut-overlay')).toBeNull()
    chooseOption(within(detail).getByRole('combobox', { name: "Overlay a character's cut" }), 'objects/chest:sheet')
    const overlay = screen.getByTestId('cut-overlay')
    expect(overlay.querySelectorAll('[data-frame]')).toHaveLength(2) // 64×32 cut in 32×32 frames
    expect(within(detail).getByTestId('cut-summary')).toHaveTextContent('Chest · sheet: 2×1 = 2 frames of 32×32 px')
    expect(within(detail).getByRole('link', { name: 'Edit this cut' })).toBeInTheDocument()
  })

  it('an unused graphic says so and is safe to delete', async () => {
    renderAt('/database?table=graphics&id=props/orphan.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(within(detail).getAllByText('unused').length).toBeGreaterThan(0)
    expect(within(detail).getByText(/Nothing uses this picture/)).toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls).toContainEqual(['deleteGraphic', 'props/orphan.png']))
  })

  it('a graphic that is in use cannot be deleted and the dialog lists what uses it', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('delete-blocked')).toHaveTextContent('Chest › sheet sheet')
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('renaming rewrites the sprites that use it, after moving the file, and previews what changes', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    fireEvent.click(await screen.findByRole('button', { name: /Rename \/ move/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Picture name'), { target: { value: 'crate' } })
    expect(within(dialog).getByTestId('change-preview')).toHaveTextContent('1 reference in 1 sprite')
    expect(within(dialog).getByText('props/crate.png')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename & update' }))
    await waitFor(() => expect(calls.some((c) => c[0] === 'saveCharacter')).toBe(true))
    expect(calls[0]).toEqual(['renameGraphic', 'props/chest.png', 'props/crate.png'])
    const saved = calls.find((c) => c[0] === 'saveCharacter') as [string, string, CharacterDef]
    expect(saved[1]).toBe('objects/chest')
    expect(saved[2].sheets.sheet.image).toBe('props/crate.png')
  })

  it('refuses an id that is taken', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    fireEvent.click(await screen.findByRole('button', { name: /Rename \/ move/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Picture name'), { target: { value: 'orphan' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('already exists')
    expect(within(dialog).getByRole('button', { name: 'Rename & update' })).toBeDisabled()
  })

  it('a folder can be created from the toolbar', async () => {
    renderAt('/database?table=graphics')
    fireEvent.click(await screen.findByRole('button', { name: /New folder/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Folder name'), { target: { value: 'scenery' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(calls).toContainEqual(['createGraphicFolder', null, 'scenery']))
  })

  it('dragging a picture onto a folder moves it (and rewrites what uses it)', async () => {
    renderAt('/database?table=graphics')
    const tree = await screen.findByRole('tree')
    const chest = within(tree).getByText('chest.png').closest('button') as HTMLElement
    const folder = within(tree).getByRole('treeitem', { name: 'sprites' }) // props/chest.png -> sprites/chest.png
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(chest, { dataTransfer })
    const row = folder.querySelector('.ed-row') as HTMLElement
    fireEvent.dragOver(row, { dataTransfer })
    fireEvent.drop(row, { dataTransfer })
    await waitFor(() => expect(calls).toContainEqual(['renameGraphic', 'props/chest.png', 'sprites/chest.png']))
    expect(await screen.findByRole('status')).toHaveTextContent('Moved chest.png')
  })

  it('import copies the picked file under the chosen id and surfaces failures', async () => {
    const imported: unknown[] = []
    install({
      pickSpriteFile: () => Promise.resolve({ success: true, sourcePath: '/tmp/flower.png', defaultName: 'flower' }),
      importGraphic: (src: string, id: string) => {
        imported.push([src, id])
        return Promise.resolve(id === 'imported/flower.png' ? { success: true, graphic: graphic(id), image: PNG } : { success: false, error: 'already exists' })
      },
    })
    renderAt('/database?table=graphics')
    fireEvent.click(await screen.findByRole('button', { name: /Import…/ }))
    const field = await screen.findByLabelText('Graphic id')
    expect(field).toHaveValue('imported/flower.png')
    fireEvent.change(field, { target: { value: 'props/chest.png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect((await screen.findAllByRole('alert')).some((a) => a.textContent?.includes('already exists'))).toBe(true)
    fireEvent.change(screen.getByLabelText('Graphic id'), { target: { value: 'imported/flower.png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(imported).toHaveLength(2))
  })
})

describe('Tilesets', () => {
  const calls: unknown[][] = []
  beforeEach(() => {
    calls.length = 0
    const record = (name: string, result: unknown = { success: true }) => (...args: unknown[]) => { calls.push([name, ...args]); return Promise.resolve(result) }
    install({
      renameTileset: record('renameTileset'),
      renameTilesetFile: record('renameTilesetFile', { success: true, fileName: 'meadow.png' }),
      moveTileset: record('moveTileset'),
      deleteTileset: record('deleteTileset'),
      saveMap: (folder: string | null, file: string, map: { layers: { data?: Record<number, { tilesetId: string }> }[] }) => { calls.push(['saveMap', file, map.layers[0].data?.[0]?.tilesetId]); return Promise.resolve({ success: true }) },
      getTilesets: () => Promise.resolve({ success: true, folders: ['Outside'], tilesets: [{ name: 'grass', fileName: 'grass.png', folderPath: null, dataUrl: PNG, width: 64, height: 64 }, { name: 'lonely', fileName: 'lonely.png', folderPath: null, dataUrl: PNG, width: 32, height: 32 }] }),
    })
  })

  it('a tileset shows the maps that paint with it, and the viewer has the tile grid', async () => {
    renderAt('/database?table=tilesets&id=grass.png')
    const detail = await screen.findByTestId('tileset-detail')
    expect(await within(detail).findByText('Town › layer ground')).toBeInTheDocument()
    expect(within(detail).getByRole('checkbox', { name: '32px tile grid' })).toBeChecked()
    expect(within(detail).getByRole('slider', { name: 'Zoom' })).toBeInTheDocument()
  })

  it('unused tilesets are badged in the list', async () => {
    renderAt('/database?table=tilesets')
    const lonely = await screen.findByRole('button', { name: /lonely/ })
    expect(within(lonely).getByText('unused')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /grass/ })).queryByText('unused')).toBeNull()
  })

  it('renaming the file rewrites the tiles in every map that paints with it', async () => {
    renderAt('/database?table=tilesets&id=grass.png')
    fireEvent.click(await screen.findByRole('button', { name: /Rename \/ move/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Tileset file name'), { target: { value: 'meadow' } })
    expect(within(dialog).getByTestId('change-preview')).toHaveTextContent('1 reference in 1 map')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save & update' }))
    await waitFor(() => expect(calls).toContainEqual(['saveMap', 'town.json', 'meadow.png']))
    expect(calls.findIndex((c) => c[0] === 'renameTilesetFile')).toBeLessThan(calls.findIndex((c) => c[0] === 'saveMap'))
    expect(calls).toContainEqual(['renameTilesetFile', null, 'grass.png', 'meadow'])
  })

  it('moving to a folder only moves the file: maps keep working', async () => {
    renderAt('/database?table=tilesets&id=grass.png')
    fireEvent.click(await screen.findByRole('button', { name: /Rename \/ move/ }))
    const dialog = await screen.findByRole('dialog')
    chooseOption(within(dialog).getByRole('combobox', { name: 'Folder' }), 'Outside')
    expect(within(dialog).getByText(/Nothing else needs to change/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save & update' }))
    await waitFor(() => expect(calls).toContainEqual(['moveTileset', 'grass.png', null, 'Outside']))
    expect(calls.some((c) => c[0] === 'saveMap')).toBe(false)
  })

  it('a tileset a map paints with cannot be deleted; an unused one can', async () => {
    renderAt('/database?table=tilesets&id=grass.png')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(within(await screen.findByRole('dialog')).getByTestId('delete-blocked')).toHaveTextContent('Town › layer ground')
  })

  it('the unused one is deleted through the dialog', async () => {
    renderAt('/database?table=tilesets&id=lonely.png')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls).toContainEqual(['deleteTileset', null, 'lonely.png']))
  })
})

describe('Maps (read-only)', () => {
  it('a map lists its size, tilesets and characters, with a link to the Map Editor', async () => {
    renderAt('/database?table=maps&id=town.json')
    const detail = await screen.findByTestId('map-detail')
    expect(within(detail).getByText(/10×8 tiles · 1 layers · 1 entities/)).toBeInTheDocument()
    expect(within(detail).getByText('grass.png')).toBeInTheDocument()
    expect(within(detail).getByText('objects/chest')).toBeInTheDocument()
    expect(within(detail).getByRole('link', { name: 'Open in Map Editor' })).toHaveAttribute('href', '/editor')
  })
})

describe('Flags', () => {
  it('hosts the switches / variables / stages / common events panel', async () => {
    renderAt('/database?table=flags')
    const host = await screen.findByTestId('flags-table')
    await waitFor(() => expect(within(host).getByRole('table', { name: 'Switches' })).toBeInTheDocument())
    expect(within(host).getByDisplayValue('Seen')).toBeInTheDocument()
  })
})
