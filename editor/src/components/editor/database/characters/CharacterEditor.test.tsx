import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { CharacterDef } from '../../../../../../shared/engine/characters'
import { validateCharacter } from '../../../../../../shared/engine/characters'
import { newCharacter } from '@/lib/characterEdit'
import { chooseOption, installElectronAPI, uninstallElectronAPI } from '@/test/helpers'
import { DatabasePage } from '../DatabasePage'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const SIZE = { width: 128, height: 192 }
const graphics = [{ id: 'sprites/hero/walk.png', ...SIZE, bytes: 1, mtimeMs: 0 }, { id: 'sprites/hero/run.png', ...SIZE, bytes: 1, mtimeMs: 0 }, { id: 'props/ball.png', width: 24, height: 24, bytes: 1, mtimeMs: 0 }]
const images = Object.fromEntries(graphics.map((g) => [g.id, PNG]))

function setup(def: CharacterDef = newCharacter('actor', 'Hero', 'sprites/hero/walk.png', SIZE), path = '/database?table=characters&id=characters/hero', maps: unknown[] = [], extra: Record<string, unknown> = {}) {
  const saved: { id: string; def: CharacterDef }[] = []
  const saveCharacter = vi.fn((id: string, d: CharacterDef) => {
    saved.push({ id, def: d })
    return Promise.resolve({ success: true, character: { id, def: d, images: {} } })
  })
  installElectronAPI({
    getCharacters: () => Promise.resolve({ success: true, characters: [{ id: 'characters/hero', def, images }], graphics, images, folders: [], warnings: [] }),
    getTilesets: () => Promise.resolve({ success: true, tilesets: [] }),
    getMaps: () => Promise.resolve({ success: true, maps }),
    saveCharacter,
    ...extra,
  } as never)
  const root = createRootRoute()
  const db = createRoute({ getParentRoute: () => root, path: '/database', component: DatabasePage, validateSearch: (s: Record<string, unknown>) => ({ table: s.table as string | undefined, id: s.id as string | undefined, tab: s.tab as string | undefined }) })
  const router = createRouter({ routeTree: root.addChildren([db]), history: createMemoryHistory({ initialEntries: [path] }) })
  render(<RouterProvider router={router} />)
  return { saved, saveCharacter }
}

afterEach(() => uninstallElectronAPI())

const frame = (n: number) => screen.getByLabelText(`Frame ${n}`)
const click = (el: HTMLElement, init: object = {}) => { fireEvent.mouseDown(el, init); fireEvent.mouseUp(el, init) }
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save/ }))
const choose = (label: string, value: string) => chooseOption(screen.getByRole('combobox', { name: label }), value)

async function open() {
  await screen.findByTestId('animations-tab')
}

describe('wizard', () => {
  it('suggests the cut for the image, derives name → id, and saves a valid actor', async () => {
    const { saved } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /New character/ }))
    const dialog = await screen.findByRole('dialog')
    chooseOption(within(dialog).getByRole('combobox', { name: 'Picture' }), 'sprites/hero/run.png')
    expect(within(dialog).getByTestId('grid-suggestion')).toHaveTextContent('Cut as 4×4 frames of 32×48 px.')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Old man' } })
    fireEvent.blur(within(dialog).getByLabelText('Name'))
    expect(within(dialog).getByLabelText('Id')).toHaveValue('characters/old-man')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Object (one picture)' }))
    expect(within(dialog).getByTestId('grid-suggestion')).toHaveTextContent('1×1 frames of 128×192 px')
    expect(within(dialog).getByLabelText('Id')).toHaveValue('objects/old-man')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Actor (4 directions)' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].id).toBe('characters/old-man')
    expect(saved[0].def).toMatchObject({ name: 'Old man', facing: 'four', profile: 'actor4' })
    expect(validateCharacter(saved[0].def, { imageSizes: { 'sprites/hero/run.png': SIZE } })).toMatchObject({ ok: true, warnings: [] })
  })

  it('cannot create without a picture or with a taken id', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: /New character/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled()
    chooseOption(within(dialog).getByRole('combobox', { name: 'Picture' }), 'props/ball.png')
    fireEvent.change(within(dialog).getByLabelText('Id'), { target: { value: 'characters/hero' } })
    fireEvent.blur(within(dialog).getByLabelText('Id'))
    expect(within(dialog).getByText('A character with this id already exists.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled()
  })
})

