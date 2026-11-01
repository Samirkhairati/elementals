import { describe, expect, it } from 'vitest'
import { validateCharacter, type CharacterDef } from '../../../shared/engine/characters'
import {
  KIND_LABELS, KIND_ORDER, PRESET_FOLDERS, addClip, addSheet, autoAssignRows, characterKind, cutFromGrid, deleteClip, facingChangeImpact, framesFor, marqueeFrames, newCharacter, pickFrame, removeSheet,
  renameClip, rowFrames, setBinding, setDirectional, setFacingMode, setFrames, setMirror, setPivot, setTags, sheetSummary, sheetUsers, slugify, suggestGrid, uniqueKey, updateClip, updateSheet,
} from './characterEdit'

const size = { width: 128, height: 192 }
const actor = () => newCharacter('actor', 'Hero', 'sprites/hero/walk.png', size)

describe('suggestGrid / newCharacter', () => {
  it('suggests 4×4 frames of 32×48 for a 128×192 actor image', () => {
    expect(suggestGrid('actor', 128, 192)).toEqual({ columns: 4, rows: 4, frameWidth: 32, frameHeight: 48 })
  })
  it('props are the whole picture; a strip of squares becomes an animation row', () => {
    expect(suggestGrid('prop', 24, 24)).toEqual({ columns: 1, rows: 1, frameWidth: 24, frameHeight: 24 })
    expect(suggestGrid('animated', 96, 32)).toEqual({ columns: 3, rows: 1, frameWidth: 32, frameHeight: 32 })
    expect(suggestGrid('animated', 100, 32)).toMatchObject({ columns: 1 })
    expect(suggestGrid('actor', 2, 2)).toMatchObject({ columns: 2, rows: 2, frameWidth: 1 })
  })
  it('each preset yields a valid character with the right shape', () => {
    const a = actor()
    expect(validateCharacter(a, { imageSizes: { 'sprites/hero/walk.png': size } })).toMatchObject({ ok: true, errors: [], warnings: [] })
    expect(a).toMatchObject({ facing: 'four', profile: 'actor4', bindings: { idle: 'idle', walk: 'walk' } })
    expect(a.clips.walk.byFacing?.left).toEqual([4, 5, 6, 7])
    expect(a.clips.walk.followSpeed).toEqual({ reference: 100 })
    const prop = newCharacter('prop', ' ', 'a.png', { width: 24, height: 24 })
    expect(prop).toMatchObject({ name: 'New sprite', facing: 'none', still: { sheet: 'sheet', frame: 0 }, clips: {} })
    expect(validateCharacter(prop).ok).toBe(true)
    const anim = newCharacter('animated', 'Flower', 'f.png', { width: 96, height: 32 })
    expect(anim.clips.idle.frames).toEqual([0, 1, 2])
    expect(validateCharacter(anim).ok).toBe(true)
  })
  it('slugify and uniqueKey', () => {
    expect(slugify('Old Man!')).toBe('old-man')
    expect(slugify('***')).toBe('character')
    expect(uniqueKey({ sheet: 1, 'sheet-2': 1 }, 'Sheet')).toBe('sheet-3')
  })
})

describe('sheets', () => {
  it('adds a sheet with a suggested cut, edits it and refuses to remove a sheet in use', () => {
    const { def, key } = addSheet(actor(), 'sprites/hero/run.png', size, 'run')
    expect(key).toBe('run')
    expect(def.sheets.run).toMatchObject({ frameWidth: 32, frameHeight: 48 })
    const edited = updateSheet(def, 'run', { margin: 1, pivot: { x: 0.5, y: 0.75 } })
    expect(edited.sheets.run).toMatchObject({ margin: 1, pivot: { x: 0.5, y: 0.75 } })
    expect(updateSheet(edited, 'run', { pivot: undefined }).sheets.run.pivot).toBeUndefined()
    expect(removeSheet(def, 'run').sheets.run).toBeUndefined()
    expect(sheetUsers(def, 'walk')).toEqual(['idle', 'walk'])
    expect(() => removeSheet(def, 'walk')).toThrow(/used by idle, walk/)
    expect(def.sheets.run).toBeDefined() // input untouched
  })
  it('derives the frame size from columns and rows and summarises the cut', () => {
    expect(cutFromGrid(size, 4, 4)).toEqual({ frameWidth: 32, frameHeight: 48 })
    expect(cutFromGrid({ width: 38, height: 20 }, 3, 1, 1, 2)).toEqual({ frameWidth: 10, frameHeight: 18 })
    expect(sheetSummary(actor().sheets.walk, size)).toBe('32×48 px · margin 0 · 4×4 = 16 frames')
    expect(sheetSummary(actor().sheets.walk)).toBe('32×48 px · margin 0')
  })
})

