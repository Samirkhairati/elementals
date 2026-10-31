/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import {
  animationFrameAt,
  buildAnimationRegistrations,
  buildSpriteManifest,
  characterAnimKey,
  characterFrameIndex,
  checkSheetDimensions,
  defaultSpriteMeta,
  frameRect,
  objectAnimKey,
  previewFrame,
  sheetGrid,
  spriteFileUrl,
  spriteSheetRoles,
  spriteTextureKey,
  validateSpriteAssets,
  validateSpriteMeta,
} from '../../../shared/engine/index'
import type { SpriteAssetMeta } from '../../../shared/engine/index'

const character = (over: Partial<SpriteAssetMeta> = {}): SpriteAssetMeta => ({
  version: 1, name: 'Player', kind: 'character', frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1,
  character: { sheets: { walk: 'walk.png', run: 'run.png' }, framesPerDirection: 4, idleFrame: 1, walkFps: 8, runFps: 12 },
  ...over,
})
const chest = (over: Partial<SpriteAssetMeta> = {}): SpriteAssetMeta => ({
  version: 1, name: 'Chest', kind: 'animated', frameWidth: 32, frameHeight: 32, margin: 1, spacing: 2, pivotX: 0.5, pivotY: 1, sheet: 'chest.png',
  animations: { open: { frames: [0, 1, 2], fps: 10, loop: false }, shine: { frames: [3, 4], fps: 4, loop: true } },
  ...over,
})

describe('naming contract', () => {
  it('builds the documented keys', () => {
    expect(spriteTextureKey('characters/player', 'walk')).toBe('sprite:characters/player:walk')
    expect(characterAnimKey('characters/player', 'run', 'left')).toBe('sprite:characters/player:run-left')
    expect(characterAnimKey('characters/player', 'idle', 'up')).toBe('sprite:characters/player:idle-up')
    expect(objectAnimKey('objects/chest', 'open')).toBe('sprite:objects/chest:open')
    expect(spriteFileUrl('characters/player', 'walk.png')).toBe('graphics/sprites/characters/player/walk.png')
  })
})

describe('validateSpriteMeta', () => {
  it('accepts valid metadata of each kind', () => {
    expect(validateSpriteMeta(character())).toEqual({ ok: true, errors: [], warnings: [] })
    expect(validateSpriteMeta(chest()).ok).toBe(true)
    expect(validateSpriteMeta(defaultSpriteMeta('object', { sheetWidth: 32, sheetHeight: 32 })).ok).toBe(true)
  })

  const bad: [string, (m: any) => void, RegExp][] = [
    ['version', (m) => (m.version = 2), /version/],
    ['name', (m) => (m.name = 1), /name/],
    ['kind', (m) => (m.kind = 'tile'), /kind/],
    ['frameWidth', (m) => (m.frameWidth = 0), /frameWidth/],
    ['frameHeight fractional', (m) => (m.frameHeight = 1.5), /frameHeight/],
    ['margin', (m) => (m.margin = -1), /margin/],
    ['pivot', (m) => (m.pivotX = 2), /pivotX/],
    ['character section', (m) => delete m.character, /character/],
    ['walk sheet', (m) => (m.character.sheets.walk = ''), /sheets\.walk/],
    ['run sheet', (m) => (m.character.sheets.run = 5), /sheets\.run/],
    ['framesPerDirection', (m) => (m.character.framesPerDirection = 0), /framesPerDirection/],
    ['idleFrame range', (m) => (m.character.idleFrame = 4), /idleFrame/],
    ['walkFps', (m) => (m.character.walkFps = 0), /walkFps/],
  ]
  for (const [name, mutate, re] of bad) {
    it(`rejects character: ${name}`, () => {
      const m: any = character()
      mutate(m)
      const res = validateSpriteMeta(m)
      expect(res.ok).toBe(false)
      expect(res.errors.join('\n')).toMatch(re)
    })
  }

  const badObj: [string, (m: any) => void, RegExp][] = [
    ['sheet', (m) => delete m.sheet, /sheet/],
    ['animations type', (m) => (m.animations = []), /animations/],
    ['frames empty', (m) => (m.animations.open.frames = []), /frames/],
    ['frames negative', (m) => (m.animations.open.frames = [-1]), /frames/],
    ['fps', (m) => (m.animations.open.fps = 0), /fps/],
    ['loop', (m) => (m.animations.open.loop = 'yes'), /loop/],
    ['animation object', (m) => (m.animations.open = 3), /must be an object/],
  ]
  for (const [name, mutate, re] of badObj) {
    it(`rejects animated: ${name}`, () => {
      const m: any = chest()
      mutate(m)
      const res = validateSpriteMeta(m)
      expect(res.ok).toBe(false)
      expect(res.errors.join('\n')).toMatch(re)
    })
  }

  it('warns for animated without animations and never throws on garbage', () => {
    expect(validateSpriteMeta(chest({ animations: {} })).warnings.join()).toMatch(/at least one animation/)
    for (const v of [null, undefined, 3, 'x', [], {}]) {
      expect(() => validateSpriteMeta(v)).not.toThrow()
      expect(validateSpriteMeta(v).ok).toBe(false)
    }
  })
})