describe('Animations tab: frame picking', () => {
  it('click appends, shift extends a range, a row header adds a row, clear empties; Save writes the frames', async () => {
    const { saved } = setup()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    const chosen = () => within(screen.getByLabelText('Chosen frames')).queryAllByRole('button', { name: /^Remove frame/ }).map((b) => b.textContent)
    expect(chosen()).toEqual(['0', '1', '2', '3'])
    click(frame(9))
    expect(chosen()).toEqual(['0', '1', '2', '3', '9'])
    click(frame(12), { shiftKey: true })
    expect(chosen().slice(5)).toEqual(['9', '10', '11', '12'])
    fireEvent.click(screen.getByRole('button', { name: 'Row 2' }))
    expect(chosen().slice(-4)).toEqual(['4', '5', '6', '7'])
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(chosen()).toEqual([])
    click(frame(5))
    click(frame(6))
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].def.clips.walk.byFacing?.down).toEqual([5, 6])
    expect(saved[0].def.clips.walk.byFacing?.left).toEqual([4, 5, 6, 7]) // other facings untouched
  })

  it('dragging draws a marquee of frames', async () => {
    setup()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.mouseDown(frame(1))
    fireEvent.mouseUp(frame(6))
    expect(within(screen.getByLabelText('Chosen frames')).getAllByRole('button', { name: /^Remove frame/ }).map((b) => b.textContent)).toEqual(['1', '2', '5', '6'])
  })

  it('a facing can mirror another: its frames are replaced by the flip and the saved clip stays valid', async () => {
    const { saved } = setup()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    fireEvent.click(screen.getByRole('radio', { name: '← Left' }))
    choose('Use frames of', 'right')
    expect(screen.getByText(/shows the frames of → Right, flipped/)).toBeInTheDocument()
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].def.clips.walk.mirror).toEqual({ left: 'right' })
    expect(saved[0].def.clips.walk.byFacing?.left).toBeUndefined()
    expect(validateCharacter(saved[0].def).ok).toBe(true)
  })

  it('auto-assign rows gives down/left/right/up the first four rows', async () => {
    const scrambled = newCharacter('actor', 'Hero', 'sprites/hero/walk.png', SIZE)
    scrambled.clips.walk.byFacing = { down: [0], left: [0], right: [0], up: [0] }
    const { saved } = setup(scrambled)
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    fireEvent.click(screen.getByRole('button', { name: /Auto-assign rows/ }))
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].def.clips.walk.byFacing).toEqual({ down: [0, 1, 2, 3], left: [4, 5, 6, 7], right: [8, 9, 10, 11], up: [12, 13, 14, 15] })
  })
})

describe('Animations tab: fields', () => {
  it('toggles loop and directional, edits fps and renames keeping the binding', async () => {
    const { saved } = setup()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Loop' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Directional' }))
    const fps = screen.getByRole('textbox', { name: 'FPS' })
    fireEvent.change(fps, { target: { value: '12' } })
    fireEvent.blur(fps)
    const name = screen.getByRole('textbox', { name: 'Animation name' })
    fireEvent.change(name, { target: { value: 'stroll' } })
    fireEvent.blur(name)
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    const d = saved[0].def
    expect(d.clips.stroll).toMatchObject({ loop: false, directional: false, fps: 12, frames: [0, 1, 2, 3] })
    expect(d.bindings.walk).toBe('stroll')
    expect(d.clips.walk).toBeUndefined()
  })

  it('a rename that clashes shows why and changes nothing', async () => {
    setup()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    const name = screen.getByRole('textbox', { name: 'Animation name' })
    fireEvent.change(name, { target: { value: 'idle' } })
    fireEvent.blur(name)
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
  })

  it('adds and deletes animations; deleting unbinds', async () => {
    const { saved } = setup()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Add animation' }))
    expect(screen.getByRole('textbox', { name: 'Animation name' })).toHaveValue('animation')
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete animation' }))
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(Object.keys(saved[0].def.clips)).toEqual(['idle', 'animation'])
    expect(saved[0].def.bindings).toEqual({ idle: 'idle' })
  })

  it('the preview shows the effective fps the game would use (follow speed × speed)', async () => {
    setup()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    const fps = () => screen.getByTestId('effective-fps').textContent
    expect(fps()).toBe('8 fps') // reference speed 100 = entity speed 100
    const entity = screen.getByRole('textbox', { name: 'Entity speed' })
    fireEvent.change(entity, { target: { value: '200' } })
    fireEvent.blur(entity)
    expect(fps()).toBe('16 fps')
    const speed = screen.getByRole('textbox', { name: 'Preview speed' })
    fireEvent.change(speed, { target: { value: '0.5' } })
    fireEvent.blur(speed)
    expect(fps()).toBe('8 fps')
    fireEvent.click(screen.getByRole('switch', { name: 'Follow movement speed' }))
    expect(fps()).toBe('4 fps')
  })
})