describe('clips', () => {
  it('adds a directional clip on a four-facing character and a plain one otherwise', () => {
    const { def, name } = addClip(actor(), 'Attack', 'walk')
    expect(name).toBe('attack')
    expect(def.clips.attack).toMatchObject({ directional: true, byFacing: { down: [0], left: [0], right: [0], up: [0] } })
    expect(validateCharacter(def).ok).toBe(true) // a fresh animation is valid right away
    const p = addClip(newCharacter('prop', 'P', 'a.png', { width: 8, height: 8 }), 'Open', 'sheet')
    expect(p.def.clips.open).toMatchObject({ directional: false, frames: [0] })
    expect(addClip(def, 'attack', 'walk').name).toBe('attack-2')
  })
  it('renames keeping bindings, and refuses clashes and bad names', () => {
    const renamed = renameClip(actor(), 'walk', 'stroll')
    expect(renamed.bindings.walk).toBe('stroll')
    expect(Object.keys(renamed.clips)).toEqual(['idle', 'stroll'])
    expect(() => renameClip(actor(), 'walk', 'idle')).toThrow(/already exists/)
    expect(() => renameClip(actor(), 'walk', 'bad name')).toThrow(/letters/)
    expect(() => renameClip(actor(), 'nope', 'x')).toThrow(/does not exist/)
    expect(renameClip(actor(), 'walk', 'walk')).toEqual(actor())
  })
  it('deleting a clip unbinds it', () => {
    const { def, unbound } = deleteClip(actor(), 'walk')
    expect(unbound).toEqual(['walk'])
    expect(def.bindings).toEqual({ idle: 'idle' })
    expect(validateCharacter(def).ok).toBe(true)
  })
  it('toggling directional converts frames both ways', () => {
    const plain = setDirectional(actor(), 'walk', false)
    expect(plain.clips.walk).toMatchObject({ directional: false, frames: [0, 1, 2, 3] })
    expect(plain.clips.walk.byFacing).toBeUndefined()
    const back = setDirectional(plain, 'walk', true)
    expect(back.clips.walk.byFacing?.up).toEqual([0, 1, 2, 3])
    const already = actor()
    expect(setDirectional(already, 'walk', true)).toBe(already) // nothing to change
  })
  it('sets frames per facing (clearing a mirror) and mirrors one facing from another', () => {
    let d = setMirror(actor(), 'walk', 'left', 'right')
    expect(d.clips.walk.mirror).toEqual({ left: 'right' })
    expect(d.clips.walk.byFacing?.left).toBeUndefined()
    expect(validateCharacter(d).ok).toBe(true)
    d = setFrames(d, 'walk', 'left', [9, 9])
    expect(d.clips.walk.mirror).toBeUndefined()
    expect(framesFor(d.clips.walk, 'left')).toEqual([9, 9])
    expect(() => setMirror(actor(), 'walk', 'left', 'left')).toThrow(/itself/)
    expect(setMirror(setMirror(actor(), 'walk', 'left', 'right'), 'walk', 'left', null).clips.walk.mirror).toBeUndefined()
    expect(framesFor(actor().clips.walk, null)).toEqual([])
    const plain = setFrames(setDirectional(actor(), 'walk', false), 'walk', null, [3, 2])
    expect(framesFor(plain.clips.walk, 'down')).toEqual([3, 2])
  })
  it('updateClip drops undefined keys (follow speed off)', () => {
    const d = updateClip(actor(), 'walk', { followSpeed: undefined, fps: 12, mode: 'pingpong' })
    expect(d.clips.walk.followSpeed).toBeUndefined()
    expect('followSpeed' in d.clips.walk).toBe(false)
    expect(d.clips.walk).toMatchObject({ fps: 12, mode: 'pingpong' })
  })
  it('auto-assign rows fills down, left, right, up from consecutive rows', () => {
    const d = autoAssignRows(setFrames(actor(), 'walk', 'down', [9]), 'walk', 4)
    expect(d.clips.walk.byFacing).toEqual({ down: [0, 1, 2, 3], left: [4, 5, 6, 7], right: [8, 9, 10, 11], up: [12, 13, 14, 15] })
    expect(autoAssignRows(actor(), 'walk', 3, [2, 1, 0, 3]).clips.walk.byFacing?.down).toEqual([6, 7, 8])
    const plain = setDirectional(actor(), 'walk', false)
    expect(autoAssignRows(plain, 'walk', 4)).toBe(plain)
  })
})

