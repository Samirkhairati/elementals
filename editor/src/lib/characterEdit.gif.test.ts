import { describe, expect, it } from 'vitest'
import { validateCharacter } from '../../../shared/engine/characters'
import type { CharacterDef } from '../../../shared/engine/characters'
import type { GraphicInfo } from '../../../shared/engine/graphics'
import { addGifAnimation, gifFps, gifFrames, gifGraphics, newCharacter, newGifCharacter, resetGifClip, setSheetGif, setSheetPicture, sheetSource, stillGraphics } from './characterEdit'

const gif = (frames = 3, delay = 50, id = 'sprites/boss/idle.gif'): GraphicInfo => ({
  id, width: 4 * frames, height: 3, bytes: 10, mtimeMs: 1,
  gif: { frames, frameWidth: 4, frameHeight: 3, delaysMs: new Array(frames).fill(delay) },
})
const png = (id = 'sprites/hero/walk.png'): GraphicInfo => ({ id, width: 128, height: 192, bytes: 10, mtimeMs: 1 })

const actor = (): CharacterDef => newCharacter('actor', 'Hero', 'sprites/hero/walk.png', { width: 128, height: 192 })

describe('GIF graphics in a library', () => {
  it('tells animations from still pictures', () => {
    const all = [png(), gif()]
    expect(gifGraphics(all).map((g) => g.id)).toEqual(['sprites/boss/idle.gif'])
    expect(stillGraphics(all).map((g) => g.id)).toEqual(['sprites/hero/walk.png'])
    expect(sheetSource({ image: 'a.gif' })).toBe('gif')
    expect(sheetSource({ image: 'a.png' })).toBe('sheet')
  })

  it('plays all frames, at the speed the GIF was made for', () => {
    expect(gifFrames(gif(4))).toEqual([0, 1, 2, 3])
    expect(gifFps(gif(3, 100))).toBe(10)
    expect(gifFps(gif(3, 40))).toBe(25)
  })
})

describe('newGifCharacter', () => {
  it('is a looping animation bound to idle, valid for the sheet the GIF makes', () => {
    const def = newGifCharacter('  Boss ', gif(3))
    expect(def).toMatchObject({ version: 2, name: 'Boss', facing: 'none', sheets: { gif: { image: 'sprites/boss/idle.gif', frameWidth: 4, frameHeight: 3, margin: 0, spacing: 0 } }, bindings: { idle: 'idle' } })
    expect(def.clips.idle).toEqual({ sheet: 'gif', fps: 20, loop: true, directional: false, frames: [0, 1, 2] })
    const g = gif(3)
    const result = validateCharacter(def, { graphics: new Set([g.id]), imageSizes: { [g.id]: { width: g.width, height: g.height } } })
    expect(result.issues.filter((i) => i.severity !== 'info')).toEqual([])
  })

  it('newCharacter refuses the gif preset (it needs the GIF itself)', () => {
    expect(() => newCharacter('gif', 'x', 'a.gif', { width: 1, height: 1 })).toThrow(/newGifCharacter/)
  })
})

describe('setSheetGif / setSheetPicture', () => {
  it('a sheet becomes a GIF: its animations play every frame, undirected, at the GIF speed, keeping loop, mode and pivot', () => {
    const base = actor()
    base.sheets.walk.pivot = { x: 0.25, y: 1 }
    base.clips.walk = { ...base.clips.walk, mode: 'pingpong', loop: false }
    const next = setSheetGif(base, 'walk', gif(3, 100))
    expect(next.sheets.walk).toEqual({ image: 'sprites/boss/idle.gif', frameWidth: 4, frameHeight: 3, margin: 0, spacing: 0, pivot: { x: 0.25, y: 1 } })
    expect(next.clips.walk).toEqual({ sheet: 'walk', fps: 10, loop: false, directional: false, frames: [0, 1, 2], mode: 'pingpong', followSpeed: { reference: 100 } })
    expect(next.clips.idle).toMatchObject({ directional: false, frames: [0, 1, 2] })
    expect(base.sheets.walk.image).toBe('sprites/hero/walk.png') // input untouched
  })

  it('only touches the animations of that sheet', () => {
    const base = actor()
    base.sheets.run = { ...base.sheets.walk }
    base.clips.run = { ...base.clips.walk, sheet: 'run' }
    const next = setSheetGif(base, 'run', gif())
    expect(next.clips.walk).toEqual(base.clips.walk)
    expect(next.clips.run.frames).toEqual([0, 1, 2])
  })

  it('back to a picture: a cut is suggested from its size, the frame numbers stay', () => {
    const asGif = setSheetGif(actor(), 'walk', gif())
    const back = setSheetPicture(asGif, 'walk', png('sprites/hero/other.png'))
    expect(back.sheets.walk).toMatchObject({ image: 'sprites/hero/other.png', margin: 0, spacing: 0 })
    expect(back.clips.walk.frames).toEqual([0, 1, 2])
  })
})

describe('addGifAnimation and resetGifClip', () => {
  it('adds a sheet and an animation without disturbing the rest, with unique names', () => {
    const base = actor()
    const one = addGifAnimation(base, gif(4), 'slam')
    expect(one.sheet).toBe('gif')
    expect(one.clip).toBe('slam')
    expect(one.def.sheets.gif.image).toBe('sprites/boss/idle.gif')
    expect(one.def.clips.slam).toMatchObject({ sheet: 'gif', frames: [0, 1, 2, 3], directional: false })
    expect(Object.keys(one.def.clips)).toEqual([...Object.keys(base.clips), 'slam'])
    const two = addGifAnimation(one.def, gif(2, 100, 'sprites/boss/two.gif'), 'slam')
    expect([two.sheet, two.clip]).toEqual(['gif-2', 'slam-2'])
  })

  it('reset puts back every frame and the GIF speed', () => {
    const made = addGifAnimation(actor(), gif(4), 'slam').def
    made.clips.slam = { ...made.clips.slam, frames: [0], fps: 3 }
    const reset = resetGifClip(made, 'slam', gif(4))
    expect(reset.clips.slam).toMatchObject({ frames: [0, 1, 2, 3], fps: 20 })
  })
})