describe('defaultSpriteMeta', () => {
  it('character: 4x4 grid, walk.png, valid', () => {
    const m = defaultSpriteMeta('character', { sheetWidth: 128, sheetHeight: 192, name: 'Hero' })
    expect(m).toMatchObject({ kind: 'character', name: 'Hero', frameWidth: 32, frameHeight: 48, pivotX: 0.5, pivotY: 1 })
    expect(m.character).toEqual({ sheets: { walk: 'walk.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 8, runFps: 12 })
    expect(validateSpriteMeta(m)).toEqual({ ok: true, errors: [], warnings: [] })
  })
  it('object: the whole sheet is one frame', () => {
    const m = defaultSpriteMeta('object', { sheetWidth: 40, sheetHeight: 50 })
    expect(m).toMatchObject({ kind: 'object', frameWidth: 40, frameHeight: 50, sheet: 'sheet.png', animations: {} })
    expect(validateSpriteMeta(m).ok).toBe(true)
  })
  it('animated: square frames in a row with a looping idle', () => {
    const m = defaultSpriteMeta('animated', { sheetWidth: 128, sheetHeight: 32 })
    expect(m).toMatchObject({ frameWidth: 32, frameHeight: 32 })
    expect(m.animations!.idle).toEqual({ frames: [0, 1, 2, 3], fps: 8, loop: true })
    expect(validateSpriteMeta(m)).toEqual({ ok: true, errors: [], warnings: [] })
  })
  it('survives silly sizes', () => {
    for (const kind of ['character', 'object', 'animated'] as const) {
      expect(validateSpriteMeta(defaultSpriteMeta(kind, { sheetWidth: 0, sheetHeight: NaN })).ok).toBe(true)
    }
  })
})

describe('sheetGrid / frameRect', () => {
  it('counts frames with margin and spacing', () => {
    expect(sheetGrid(character(), 128, 192)).toEqual({ columns: 4, rows: 4, count: 16 })
    expect(sheetGrid(chest(), 1 * 2 + 3 * 32 + 2 * 2, 36)).toEqual({ columns: 3, rows: 1, count: 3 })
    expect(sheetGrid(character(), 10, 10)).toEqual({ columns: 0, rows: 0, count: 0 })
  })

  it('character rects use framesPerDirection columns', () => {
    expect(frameRect(character(), 0, 128)).toEqual({ x: 0, y: 0, w: 32, h: 48 })
    expect(frameRect(character(), 5, 128)).toEqual({ x: 32, y: 48, w: 32, h: 48 })
    expect(frameRect(character(), 15, 999)).toEqual({ x: 96, y: 144, w: 32, h: 48 })
  })

  it('other rects honour margin, spacing and the image width', () => {
    // width 104 -> 3 columns of 32 with margin 1 / spacing 2
    expect(frameRect(chest(), 0, 104)).toEqual({ x: 1, y: 1, w: 32, h: 32 })
    expect(frameRect(chest(), 2, 104)).toEqual({ x: 1 + 2 * 34, y: 1, w: 32, h: 32 })
    expect(frameRect(chest(), 4, 104)).toEqual({ x: 1 + 1 * 34, y: 1 + 34, w: 32, h: 32 })
    expect(frameRect(chest(), -3, 104)).toEqual({ x: 1, y: 1, w: 32, h: 32 })
  })
})

describe('characterFrameIndex', () => {
  const m = character()
  it('rows are down, left, right, up; idle uses idleFrame', () => {
    expect(characterFrameIndex(m, 'down', 'idle', 999)).toBe(1)
    expect(characterFrameIndex(m, 'left', 'idle', 0)).toBe(5)
    expect(characterFrameIndex(m, 'right', 'idle', 0)).toBe(9)
    expect(characterFrameIndex(m, 'up', 'idle', 0)).toBe(13)
  })
  it('walk and run cycle through the row at their fps', () => {
    // walkFps 8 -> a frame every 125 ms
    expect([0, 124, 125, 250, 375, 500].map((t) => characterFrameIndex(m, 'left', 'walk', t))).toEqual([4, 4, 5, 6, 7, 4])
    // runFps 12
    expect([0, 83, 84, 167, 250].map((t) => characterFrameIndex(m, 'up', 'run', t))).toEqual([12, 12, 13, 14, 15])
    expect(characterFrameIndex(m, 'down', 'walk', -50)).toBe(0)
  })
  it('non-character metadata gives 0', () => {
    expect(characterFrameIndex(chest(), 'down', 'walk', 100)).toBe(0)
  })
})

describe('animationFrameAt', () => {
  it('loops or holds the last frame', () => {
    const loop = { frames: [3, 4], fps: 4, loop: true }
    expect([0, 250, 500, 750].map((t) => animationFrameAt(loop, t))).toEqual([3, 4, 3, 4])
    const once = { frames: [0, 1, 2], fps: 10, loop: false }
    expect([0, 100, 200, 5000].map((t) => animationFrameAt(once, t))).toEqual([0, 1, 2, 2])
    expect(animationFrameAt({ frames: [], fps: 1, loop: true }, 5)).toBe(0)
  })
})

describe('previewFrame (what editor and game show)', () => {
  const m = character()
  it('character: idle by default, facing picks the row, rect is computed without an image width', () => {
    const p = previewFrame(m, { facing: 'right', animation: '', frame: 0 }, 0)
    expect(p).toEqual({ sheetFile: 'walk.png', sheetRole: 'walk', frameIndex: 9, rect: { x: 32, y: 96, w: 32, h: 48 } })
  })
  it('character: walk and run animate; run falls back to the walk sheet when there is none', () => {
    expect(previewFrame(m, { facing: 'down', animation: 'walk', frame: 0 }, 130)).toMatchObject({ sheetFile: 'walk.png', frameIndex: 1 })
    expect(previewFrame(m, { facing: 'down', animation: 'run', frame: 0 }, 90)).toMatchObject({ sheetFile: 'run.png', sheetRole: 'run', frameIndex: 1 })
    const noRun = character({ character: { ...m.character!, sheets: { walk: 'walk.png' } } })
    expect(previewFrame(noRun, { facing: 'down', animation: 'run', frame: 0 }, 130)).toMatchObject({ sheetFile: 'walk.png', sheetRole: 'walk', frameIndex: 1 })
  })
  it('character: unknown animation names behave like idle', () => {
    expect(previewFrame(m, { facing: 'up', animation: 'dance', frame: 3 }, 400).frameIndex).toBe(13)
  })
  it('object: static frame, or a named animation', () => {
    const c = chest()
    expect(previewFrame(c, { facing: 'down', animation: '', frame: 1 }, 0, 104)).toEqual({ sheetFile: 'chest.png', sheetRole: 'sheet', frameIndex: 1, rect: { x: 35, y: 1, w: 32, h: 32 } })
    expect(previewFrame(c, { facing: 'down', animation: 'open', frame: 0 }, 105, 104).frameIndex).toBe(1)
    expect(previewFrame(c, { facing: 'down', animation: 'open', frame: 0 }, 99999, 104).frameIndex).toBe(2)
    expect(previewFrame(c, { facing: 'down', animation: 'shine', frame: 0 }, 250).frameIndex).toBe(4)
    expect(previewFrame(c, { facing: 'down', animation: 'missing', frame: 2 }, 0).frameIndex).toBe(2)
    expect(previewFrame(c, { facing: 'down', animation: '', frame: 2 }, 0).rect).toBeNull()
    expect(previewFrame(c, { facing: 'down', animation: 'toString', frame: 0 }, 0).frameIndex).toBe(0)
  })
})

describe('buildAnimationRegistrations', () => {
  it('character: idle/walk(/run) per facing with contract keys', () => {
    const regs = buildAnimationRegistrations('characters/player', character())
    expect(regs).toHaveLength(12)
    const walkLeft = regs.find((r) => r.key === 'sprite:characters/player:walk-left')!
    expect(walkLeft).toEqual({ key: 'sprite:characters/player:walk-left', textureKey: 'sprite:characters/player:walk', frames: [4, 5, 6, 7], fps: 8, loop: true })
    const runUp = regs.find((r) => r.key === 'sprite:characters/player:run-up')!
    expect(runUp).toMatchObject({ textureKey: 'sprite:characters/player:run', frames: [12, 13, 14, 15], fps: 12 })
    const idleRight = regs.find((r) => r.key === 'sprite:characters/player:idle-right')!
    expect(idleRight).toMatchObject({ frames: [9], loop: false, textureKey: 'sprite:characters/player:walk' })
    const noRun = buildAnimationRegistrations('c', character({ character: { ...character().character!, sheets: { walk: 'w.png' } } }))
    expect(noRun.some((r) => r.key.includes(':run-'))).toBe(false)
    expect(noRun).toHaveLength(8)
  })
  it('object: one registration per named animation', () => {
    expect(buildAnimationRegistrations('objects/chest', chest())).toEqual([
      { key: 'sprite:objects/chest:open', textureKey: 'sprite:objects/chest:sheet', frames: [0, 1, 2], fps: 10, loop: false },
      { key: 'sprite:objects/chest:shine', textureKey: 'sprite:objects/chest:sheet', frames: [3, 4], fps: 4, loop: true },
    ])
    expect(buildAnimationRegistrations('o', chest({ animations: undefined }))).toEqual([])
  })
})

describe('manifest', () => {
  it('lists sheets per kind', () => {
    expect(spriteSheetRoles(character())).toEqual([{ role: 'walk', file: 'walk.png' }, { role: 'run', file: 'run.png' }])
    expect(spriteSheetRoles(chest())).toEqual([{ role: 'sheet', file: 'chest.png' }])
    expect(spriteSheetRoles(chest({ sheet: undefined }))).toEqual([])
  })

  it('buildSpriteManifest is sorted, derives file URLs and copies the metadata', () => {
    const c = character()
    const manifest = buildSpriteManifest([{ id: 'objects/chest', meta: chest() }, { id: 'characters/player', meta: c }])
    expect(manifest.version).toBe(1)
    expect(manifest.sprites.map((s) => s.id)).toEqual(['characters/player', 'objects/chest'])
    expect(manifest.sprites[0].files).toEqual({
      'walk.png': 'graphics/sprites/characters/player/walk.png',
      'run.png': 'graphics/sprites/characters/player/run.png',
    })
    expect(manifest.sprites[1].files).toEqual({ 'chest.png': 'graphics/sprites/objects/chest/chest.png' })
    expect(manifest.sprites[0].meta).toEqual(c)
    expect(manifest.sprites[0].meta).not.toBe(c)
    expect(buildSpriteManifest([])).toEqual({ version: 1, sprites: [] })
    // deterministic regardless of input order
    expect(JSON.stringify(buildSpriteManifest([{ id: 'characters/player', meta: c }, { id: 'objects/chest', meta: chest() }]))).toBe(JSON.stringify(manifest))
  })

  it('validateSpriteAssets reports bad ids, duplicates and invalid metadata', () => {
    const issues = validateSpriteAssets([
      { id: 'characters/player', meta: character() },
      { id: 'characters/player', meta: character() },
      { id: '../evil', meta: character() },
      { id: 'objects/broken', meta: { version: 1 } },
    ])
    expect(issues.map((i) => i.id)).toEqual(['characters/player', '../evil', ...Array(issues.length - 2).fill('objects/broken')])
    expect(issues[0].message).toMatch(/duplicate/)
    expect(issues[1].message).toMatch(/id must be/)
    expect(validateSpriteAssets([{ id: 'a/b-c_d', meta: character() }])).toEqual([])
  })

  it('checkSheetDimensions compares image sizes with the metadata', () => {
    const m = character()
    const ok = { 'walk.png': { width: 128, height: 192 }, 'run.png': { width: 128, height: 192 } }
    expect(checkSheetDimensions(m, ok)).toEqual([])
    expect(checkSheetDimensions(m, { 'walk.png': { width: 256, height: 192 } }).join('|')).toMatch(/fits 8x4.*needs 4x4.*\|.*"run.png".*missing/)
    expect(checkSheetDimensions(chest(), { 'chest.png': { width: 20, height: 20 } }).join()).toMatch(/smaller than one frame/)
    expect(checkSheetDimensions(chest(), { 'chest.png': { width: 104, height: 36 } }).join()).toMatch(/animation "shine" uses a frame beyond/)
  })
})