describe('frame picking', () => {
  it('click appends, ctrl toggles the last occurrence, shift extends a range from the anchor in either direction', () => {
    expect(pickFrame([0, 1], 5)).toEqual([0, 1, 5])
    expect(pickFrame([0, 1, 1], 1, { toggle: true })).toEqual([0, 1])
    expect(pickFrame([0], 4, { toggle: true })).toEqual([0, 4])
    expect(pickFrame([], 5, { shift: true, anchor: 2 })).toEqual([2, 3, 4, 5])
    expect(pickFrame([9], 1, { shift: true, anchor: 3 })).toEqual([9, 1, 2, 3])
    expect(pickFrame([], 2, { shift: true })).toEqual([2]) // no anchor yet: a plain click
  })
  it('marquee covers the rectangle row by row, and a row header covers its row', () => {
    expect(marqueeFrames(4, { col: 1, row: 0 }, { col: 2, row: 1 })).toEqual([1, 2, 5, 6])
    expect(marqueeFrames(4, { col: 2, row: 1 }, { col: 1, row: 0 })).toEqual([1, 2, 5, 6])
    expect(rowFrames(4, 2)).toEqual([8, 9, 10, 11])
  })
})

describe('setup', () => {
  it('bindings, facing mode, pivot and tags', () => {
    expect(setBinding(actor(), 'swim.walk', 'walk').bindings['swim.walk']).toBe('walk')
    expect(setBinding(actor(), 'walk', null).bindings.walk).toBeUndefined()
    expect(facingChangeImpact(actor(), 'none').invalid).toEqual(['idle', 'walk'])
    expect(facingChangeImpact(actor(), 'four').invalid).toEqual([])
    const none = setFacingMode(actor(), 'none')
    expect(none.facing).toBe('none')
    expect(none.clips.walk.directional).toBe(false)
    expect(validateCharacter(none).errors).toEqual([])
    expect(setFacingMode(actor(), 'four').facing).toBe('four')
    expect(setPivot(actor(), { x: 2, y: -1 }).pivot).toEqual({ x: 1, y: 0 })
    expect(setTags(actor(), [' npc ', 'npc', '', 'boss']).tags).toEqual(['npc', 'boss'])
  })
})

describe('characterKind', () => {
  it('splits actors, still objects and animated props', () => {
    const actor = newCharacter('actor', 'Hero', 'a.png', { width: 128, height: 192 })
    const still = newCharacter('prop', 'Sign', 'b.png', { width: 32, height: 32 })
    const animated = newCharacter('animated', 'Flower', 'c.png', { width: 96, height: 32 })
    expect(characterKind(actor)).toBe('actor')
    expect(characterKind(still)).toBe('object')
    expect(characterKind(animated)).toBe('animated')
    expect(KIND_ORDER.map((k) => KIND_LABELS[k])).toEqual(['Characters', 'Objects', 'Animated props'])
  })

  it('new characters of each preset go into their own folder', () => {
    expect(PRESET_FOLDERS).toEqual({ actor: 'characters', prop: 'objects', animated: 'animated' })
  })
})
