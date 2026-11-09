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
      name: 'Town', fileName: 'town.json', folderPath: null, width: 10, height: 8, schemaVersion: 5,
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

  it('opens Graphics when no table is named', async () => {
    renderAt('/database')
    expect(await screen.findByRole('region', { name: 'Graphics' })).toBeInTheDocument()
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

  it('shows size, where it is used and offers rename and delete', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(within(detail).getByText(/64×32 px · 2\.0 KB/)).toBeInTheDocument()
    expect(within(detail).getByText('Chest › sheet sheet')).toBeInTheDocument() // the sprite that is cut from it
    expect(within(detail).getByText('Town › Chest › Sprite')).toBeInTheDocument() // where that sprite ends up
    expect(within(detail).getByRole('button', { name: 'Rename…' })).toBeEnabled()
    expect(within(detail).getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(within(detail).getByRole('img', { name: 'props/chest.png' })).toBeInTheDocument()
  })

  it('Delete on the selected picture asks first (nothing is deleted until confirmed), like the Delete button', async () => {
    renderAt('/database?table=graphics&id=props/orphan.png')
    const pane = await screen.findByTestId('list-pane')
    const row = (await within(pane).findAllByText('orphan.png'))[0].closest('button') as HTMLElement
    row.focus()
    fireEvent.keyDown(row, { key: 'Delete' })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('props/orphan.png')).toBeInTheDocument()
    expect(calls.some((c) => c[0] === 'deleteGraphic')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }))
    await waitFor(() => expect(calls.some((c) => c[0] === 'deleteGraphic' && c[1] === 'props/orphan.png')).toBe(true))
  })

  it('right-clicking a picture offers Delete… which opens the same confirm', async () => {
    renderAt('/database?table=graphics')
    const pane = await screen.findByTestId('list-pane')
    const row = (await within(pane).findAllByText('orphan.png'))[0].closest('button') as HTMLElement
    fireEvent.contextMenu(row)
    fireEvent.click(await screen.findByText('Delete…'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('props/orphan.png')).toBeInTheDocument()
    expect(calls.some((c) => c[0] === 'deleteGraphic')).toBe(false)
  })

  it('after the right-click menu closes, focus stays on the dialog\'s Delete button so Enter deletes', async () => {
    renderAt('/database?table=graphics')
    const pane = await screen.findByTestId('list-pane')
    const row = (await within(pane).findAllByText('orphan.png'))[0].closest('button') as HTMLElement
    fireEvent.contextMenu(row)
    fireEvent.click(await screen.findByText('Delete…'))
    const dialog = await screen.findByRole('dialog')
    const del = within(dialog).getByRole('button', { name: /Delete/ })
    await waitFor(() => expect(del).toHaveFocus())
    await new Promise((r) => setTimeout(r, 50)) // the menu's own focus hand-back happens as it unmounts
    expect(del).toHaveFocus()
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
    fireEvent.click(await screen.findByRole('button', { name: 'Rename…' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Rename…' }))
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

  it('New folder… creates inside the folder that was clicked last, not at the top level', async () => {
    renderAt('/database?table=graphics')
    fireEvent.click(await screen.findByRole('button', { name: /^props/ }))
    await waitFor(() => expect(screen.getByTestId('import-target')).toHaveTextContent('Importing into props'))
    fireEvent.click(screen.getByRole('button', { name: /New folder…/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('New folder in props')
    fireEvent.change(within(dialog).getByLabelText('Folder name'), { target: { value: 'inner' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(calls).toContainEqual(['createGraphicFolder', 'props', 'inner']))
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

  describe('picking several pictures and folders', () => {
    const dt = () => {
      const data = new Map<string, string>()
      return { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    }
    // the list may be re-rendered by a click (the open picture goes to the URL), so look it up afresh each time
    const rowOf = (_tree: HTMLElement, text: string) => within(screen.getByRole('tree')).getByText(text).closest('button') as HTMLElement
    const folderRow = (tree: HTMLElement, name: string) => within(tree).getByRole('treeitem', { name }).querySelector('.ed-row') as HTMLElement

    beforeEach(() => {
      const record = (name: string, result: unknown = { success: true }) => (...args: unknown[]) => { calls.push([name, ...args]); return Promise.resolve(result) }
      install({
        renameGraphic: record('renameGraphic', { success: true, id: 'x' }),
        deleteGraphic: record('deleteGraphic'),
        deleteGraphicFolder: record('deleteGraphicFolder'),
        moveGraphicFolder: record('moveGraphicFolder', { success: true, folderId: 'x' }),
        saveCharacter: (id: string, d: CharacterDef) => { calls.push(['saveCharacter', id, d]); return Promise.resolve({ success: true, character: { id, def: d, images: {} } }) },
        saveMap: record('saveMap'),
      })
    })

    it('Ctrl/Cmd+click adds pictures to the selection, and a plain click starts over', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(rowOf(tree, 'orphan.png'))
      await waitFor(() => expect(rowOf(tree, 'orphan.png')).toHaveAttribute('data-selected', 'true'))
      fireEvent.click(rowOf(tree, 'walk.png'), { ctrlKey: true })
      expect(await screen.findByTestId('library-selection')).toHaveTextContent('2 pictures selected')
      fireEvent.click(rowOf(tree, 'walk.png'), { metaKey: true })
      expect(screen.queryByTestId('library-selection')).toBeNull()
      fireEvent.click(rowOf(tree, 'orphan.png'), { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'chest.png'), { ctrlKey: true })
      expect(screen.getByTestId('library-selection')).toHaveTextContent('2 pictures selected')
      fireEvent.click(rowOf(tree, 'chest.png'))
      expect(screen.queryByTestId('library-selection')).toBeNull()
    })

    it('Shift+click takes every row from the last click, folders included', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(within(tree).getByRole('treeitem', { name: 'props' }).querySelector('.ed-row button') as HTMLElement, { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'orphan.png'), { shiftKey: true })
      // props folder, its two pictures in between (chest, orphan)
      expect(await screen.findByTestId('library-selection')).toHaveTextContent('2 pictures and 1 folder selected')
    })

    it('Delete asks once for everything picked, refuses while one is in use, and deletes pictures and folders', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(rowOf(tree, 'chest.png'), { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'orphan.png'), { ctrlKey: true })
      fireEvent.keyDown(rowOf(tree, 'orphan.png'), { key: 'Delete' })
      const blocked = await screen.findByRole('dialog')
      expect(within(blocked).getByTestId('delete-blocked')).toBeInTheDocument()
      expect(within(blocked).getByRole('button', { name: /Delete/ })).toBeDisabled()
      fireEvent.click(within(blocked).getByRole('button', { name: /Cancel/ }))

      // chest is out; the folder `sprites` (with walk.png) goes along with orphan
      fireEvent.click(rowOf(tree, 'chest.png'), { ctrlKey: true })
      fireEvent.click(within(tree).getByRole('treeitem', { name: 'sprites' }).querySelector('.ed-row button') as HTMLElement, { ctrlKey: true })
      fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
      const dialog = await screen.findByRole('dialog')
      expect(calls.some((c) => c[0] === 'deleteGraphic')).toBe(false)
      fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }))
      await waitFor(() => expect(calls).toContainEqual(['deleteGraphic', 'props/orphan.png']))
      await waitFor(() => expect(calls).toContainEqual(['deleteGraphicFolder', 'sprites']))
    })

    it('right-clicking a picked picture deletes everything picked', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(rowOf(tree, 'orphan.png'), { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'walk.png'), { ctrlKey: true })
      fireEvent.contextMenu(rowOf(tree, 'walk.png'))
      fireEvent.click(await screen.findByText('Delete 2 pictures…'))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('2 pictures')).toBeInTheDocument()
    })

    it('dragging one of the picked pictures onto a folder moves them all, rewriting what uses them', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(rowOf(tree, 'chest.png'), { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'orphan.png'), { ctrlKey: true })
      const transfer = dt()
      fireEvent.dragStart(rowOf(tree, 'orphan.png'), { dataTransfer: transfer })
      const target = folderRow(tree, 'sprites')
      fireEvent.dragOver(target, { dataTransfer: transfer })
      fireEvent.drop(target, { dataTransfer: transfer })
      await waitFor(() => expect(calls).toContainEqual(['renameGraphic', 'props/chest.png', 'sprites/chest.png']))
      expect(calls).toContainEqual(['renameGraphic', 'props/orphan.png', 'sprites/orphan.png'])
      expect(calls.some((c) => c[0] === 'saveCharacter')).toBe(true)
      expect(await screen.findByRole('status')).toHaveTextContent('Moved 2 pictures')
    })

    it('a picked folder moves with the pictures picked beside it, and what is inside it is not moved twice', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(within(tree).getByRole('treeitem', { name: 'sprites' }).querySelector('.ed-row button') as HTMLElement, { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'walk.png'), { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'orphan.png'), { ctrlKey: true })
      const transfer = dt()
      fireEvent.dragStart(rowOf(tree, 'orphan.png'), { dataTransfer: transfer })
      const target = folderRow(tree, 'props')
      fireEvent.dragOver(target, { dataTransfer: transfer })
      fireEvent.drop(target, { dataTransfer: transfer })
      await waitFor(() => expect(calls).toContainEqual(['moveGraphicFolder', 'sprites', 'props']))
      expect(calls.filter((c) => c[0] === 'renameGraphic')).toEqual([])
    })

    it('a folder cannot be dropped into itself', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(within(tree).getByRole('treeitem', { name: 'sprites' }).querySelector('.ed-row button') as HTMLElement, { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'orphan.png'), { ctrlKey: true })
      const transfer = dt()
      fireEvent.dragStart(rowOf(tree, 'orphan.png'), { dataTransfer: transfer })
      const inside = folderRow(tree, 'sprites/a')
      fireEvent.dragOver(inside, { dataTransfer: transfer })
      fireEvent.drop(inside, { dataTransfer: transfer })
      await new Promise((r) => setTimeout(r, 20))
      expect(calls.filter((c) => c[0] === 'moveGraphicFolder' || c[0] === 'renameGraphic')).toEqual([])
    })

    it('Escape clears the selection', async () => {
      renderAt('/database?table=graphics')
      const tree = await screen.findByRole('tree')
      fireEvent.click(rowOf(tree, 'orphan.png'), { ctrlKey: true })
      fireEvent.click(rowOf(tree, 'walk.png'), { ctrlKey: true })
      fireEvent.keyDown(rowOf(tree, 'walk.png'), { key: 'Escape' })
      expect(screen.queryByTestId('library-selection')).toBeNull()
    })
  })

  describe('replacing a picture', () => {
    const clip = (files: File[]) => ({ clipboardData: { types: ['Files'], files, items: files.map((f) => ({ kind: 'file', getAsFile: () => f })) } })

    it('Replace… takes a pasted picture and puts it in the place of this one (same id)', async () => {
      const calls: [string, string][] = []
      install({
        getPathForFile: () => '/clip/new.png',
        replaceGraphic: (src: string, id: string) => { calls.push([src, id]); return Promise.resolve({ success: true, graphic: graphic(id, 64, 32), image: PNG }) },
      })
      renderAt('/database?table=graphics&id=props/chest.png')
      fireEvent.click(await screen.findByRole('button', { name: 'Replace…' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('button', { name: /^Replace/ })).toBeDisabled() // nothing picked yet
      fireEvent.paste(document.body, clip([new File(['x'], 'image.png', { type: 'image/png' })]))
      await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Replace/ })).toBeEnabled())
      // the page behind must not open its own import for the same paste
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      fireEvent.click(within(dialog).getByRole('button', { name: /^Replace/ }))
      await waitFor(() => expect(calls).toEqual([['/clip/new.png', 'props/chest.png']]))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(await screen.findByRole('status')).toHaveTextContent('Replaced chest.png')
    })

    it('shows why it failed and stays open', async () => {
      install({ getPathForFile: () => '/clip/new.png', replaceGraphic: () => Promise.resolve({ success: false, error: 'Not a PNG' }) })
      renderAt('/database?table=graphics&id=props/chest.png')
      fireEvent.click(await screen.findByRole('button', { name: 'Replace…' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.drop(within(dialog).getByTestId('replace-drop'), { dataTransfer: { files: [new File(['x'], 'a.png', { type: 'image/png' })], types: ['Files'] } })
      await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Replace/ })).toBeEnabled())
      fireEvent.click(within(dialog).getByRole('button', { name: /^Replace/ }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not a PNG')
    })

    it('Choose file… uses the native picker', async () => {
      install({
        pickImageFiles: () => Promise.resolve({ success: true, files: [{ sourcePath: '/tmp/x.png', defaultName: 'x', previewUrl: PNG }] }),
      })
      renderAt('/database?table=graphics&id=props/chest.png')
      fireEvent.click(await screen.findByRole('button', { name: 'Replace…' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: /Choose file/ }))
      await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Replace/ })).toBeEnabled())
    })
  })

  describe('importing', () => {
    const picked = (...names: string[]) => () => Promise.resolve({ success: true, files: names.map((n) => ({ sourcePath: `/tmp/${n}.png`, defaultName: n, previewUrl: PNG })) })

    it('Import… takes several files, each with a preview and an editable name (the file name by default)', async () => {
      const imported: [string, string][] = []
      install({
        pickImageFiles: picked('flower', 'Big Tree'),
        importGraphic: (src: string, id: string) => { imported.push([src, id]); return Promise.resolve({ success: true, graphic: graphic(id), image: PNG }) },
      })
      renderAt('/database?table=graphics')
      fireEvent.click(await screen.findByRole('button', { name: /Import…/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Import 2 pictures' })).toBeInTheDocument()
      expect(dialog.querySelectorAll('img')).toHaveLength(2) // a preview per file
      expect(within(dialog).getByLabelText('Name for flower.png')).toHaveValue('flower')
      expect(within(dialog).getByLabelText('Name for Big Tree.png')).toHaveValue('Big-Tree')
      fireEvent.change(within(dialog).getByLabelText('Name for Big Tree.png'), { target: { value: 'oak' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 pictures' }))
      await waitFor(() => expect(imported).toEqual([['/tmp/flower.png', 'flower.png'], ['/tmp/Big Tree.png', 'oak.png']]))
      expect(await screen.findByRole('status')).toHaveTextContent('Imported 2 pictures')
    })

    it('stops names that clash with each other or with the library, and lets you leave a file out', async () => {
      install({ pickImageFiles: picked('chest', 'Chest', 'rock') })
      renderAt('/database?table=graphics')
      fireEvent.click(await screen.findByRole('button', { name: /Import…/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getAllByText('Used twice in this import.')).toHaveLength(2)
      expect(within(dialog).getByRole('button', { name: 'Import 3 pictures' })).toBeDisabled()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Leave out Chest.png' }))
      expect(within(dialog).getByRole('button', { name: 'Import 2 pictures' })).toBeEnabled()
      // the destination decides what is taken: props/chest.png exists
      fireEvent.change(within(dialog).getByLabelText('Destination folder'), { target: { value: 'props' } })
      expect(within(dialog).getByText('Already exists here.')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Import 2 pictures' })).toBeDisabled()
    })

    it('imports into the folder clicked last, which stays highlighted', async () => {
      const imported: string[] = []
      install({
        pickImageFiles: picked('flower'),
        importGraphic: (_src: string, id: string) => { imported.push(id); return Promise.resolve({ success: true, graphic: graphic(id), image: PNG }) },
      })
      renderAt('/database?table=graphics')
      const folder = await screen.findByRole('button', { name: /^props/ })
      fireEvent.click(folder)
      await waitFor(() => expect(screen.getByRole('button', { name: /^props/ })).toHaveAttribute('aria-current', 'true'))
      expect(screen.getByTestId('import-target')).toHaveTextContent('Importing into props')
      fireEvent.click(screen.getByRole('button', { name: /Import…/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText('Destination folder')).toHaveValue('props')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Import 1 picture' }))
      await waitFor(() => expect(imported).toEqual(['props/flower.png']))
      fireEvent.click(screen.getByRole('button', { name: 'Clear the import folder' }))
      expect(screen.getByTestId('import-target')).toHaveTextContent('Importing into the top level')
    })

    it('dragging files from outside onto a folder opens the import for that folder', async () => {
      install({ getPathForFile: (f: File) => `/dropped/${f.name}` })
      renderAt('/database?table=graphics')
      const target = (await screen.findByRole('button', { name: /^props/ })).closest('section, li') as HTMLElement
      const png = new File(['x'], 'rain.png', { type: 'image/png' })
      const text = new File(['x'], 'notes.txt', { type: 'text/plain' })
      fireEvent.dragOver(target, { dataTransfer: { types: ['Files'], files: [png, text] } })
      fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [png, text] } })
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Import 1 picture' })).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Destination folder')).toHaveValue('props')
      expect(within(dialog).getByLabelText('Name for rain.png')).toHaveValue('rain')
      expect(screen.getByTestId('import-target')).toHaveTextContent('Importing into props')
    })

    it('reports files that are not PNG or GIF images instead of opening an empty import', async () => {
      install({ getPathForFile: (f: File) => `/dropped/${f.name}` })
      renderAt('/database?table=graphics')
      const target = (await screen.findByRole('button', { name: /^props/ })).closest('section, li') as HTMLElement
      fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
      expect(await screen.findByText('Only PNG and GIF images can be imported.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    const clip = (files: File[], types: string[] = ['Files']) => ({ clipboardData: { types, files, items: files.map((f) => ({ kind: 'file', getAsFile: () => f })) } })

    it('pasting a picture opens the import for the folder clicked last, named "pasted"', async () => {
      const imported: [string, string][] = []
      install({
        getPathForFile: () => '',
        stageImage: (name: string) => Promise.resolve({ success: true, sourcePath: `/staged/${name}` }),
        importGraphic: (src: string, id: string) => { imported.push([src, id]); return Promise.resolve({ success: true, graphic: graphic(id), image: PNG }) },
      })
      renderAt('/database?table=graphics')
      fireEvent.click(await screen.findByRole('button', { name: /^props/ }))
      fireEvent.paste(document.body, clip([new File(['x'], 'image.png', { type: 'image/png' })]))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Import 1 picture' })).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Destination folder')).toHaveValue('props')
      expect(within(dialog).getByLabelText('Name for pasted.png')).toHaveValue('pasted')
      fireEvent.change(within(dialog).getByLabelText('Name for pasted.png'), { target: { value: 'screenshot' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Import 1 picture' }))
      // a pasted picture has no file on disk, so its bytes are staged first
      await waitFor(() => expect(imported).toEqual([['/staged/image.png', 'props/screenshot.png']]))
    })

    it('pasted pictures never default to a name that is taken or used twice', async () => {
      install({ getPathForFile: (f: File) => `/clip/${f.name}` })
      renderAt('/database?table=graphics')
      fireEvent.click(await screen.findByRole('button', { name: /^props/ }))
      const chest = new File(['x'], 'chest.png', { type: 'image/png' }) // props/chest.png already exists
      const a = new File(['x'], 'image.png', { type: 'image/png' })
      const b = new File(['y'], 'image.png', { type: 'image/png' })
      fireEvent.paste(document.body, clip([chest, a, b]))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('button', { name: 'Import 3 pictures' })).toBeEnabled()
      const names = within(dialog).getAllByRole('textbox', { name: /^Name for/ }).map((i) => (i as HTMLInputElement).value)
      expect(names).toEqual(['chest-2', 'pasted', 'pasted-2'])
    })

    it('leaves text pastes alone: in a text field, or when the clipboard holds no picture', async () => {
      install()
      renderAt('/database?table=graphics')
      const search = await screen.findByRole('textbox', { name: 'Search' })
      fireEvent.paste(search, clip([new File(['x'], 'image.png', { type: 'image/png' })]))
      fireEvent.paste(document.body, clip([], ['text/plain']))
      fireEvent.paste(document.body, clip([new File(['x'], 'notes.txt', { type: 'text/plain' })]))
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    describe('GIF animations', () => {
      const gifPick = () => Promise.resolve({ success: true, files: [{ sourcePath: '/tmp/boss.gif', defaultName: 'boss', ext: 'gif', previewUrl: PNG }, { sourcePath: '/tmp/rock.png', defaultName: 'rock', ext: 'png', previewUrl: PNG }] })

      it('Graphics takes a GIF next to PNGs and keeps its extension in the id', async () => {
        const imported: [string, string][] = []
        install({
          pickImageFiles: gifPick,
          importGraphic: (src: string, id: string) => { imported.push([src, id]); return Promise.resolve({ success: true, graphic: graphic(id), image: PNG }) },
        })
        renderAt('/database?table=graphics')
        fireEvent.click(await screen.findByRole('button', { name: /Import…/ }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByRole('heading', { name: 'Import 2 pictures' })).toBeInTheDocument()
        expect(within(dialog).getByLabelText('Name for boss.gif')).toHaveValue('boss')
        expect(within(dialog).getByText('.gif')).toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 pictures' }))
        await waitFor(() => expect(imported).toEqual([['/tmp/boss.gif', 'boss.gif'], ['/tmp/rock.png', 'rock.png']]))
      })

      it('a GIF dropped from the OS is accepted by Graphics', async () => {
        install({ getPathForFile: (f: File) => `/dropped/${f.name}` })
        renderAt('/database?table=graphics')
        const target = (await screen.findByRole('button', { name: /^props/ })).closest('section, li') as HTMLElement
        fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'flame.gif', { type: 'image/gif' })] } })
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByLabelText('Name for flame.gif')).toHaveValue('flame')
      })

      it('Tilesets leave GIFs out and say why', async () => {
        install({ pickImageFiles: gifPick })
        renderAt('/database?table=tilesets')
        fireEvent.click(await screen.findByRole('button', { name: /Import…/ }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByRole('heading', { name: 'Import 1 tileset' })).toBeInTheDocument()
        expect(within(dialog).queryByLabelText('Name for boss.gif')).toBeNull()
        expect(await screen.findByText('1 GIF animation left out: they can only be imported into Graphics.')).toBeInTheDocument()
      })

      it('a GIF dropped on Tilesets is refused with the reason', async () => {
        install({ getPathForFile: (f: File) => `/dropped/${f.name}` })
        renderAt('/database?table=tilesets')
        const root = await screen.findByTestId('import-target')
        const zone = root.closest('div')!.parentElement!.querySelector('[class*="min-h-[50vh]"]') as HTMLElement
        fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'flame.gif', { type: 'image/gif' })] } })
        expect(await screen.findByText('GIF animations can only be imported into Graphics.')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).toBeNull()
      })

      it('the detail of a GIF graphic shows its frames, its speed and a preview', async () => {
        install({
          getCharacters: () => Promise.resolve({ success: true, characters: [], images: { 'props/boss.gif': PNG }, folders: [], graphicFolders: ['props'], warnings: [], graphics: [{ ...graphic('props/boss.gif', 48, 24), gif: { frames: 3, frameWidth: 16, frameHeight: 24, delaysMs: [50, 50, 50] } }] }),
        })
        renderAt('/database?table=graphics&id=props/boss.gif')
        const detail = await screen.findByTestId('graphic-detail')
        expect(detail).toHaveTextContent('GIF · 3 frames of 16×24 px · about 20 fps')
        expect(within(detail).getByTestId('gif-preview')).toBeInTheDocument()
      })
    })

    describe('a whole folder', () => {
      const folderPick = (...files: [string, string][]) => () => Promise.resolve({ success: true, skipped: 0, truncated: false, files: files.map(([dir, name]) => ({ sourcePath: `/pick/${dir}/${name}.png`, dir, defaultName: name, previewUrl: PNG })) })

      it('Import folder… keeps the folders of the chosen one under the folder clicked last', async () => {
        const imported: string[] = []
        install({
          pickImageFolder: folderPick(['Trees', 'oak'], ['Trees/old oak', 'elm'], ['Trees/old oak', 'oak']),
          importGraphic: (_src: string, id: string) => { imported.push(id); return Promise.resolve({ success: true, graphic: graphic(id), image: PNG }) },
        })
        renderAt('/database?table=graphics')
        fireEvent.click(await screen.findByRole('button', { name: /^props/ }))
        fireEvent.click(screen.getByRole('button', { name: /Import folder…/ }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByRole('heading', { name: 'Import 3 pictures' })).toBeInTheDocument()
        // the same name in two folders is fine; both sit under the destination
        expect(within(dialog).queryByText('Used twice in this import.')).toBeNull()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Import 3 pictures' }))
        await waitFor(() => expect(imported).toEqual(['props/Trees/oak.png', 'props/Trees/old-oak/elm.png', 'props/Trees/old-oak/oak.png']))
      })

      it('holds the game-asset sync back while the folder goes in, and runs it once afterwards', async () => {
        const order: string[] = []
        install({
          pickImageFolder: folderPick(['Trees', 'oak'], ['Trees', 'elm'], ['Trees', 'pine']),
          beginBulkImport: () => { order.push('begin'); return Promise.resolve({ success: true }) },
          endBulkImport: () => { order.push('end'); return Promise.resolve({ success: true }) },
          importGraphic: (_src: string, id: string) => { order.push(id); return Promise.resolve({ success: true, graphic: graphic(id), image: PNG }) },
        })
        renderAt('/database?table=graphics')
        fireEvent.click(await screen.findByRole('button', { name: /Import folder…/ }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Import 3 pictures' }))
        await waitFor(() => expect(order.at(-1)).toBe('end'))
        expect(order[0]).toBe('begin')
        expect(order.filter((x) => x === 'begin' || x === 'end')).toHaveLength(2)
        expect(order).toHaveLength(5)
      })

      it('still catches a name that clashes inside one folder, or with a picture already in it', async () => {
        install({ pickImageFolder: folderPick(['Stuff', 'rock'], ['Stuff', 'Rock'], ['props', 'chest']) })
        renderAt('/database?table=graphics')
        fireEvent.click(await screen.findByRole('button', { name: /Import folder…/ }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getAllByText('Used twice in this import.')).toHaveLength(2)
        fireEvent.click(within(dialog).getByRole('button', { name: 'Leave out Rock.png' }))
        // Stuff/ is new but props/chest.png exists, so the name has to change
        expect(within(dialog).getByText('Already exists here.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Import 2 pictures' })).toBeDisabled()
        fireEvent.change(within(dialog).getByLabelText('Name for chest.png'), { target: { value: 'chest-2' } })
        expect(within(dialog).getByRole('button', { name: 'Import 2 pictures' })).toBeEnabled()
      })

      it('says when a folder has no pictures', async () => {
        install({ pickImageFolder: () => Promise.resolve({ success: false, error: 'That folder has no PNG images in it.' }) })
        renderAt('/database?table=graphics')
        fireEvent.click(await screen.findByRole('button', { name: /Import folder…/ }))
        expect(await screen.findByRole('alert')).toHaveTextContent('no PNG images')
      })

      it('dropping a folder from the OS imports everything in it with its structure', async () => {
        const imported: string[] = []
        install({
          getPathForFile: (f: File) => `/dropped/${f.name}`,
          importGraphic: (_src: string, id: string) => { imported.push(id); return Promise.resolve({ success: true, graphic: graphic(id), image: PNG }) },
        })
        renderAt('/database?table=graphics')
        const target = (await screen.findByRole('button', { name: /^props/ })).closest('section, li') as HTMLElement
        const png = (name: string) => new File(['x'], name, { type: name.endsWith('.png') ? 'image/png' : 'text/plain' })
        const file = (name: string) => ({ name, isFile: true, isDirectory: false, file: (ok: (f: File) => void) => ok(png(name)) })
        const dir = (name: string, children: unknown[]) => ({ name, isFile: false, isDirectory: true, createReader: () => { let done = false; return { readEntries: (ok: (e: unknown[]) => void) => { const b = done ? [] : children; done = true; ok(b) } } } })
        const tree = dir('My Rocks', [file('big.png'), dir('small', [file('pebble.png')]), file('readme.txt')])
        fireEvent.drop(target, { dataTransfer: { files: [], types: ['Files'], items: [{ kind: 'file', webkitGetAsEntry: () => tree }] } })
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByRole('heading', { name: 'Import 2 pictures' })).toBeInTheDocument()
        expect(within(dialog).getByLabelText('Destination folder')).toHaveValue('props')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 pictures' }))
        await waitFor(() => expect(imported).toEqual(['props/My-Rocks/big.png', 'props/My-Rocks/small/pebble.png']))
      })
    })

    it('keeps the files that failed in the dialog with the reason', async () => {
      install({
        pickImageFiles: picked('a', 'b'),
        importGraphic: (_src: string, id: string) => Promise.resolve(id === 'b.png' ? { success: false, error: 'already exists' } : { success: true, graphic: graphic(id), image: PNG }),
      })
      renderAt('/database?table=graphics')
      fireEvent.click(await screen.findByRole('button', { name: /Import…/ }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 pictures' }))
      expect(await within(dialog).findByText('already exists')).toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Name for a.png')).toBeNull()
      expect(within(dialog).getByRole('button', { name: 'Import 1 picture' })).toBeEnabled()
    })
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

  it('Import… files several tilesets under the names you give them (one name per file, free in every folder)', async () => {
    const imported: unknown[][] = []
    install({
      pickImageFiles: () => Promise.resolve({ success: true, files: [{ sourcePath: '/tmp/IMG_1.png', defaultName: 'IMG_1', previewUrl: PNG }, { sourcePath: '/tmp/grass.png', defaultName: 'grass', previewUrl: PNG }] }),
      importTileset: (...args: unknown[]) => { imported.push(args); return Promise.resolve({ success: true, tileset: { name: String(args[1]), fileName: `${String(args[3])}.png`, folderPath: args[2], dataUrl: PNG } }) },
      getTilesets: () => Promise.resolve({ success: true, folders: ['Outside'], tilesets: [{ name: 'grass', fileName: 'grass.png', folderPath: null, dataUrl: PNG, width: 64, height: 64 }] }),
    })
    renderAt('/database?table=tilesets')
    fireEvent.click(await screen.findByRole('button', { name: /Import…/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Already exists here.')).toBeInTheDocument() // grass.png is in the library already
    fireEvent.change(within(dialog).getByLabelText('Name for grass.png'), { target: { value: 'grass-2' } })
    fireEvent.change(within(dialog).getByLabelText('Name for IMG_1.png'), { target: { value: 'forest' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 tilesets' }))
    await waitFor(() => expect(imported).toEqual([['/tmp/IMG_1.png', 'forest', null, 'forest'], ['/tmp/grass.png', 'grass-2', null, 'grass-2']]))
  })

  it('Import folder… files tilesets into the same folders, and a name has to be free in every folder', async () => {
    const imported: unknown[][] = []
    install({
      pickImageFolder: () => Promise.resolve({ success: true, skipped: 0, truncated: false, files: [
        { sourcePath: '/p/a.png', dir: 'Town', defaultName: 'roofs', previewUrl: PNG },
        { sourcePath: '/p/b.png', dir: 'Town/old', defaultName: 'roofs', previewUrl: PNG },
      ] }),
      importTileset: (...args: unknown[]) => { imported.push(args); return Promise.resolve({ success: true, tileset: { name: String(args[1]), fileName: `${String(args[3])}.png`, folderPath: args[2], dataUrl: PNG } }) },
    })
    renderAt('/database?table=tilesets')
    fireEvent.click(await screen.findByRole('button', { name: /Import folder…/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('Used twice in this import.')).toHaveLength(2)
    fireEvent.change(within(dialog).getAllByRole('textbox', { name: /^Name for/ })[1], { target: { value: 'roofs-old' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 tilesets' }))
    await waitFor(() => expect(imported).toEqual([['/p/a.png', 'roofs', 'Town', 'roofs'], ['/p/b.png', 'roofs-old', 'Town/old', 'roofs-old']]))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Rename…' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Tileset file name'), { target: { value: 'meadow' } })
    expect(within(dialog).getByTestId('change-preview')).toHaveTextContent('1 reference in 1 map')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save & update' }))
    await waitFor(() => expect(calls).toContainEqual(['saveMap', 'town.json', 'meadow.png']))
    expect(calls.findIndex((c) => c[0] === 'renameTilesetFile')).toBeLessThan(calls.findIndex((c) => c[0] === 'saveMap'))
    expect(calls).toContainEqual(['renameTilesetFile', null, 'grass.png', 'meadow'])
  })

  it('dragging a tileset onto a folder only moves the file: maps keep working', async () => {
    renderAt('/database?table=tilesets')
    const tree = await screen.findByRole('tree')
    const grass = within(tree).getByText('grass').closest('button') as HTMLElement
    const row = within(tree).getByRole('treeitem', { name: 'Outside' }).querySelector('.ed-row') as HTMLElement
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(grass, { dataTransfer })
    fireEvent.dragOver(row, { dataTransfer })
    fireEvent.drop(row, { dataTransfer })
    await waitFor(() => expect(calls).toContainEqual(['moveTileset', 'grass.png', null, 'Outside']))
    expect(calls.some((c) => c[0] === 'saveMap')).toBe(false)
  })

  it('picking several tilesets: dragging moves them all, Delete asks once and refuses while a map paints with one', async () => {
    renderAt('/database?table=tilesets')
    const tree = await screen.findByRole('tree')
    const rowOf = (text: string) => within(tree).getByText(text).closest('button') as HTMLElement
    fireEvent.click(rowOf('grass'), { ctrlKey: true })
    fireEvent.click(rowOf('lonely'), { ctrlKey: true })
    expect(await screen.findByTestId('library-selection')).toHaveTextContent('2 tilesets selected')

    fireEvent.keyDown(rowOf('lonely'), { key: 'Delete' })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('delete-blocked')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/ }))

    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    const row = within(tree).getByRole('treeitem', { name: 'Outside' }).querySelector('.ed-row') as HTMLElement
    fireEvent.dragStart(rowOf('lonely'), { dataTransfer })
    fireEvent.dragOver(row, { dataTransfer })
    fireEvent.drop(row, { dataTransfer })
    await waitFor(() => expect(calls).toContainEqual(['moveTileset', 'grass.png', null, 'Outside']))
    expect(calls).toContainEqual(['moveTileset', 'lonely.png', null, 'Outside'])
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
