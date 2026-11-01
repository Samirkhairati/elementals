import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { CharacterDef } from '../../../../../shared/engine/characters'
import { installElectronAPI, uninstallElectronAPI } from '@/test/helpers'
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
  it('groups the tables, marks Visual read-only and unbuilt tables as planned', async () => {
    renderAt('/database')
    const nav = await screen.findByRole('navigation', { name: 'Database tables' })
    for (const g of ['Visual', 'Design', 'World', 'Text', 'Game']) expect(within(nav).getByText(g)).toBeInTheDocument()
    expect(within(nav).getByLabelText('Read-only')).toBeInTheDocument()
    for (const name of [/Pokémon/, /Items/, /Moves/]) {
      const button = within(nav).getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(within(button).getByText('Planned')).toBeInTheDocument()
    }
    expect(within(nav).getByRole('button', { name: /Graphics/ })).toBeEnabled()
  })

  it('shows counters from the data: graphics, tilesets, maps and character errors', async () => {
    renderAt('/database')
    const nav = await screen.findByRole('navigation', { name: 'Database tables' })
    await waitFor(() => expect(within(within(nav).getByRole('button', { name: /Graphics/ })).getByText('3')).toBeInTheDocument())
    expect(within(within(nav).getByRole('button', { name: /Tilesets/ })).getByText('2')).toBeInTheDocument()
    expect(within(within(nav).getByRole('button', { name: /Maps/ })).getByText('1')).toBeInTheDocument()
    expect(within(within(nav).getByRole('button', { name: /Characters/ })).getByText('1 ✕')).toBeInTheDocument() // the broken one
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

describe('Graphics (read-only)', () => {
  it('shows size, where it is used and offers no rename or delete', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(within(detail).getByText(/64×32 px · 2\.0 KB/)).toBeInTheDocument()
    expect(within(detail).getByText('Chest')).toBeInTheDocument() // used by
    expect(within(detail).getByRole('button', { name: 'Rename…' })).toBeDisabled()
    expect(within(detail).getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(within(detail).getByRole('img', { name: 'props/chest.png' })).toBeInTheDocument()
  })

  it('draws the cut of a character that uses the graphic', async () => {
    renderAt('/database?table=graphics&id=props/chest.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(screen.getByTestId('graphic-grid').style.background).toBe('')
    fireEvent.change(within(detail).getByLabelText("Overlay a character's cut"), { target: { value: 'objects/chest:sheet' } })
    expect(screen.getByTestId('graphic-grid').getAttribute('style')).toContain('64px')
  })

  it('an unused graphic says so and has an empty Used-by list', async () => {
    renderAt('/database?table=graphics&id=props/orphan.png')
    const detail = await screen.findByTestId('graphic-detail')
    expect(within(detail).getAllByText('unused').length).toBeGreaterThan(0)
    expect(within(detail).getByText('No character uses this graphic.')).toBeInTheDocument()
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

describe('Tilesets and Maps (read-only)', () => {
  it('a tileset shows its tile count and the maps that paint with it', async () => {
    renderAt('/database?table=tilesets&id=grass.png')
    const detail = await screen.findByTestId('tileset-detail')
    await within(detail).findByText('Town')
    expect(within(detail).getByText('ground')).toBeInTheDocument()
  })

  it('unused tilesets are badged in the list', async () => {
    renderAt('/database?table=tilesets')
    const lonely = await screen.findByRole('button', { name: /lonely/ })
    expect(within(lonely).getByText('unused')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /grass/ })).queryByText('unused')).toBeNull()
  })

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