describe('Sheets tab', () => {
  it('derives the frame size from columns × rows and shows a summary', async () => {
    const { saved } = setup()
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Sheets' }))
    const cols = screen.getByRole('textbox', { name: 'Columns of walk' })
    fireEvent.change(cols, { target: { value: '8' } })
    fireEvent.blur(cols)
    expect(screen.getByRole('textbox', { name: 'Frame width of walk' })).toHaveValue('16')
    fireEvent.click(screen.getByRole('button', { name: /^walk/ })) // collapsing a section shows its one-line summary
    expect(screen.getByText('16×48 px · margin 0 · 8×4 = 32 frames')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].def.sheets.walk).toMatchObject({ frameWidth: 16, frameHeight: 48 })
  })

  it('a sheet in use cannot be removed; a new one can be added and then removed', async () => {
    setup()
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Sheets' }))
    expect(screen.getByRole('button', { name: 'Remove sheet walk' })).toBeDisabled()
    choose('Add a sheet from', 'sprites/hero/run.png')
    expect(screen.getByRole('button', { name: 'Remove sheet sheet' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove sheet sheet' }))
    expect(screen.queryByRole('button', { name: 'Remove sheet sheet' })).toBeNull()
  })

  it('warns when the cut does not divide the image', async () => {
    setup()
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Sheets' }))
    const w = screen.getByRole('textbox', { name: 'Frame width of walk' })
    fireEvent.change(w, { target: { value: '30' } })
    fireEvent.blur(w)
    expect(within(screen.getByLabelText('Problems')).getByText(/128px wide, which does not divide into 4 columns of 30px/)).toBeInTheDocument()
  })
})

describe('Setup tab', () => {
  it('changing facing to None explains the impact first; bindings, still frame and profile are editable', async () => {
    const { saved } = setup()
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Setup' }))
    fireEvent.click(screen.getByRole('radio', { name: 'None' }))
    expect(screen.getByRole('alert')).toHaveTextContent('2 directional animations will become plain ones')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    choose('Binding run', 'walk')
    fireEvent.change(screen.getByLabelText('New binding'), { target: { value: 'swim.walk' } })
    fireEvent.blur(screen.getByLabelText('New binding'))
    fireEvent.click(screen.getByRole('button', { name: '+ Add binding' }))
    choose('Still sheet', 'walk')
    choose('Profile', '')
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    const d = saved[0].def
    expect(d.bindings).toMatchObject({ run: 'walk', 'swim.walk': 'idle' })
    expect(d.still).toEqual({ sheet: 'walk', frame: 0 })
    expect(d.profile).toBeUndefined()
    expect(d.facing).toBe('four')
  })

  it('confirming the facing change converts directional animations', async () => {
    const { saved } = setup()
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Setup' }))
    fireEvent.click(screen.getByRole('radio', { name: 'None' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change facing' }))
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].def.facing).toBe('none')
    expect(saved[0].def.clips.walk.directional).toBe(false)
  })

  it('shows the profile checklist with live pass/fail', async () => {
    setup()
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Setup' }))
    expect(within(screen.getByLabelText('Profile checklist')).getAllByText(/✓/).length).toBeGreaterThan(0)
    choose('Profile', 'prop')
    expect(within(screen.getByLabelText('Profile checklist')).getByText(/facing must be "none"/)).toBeInTheDocument()
  })

  it('an empty name is an error that blocks saving; Revert restores the stored character', async () => {
    setup()
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Setup' }))
    const name = screen.getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.blur(name)
    expect(within(screen.getByLabelText('Problems')).getByText(/no name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Revert/ }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Hero')
    expect(screen.queryByLabelText('Problems')).toBeNull()
  })
})

// ── phase 6: where-used, safe rename, delete guard ──────────────────────────────────────────────

const node = (id: string, type: string, params: Record<string, unknown>) => ({ id, type, params, out: {}, x: 0, y: 0 })
const townMap = () => ({
  name: 'Town', fileName: 'town.json', folderPath: null, width: 6, height: 6, schemaVersion: 4, layers: [],
  entities: [
    { id: 'npc', name: 'Old man', x: 0, y: 0, components: {
      Sprite: { asset: 'characters/hero', animation: '' },
      Event: { states: [{ id: 's1', name: 'Talk', conditions: [], trigger: 'action', faceOnInteract: true, solid: null, appearance: {},
        graph: { nodes: [node('start', 'start', {}), node('p', 'playAnimation', { target: 'self', animation: 'walk' })], frames: [] } }] },
    } },
    { id: 'other', name: 'Other', x: 0, y: 0, components: { Sprite: { asset: 'objects/chest', animation: '' } } },
  ],
})

describe('Used by', () => {
  it('lists the maps, entities and events that use the character, filters by animation, and shows the header count', async () => {
    setup(undefined, '/database?table=characters&id=characters/hero&tab=used-by', [townMap()])
    const tab = await screen.findByTestId('used-by-tab')
    await waitFor(() => expect(within(tab).getByText('Old man')).toBeInTheDocument())
    expect(within(tab).getByText('Town')).toBeInTheDocument()
    expect(within(tab).getAllByRole('link', { name: 'Open' }).length).toBe(2) // Sprite + Play Animation node
    expect(screen.getByRole('button', { name: /Used in \d+/ })).toHaveTextContent(/Used in [2-9]/) // includes the NPC prefab
    chooseOption(within(tab).getByRole('combobox', { name: 'Filter by animation' }), 'walk')
    expect(within(tab).getAllByRole('link', { name: 'Open' }).length).toBe(1)
    expect(within(tab).getByText(/Play Animation node/)).toBeInTheDocument()
    chooseOption(within(tab).getByRole('combobox', { name: 'Filter by animation' }), 'idle')
    expect(within(tab).getByText(/No map or event plays “idle”/)).toBeInTheDocument()
    expect(within(tab).getByText('sprites/hero/walk.png')).toBeInTheDocument()
  })

  it('animation counts show next to the animation names', async () => {
    setup(undefined, '/database?table=characters&id=characters/hero', [townMap()])
    await open()
    await waitFor(() => expect(screen.getByRole('button', { name: /^walk/ })).toHaveTextContent(/· \d/))
  })
})

describe('rename and delete', () => {
  it('renaming previews the rewrite, then renames the record and rewrites every map that uses it', async () => {
    const renameCharacter = vi.fn(() => Promise.resolve({ success: true, id: 'characters/elder' }))
    const saveMap = vi.fn(() => Promise.resolve({ success: true }))
    setup(undefined, '/database?table=characters&id=characters/hero', [townMap()], { renameCharacter, saveMap })
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename…' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('New id')
    fireEvent.change(input, { target: { value: 'characters/elder' } })
    fireEvent.blur(input)
    expect(within(dialog).getByTestId('rename-preview')).toHaveTextContent(/1 map file will be rewritten/)
    expect(within(dialog).getByTestId('rename-preview')).toHaveTextContent(/Town › Old man › Sprite/)
    fireEvent.click(within(dialog).getByRole('button', { name: /Rewrite & rename/ }))
    await waitFor(() => expect(renameCharacter).toHaveBeenCalledWith('characters/hero', 'characters/elder'))
    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1))
    const saved = saveMap.mock.calls[0] as unknown as [null, string, { entities: { components: { Sprite: { asset: string } } }[] }]
    expect(saved[1]).toBe('town.json')
    expect(saved[2].entities[0].components.Sprite.asset).toBe('characters/elder')
  })

  it('refuses a taken or invalid id and leaves the button disabled', async () => {
    setup(undefined, '/database?table=characters&id=characters/hero', [townMap()])
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename…' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('New id')
    fireEvent.change(input, { target: { value: '../x' } })
    fireEvent.blur(input)
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/letters/)
    expect(within(dialog).getByRole('button', { name: /Rewrite & rename/ })).toBeDisabled()
  })

  it('delete is blocked with the list of references while the character is used', async () => {
    const deleteCharacter = vi.fn(() => Promise.resolve({ success: true }))
    setup(undefined, '/database?table=characters&id=characters/hero', [townMap()], { deleteCharacter })
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete…' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('delete-blocked')).toHaveTextContent(/Town › Old man › Sprite/)
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(deleteCharacter).not.toHaveBeenCalled()
  })

  it('an unused character can be deleted', async () => {
    const deleteCharacter = vi.fn(() => Promise.resolve({ success: true }))
    const spare = newCharacter('prop', 'Spare', 'props/ball.png', { width: 24, height: 24 })
    setup(undefined, '/database?table=characters&id=objects/spare', [], {
      deleteCharacter,
      getCharacters: () => Promise.resolve({ success: true, characters: [{ id: 'objects/spare', def: spare, images }], graphics, images, folders: [], warnings: [] }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete…' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByTestId('delete-blocked')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteCharacter).toHaveBeenCalledWith('objects/spare'))
  })

  it('renaming an animation and saving rewrites the maps that name it', async () => {
    const saveMap = vi.fn(() => Promise.resolve({ success: true }))
    const { saved } = setup(undefined, '/database?table=characters&id=characters/hero', [townMap()], { saveMap })
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^walk/ }))
    const name = screen.getByRole('textbox', { name: 'Animation name' })
    fireEvent.change(name, { target: { value: 'stroll' } })
    fireEvent.blur(name)
    save()
    await waitFor(() => expect(saved).toHaveLength(1))
    await waitFor(() => expect(saveMap).toHaveBeenCalledTimes(1))
    const written = (saveMap.mock.calls[0] as unknown as [null, string, { entities: { components: { Event: { states: { graph: { nodes: { params: { animation?: string } }[] } }[] } } }[] }])[2]
    expect(written.entities[0].components.Event.states[0].graph.nodes[1].params.animation).toBe('stroll')
  })
})
