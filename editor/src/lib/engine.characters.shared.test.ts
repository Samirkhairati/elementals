/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  CHARACTER_PROFILES,
  RUN_SPEED_MULTIPLIER,
  bindingCandidates,
  buildAnimationRegistrations,
  buildClipRegistrations,
  clipAnimKey,
  clipFrameAt,
  clipFrames,
  clipPlayback,
  clipTimeScale,
  createDefaultComponent,
  effectiveFps,
  filesBySheetKey,
  legacyGraphicId,
  migrateCharacter,
  normalizeProps,
  resolveClip,
  sheetFrameRect,
  spriteMetaToCharacter,
  staticSheetKey,
  validateCharacter,
  validateSpriteMeta,
} from '../../../shared/engine/index'
import type { CharacterDef, ClipDef, SpriteAssetMeta } from '../../../shared/engine/index'

const SPRITES = path.resolve(__dirname, '../../../shared/fixtures/sprites-v1')
const assets: [string, SpriteAssetMeta][] = fs
  .readdirSync(SPRITES, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('sprite.json'))
  .map((f) => [path.dirname(f).split(path.sep).join('/'), JSON.parse(fs.readFileSync(path.join(SPRITES, f), 'utf8'))] as [string, SpriteAssetMeta])

const byKey = <T extends { key: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((r) => [r.key, r]))

describe('golden: every committed sprite.json migrates without changing what the game registers', () => {
  it('has assets to check', () => {
    expect(assets.length).toBeGreaterThanOrEqual(10)
  })

  it.each(assets)('%s', (id, meta) => {
    expect(validateSpriteMeta(meta).ok).toBe(true)
    const migrated = migrateCharacter(id, meta)
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(migrated.changed).toBe(true)

    const before = buildAnimationRegistrations(id, meta)
    const after = buildClipRegistrations(id, migrated.value)
    expect(after.length).toBe(before.length)
    expect(byKey(after)).toEqual(byKey(before)) // keys, texture keys, frames, fps and loop agree
    expect(new Set(after.map((r) => r.textureKey))).toEqual(new Set(before.map((r) => r.textureKey)))

    // the migrated record is a valid character, and every sheet maps back to the original file
    expect(validateCharacter(migrated.value)).toMatchObject({ ok: true, errors: [], warnings: [] })
    const files = Object.fromEntries(Object.values(migrated.value.sheets).map((s) => [s.image, true]))
    expect(Object.keys(files)).toEqual(Object.keys(migrated.value.sheets).map((k) => migrated.value.sheets[k].image))
    for (const sheet of Object.values(migrated.value.sheets)) {
      expect(sheet).toMatchObject({ frameWidth: meta.frameWidth, frameHeight: meta.frameHeight, margin: meta.margin, spacing: meta.spacing })
      expect(sheet.image.startsWith(`sprites/${id}/`)).toBe(true)
    }
    expect(migrated.value.pivot).toEqual({ x: meta.pivotX, y: meta.pivotY })
    expect(migrated.value.name).toBe(meta.name)
    expect(migrated.value.tags).toEqual([])
  })

  it('migration is idempotent and pure', () => {
    for (const [id, meta] of assets) {
      const snapshot = JSON.stringify(meta)
      const once = migrateCharacter(id, meta)
      expect(JSON.stringify(meta)).toBe(snapshot) // input untouched
      if (!once.ok) throw new Error('unexpected')
      const twice = migrateCharacter(id, once.value)
      expect(twice).toEqual({ ok: true, value: once.value, changed: false })
      expect(twice.ok && twice.value).toBe(once.value) // same object back
      expect(spriteMetaToCharacter(id, meta)).toEqual(once.value) // deterministic
    }
  })
})

describe('migration per spec §6', () => {
  const player = assets.find(([id]) => id === 'characters/player')![1]
  const flower = assets.find(([id]) => id === 'objects/flower')![1]
  const chest = assets.find(([id]) => id === 'objects/chest')![1]

  it('character: four facings, walk/run sheets, idle/walk/run clips and bindings', () => {
    const c = spriteMetaToCharacter('characters/player', player)
    expect(c.version).toBe(2)
    expect(c.facing).toBe('four')
    expect(Object.keys(c.sheets)).toEqual(['walk', 'run'])
    expect(c.bindings).toEqual({ idle: 'idle', walk: 'walk', run: 'run' })
    expect(c.clips.idle).toEqual({ sheet: 'walk', fps: 1, loop: false, directional: true, byFacing: { down: [0], left: [4], right: [8], up: [12] } })
    expect(c.clips.walk).toMatchObject({ sheet: 'walk', fps: 10, loop: true, directional: true })
    expect(c.clips.walk.byFacing).toEqual({ down: [0, 1, 2, 3], left: [4, 5, 6, 7], right: [8, 9, 10, 11], up: [12, 13, 14, 15] })
    expect(c.clips.run).toMatchObject({ sheet: 'run', fps: 15 })
    expect(c.clips.walk.followSpeed).toBeUndefined() // migrated data keeps today's fixed fps
    expect(c.clips.run.followSpeed).toBeUndefined()
  })

  it('character without a run sheet has no run clip or binding; idleFrame offsets the idle frames', () => {
    const meta: SpriteAssetMeta = { ...player, character: { sheets: { walk: 'walk.png' }, framesPerDirection: 4, idleFrame: 2, walkFps: 8, runFps: 12 } }
    const c = spriteMetaToCharacter('characters/npc', meta)
    expect(Object.keys(c.sheets)).toEqual(['walk'])
    expect(c.clips.run).toBeUndefined()
    expect(c.bindings).toEqual({ idle: 'idle', walk: 'walk' })
    expect(c.clips.idle.byFacing).toEqual({ down: [2], left: [6], right: [10], up: [14] })
  })

  it('animated object: facing none, one non-directional clip per animation', () => {
    const c = spriteMetaToCharacter('objects/flower', flower)
    expect(c.facing).toBe('none')
    expect(c.sheets.sheet.image).toBe(legacyGraphicId('objects/flower', 'sheet.png'))
    expect(c.clips.sway).toEqual({ sheet: 'sheet', fps: 4, loop: true, directional: false, frames: [0, 1, 2, 1] })
    expect(c.bindings).toEqual({})
    expect(c.still).toBeUndefined()
  })

  it('static object: no clips, a still frame; sheet keeps its own file name', () => {
    const c = spriteMetaToCharacter('objects/chest', chest)
    expect(c.clips).toEqual({})
    expect(c.still).toEqual({ sheet: 'sheet', frame: 0 })
    const pokeball = assets.find(([id]) => id === 'objects/pokeball')![1]
    expect(spriteMetaToCharacter('objects/pokeball', pokeball).sheets.sheet.image).toBe(`sprites/objects/pokeball/${pokeball.sheet}`)
  })

  it('rejects an invalid v1 file with the reasons, and passes v2 through', () => {
    const bad = migrateCharacter('x', { version: 1, kind: 'ghost' })
    expect(bad.ok).toBe(false)
    expect(bad.ok === false && bad.errors.length).toBeGreaterThan(0)
    expect(migrateCharacter('x', null).ok).toBe(false)
  })

  it('files are re-keyed by sheet key', () => {
    expect(filesBySheetKey(player, { 'walk.png': 'a/walk.png', 'run.png': 'a/run.png' })).toEqual({ walk: 'a/walk.png', run: 'a/run.png' })
    expect(filesBySheetKey(chest, { 'sheet.png': 'c.png' })).toEqual({ sheet: 'c.png' })
    expect(filesBySheetKey(chest, {})).toEqual({})
  })
})

const clip = (over: Partial<ClipDef> = {}): ClipDef => ({ sheet: 'a', fps: 10, loop: true, directional: false, frames: [0, 1], ...over })
const dir = (n = 2): Pick<ClipDef, 'directional' | 'byFacing'> => ({
  directional: true,
  byFacing: { down: Array.from({ length: n }, (_, i) => i), left: [4], right: [8], up: [12] },
})
const def = (over: Partial<CharacterDef> = {}): CharacterDef => ({
  version: 2, name: 'T', tags: [], facing: 'four', pivot: { x: 0.5, y: 1 },
  sheets: { a: { image: 'g/a.png', frameWidth: 32, frameHeight: 32, margin: 0, spacing: 0 } },
  clips: {}, bindings: {}, ...over,
})

describe('resolveClip fallback table (§5.4)', () => {
  const clips = Object.fromEntries(['idle', 'walk', 'run', 'swim_idle', 'swim', 'swim_run'].map((n) => [n, clip()]))
  const all = { clips, bindings: { idle: 'idle', walk: 'walk', run: 'run', 'swim.idle': 'swim_idle', 'swim.walk': 'swim', 'swim.run': 'swim_run' } }

  it('lists candidates in the documented order', () => {
    expect(bindingCandidates('normal', 'run')).toEqual(['run', 'walk', 'idle'])
    expect(bindingCandidates('normal', 'walk')).toEqual(['walk', 'idle'])
    expect(bindingCandidates('normal', 'idle')).toEqual(['idle'])
    expect(bindingCandidates('swim', 'run')).toEqual(['swim.run', 'swim.walk', 'swim.idle', 'run', 'walk', 'idle'])
    expect(bindingCandidates('swim', 'walk')).toEqual(['swim.walk', 'swim.idle', 'walk', 'idle'])
    expect(bindingCandidates('swim', 'idle')).toEqual(['swim.idle', 'idle'])
  })

  it('picks the exact binding when it exists', () => {
    expect(resolveClip(all, 'normal', 'idle')).toBe('idle')
    expect(resolveClip(all, 'normal', 'walk')).toBe('walk')
    expect(resolveClip(all, 'normal', 'run')).toBe('run')
    expect(resolveClip(all, 'swim', 'idle')).toBe('swim_idle')
    expect(resolveClip(all, 'swim', 'walk')).toBe('swim')
    expect(resolveClip(all, 'swim', 'run')).toBe('swim_run')
  })

  const cases: [string, Record<string, string>, string, 'idle' | 'walk' | 'run', string | null][] = [
    ['run falls back to walk', { idle: 'idle', walk: 'walk' }, 'normal', 'run', 'walk'],
    ['run falls back to idle when only idle exists', { idle: 'idle' }, 'normal', 'run', 'idle'],
    ['walk falls back to idle', { idle: 'idle' }, 'normal', 'walk', 'idle'],
    ['idle never falls back to walk', { walk: 'walk' }, 'normal', 'idle', null],
    ['an unknown mode uses the plain bindings', { idle: 'idle', walk: 'walk', run: 'run' }, 'bike', 'walk', 'walk'],
    ['mode.run falls back to mode.walk before plain run', { 'swim.walk': 'swim', run: 'run' }, 'swim', 'run', 'swim'],
    ['mode.walk falls back to mode.idle before plain walk', { 'swim.idle': 'swim_idle', walk: 'walk' }, 'swim', 'walk', 'swim_idle'],
    ['mode falls back to plain bindings when it has none', { walk: 'walk' }, 'swim', 'walk', 'walk'],
    ['nothing bound resolves to null', {}, 'normal', 'idle', null],
    ['a binding to a missing clip is skipped', { walk: 'ghost', idle: 'idle' }, 'normal', 'walk', 'idle'],
  ]
  it.each(cases)('%s', (_label, bindings, mode, activity, expected) => {
    expect(resolveClip({ clips, bindings }, mode, activity)).toBe(expected)
  })
})

describe('effectiveFps (§5.5)', () => {
  it('is the authored fps with no follow speed and animSpeed 1', () => {
    expect(effectiveFps({ fps: 10, followSpeed: null }, 500, 1)).toBe(10)
    expect(effectiveFps({ fps: 10 }, 0, 1)).toBe(10)
  })
  it('animSpeed multiplies; 0 pauses; negative and NaN are sane', () => {
    expect(effectiveFps({ fps: 10 }, 100, 2)).toBe(20)
    expect(effectiveFps({ fps: 10 }, 100, 0)).toBe(0)
    expect(effectiveFps({ fps: 10 }, 100, -3)).toBe(0)
    expect(effectiveFps({ fps: 10 }, 100, Number.NaN)).toBe(10)
  })
  it('followSpeed scales with speed / reference, clamped to 0.25..4', () => {
    const c = { fps: 10, followSpeed: { reference: 100 } }
    expect(effectiveFps(c, 100, 1)).toBe(10)
    expect(effectiveFps(c, 200, 1)).toBe(20)
    expect(effectiveFps(c, 150, 1)).toBe(15)
    expect(effectiveFps(c, 1, 1)).toBe(2.5)
    expect(effectiveFps(c, 0, 1)).toBe(2.5)
    expect(effectiveFps(c, 10_000, 1)).toBe(40)
    expect(effectiveFps(c, 200, 0.5)).toBe(10)
  })
  it('timeScale is effective / authored', () => {
    expect(clipTimeScale({ fps: 10, followSpeed: { reference: 100 } }, 200, 1.5)).toBe(3)
    expect(clipTimeScale({ fps: 10 }, 100, 0)).toBe(0)
  })
  it('the run multiplier is the one MovementSystem uses', () => {
    expect(RUN_SPEED_MULTIPLIER).toBe(1.5)
  })
})

describe('clip frames, mirror and playback keys', () => {
  const c = clip({ ...dir(), mirror: { left: 'right' }, byFacing: { down: [0, 1], right: [8, 9], up: [12, 13] } })

  it('own frames, mirrored frames flip, non-directional serves every facing', () => {
    expect(clipFrames(c, 'right')).toEqual({ frames: [8, 9], flipX: false, source: 'right' })
    expect(clipFrames(c, 'left')).toEqual({ frames: [8, 9], flipX: true, source: 'right' })
    expect(clipFrames(clip(), 'up')).toEqual({ frames: [0, 1], flipX: false, source: null })
  })
  it('chained mirrors flip once per hop; loops and missing frames give null', () => {
    const chain = clip({ directional: true, byFacing: { down: [1] }, mirror: { left: 'up', up: 'down' } })
    expect(clipFrames(chain, 'left')).toEqual({ frames: [1], flipX: false, source: 'down' })
    expect(clipFrames(clip({ directional: true, byFacing: {}, mirror: { left: 'right', right: 'left' } }), 'left')).toBeNull()
    expect(clipFrames(clip({ directional: true, byFacing: { down: [1] } }), 'up')).toBeNull()
    expect(clipFrames(clip({ frames: [] }), 'down')).toBeNull()
  })
  it('a mirrored facing uses the source facing animation key with flipX; XOR with an authored flip is the caller\'s job', () => {
    const d = def({ clips: { walk: c } })
    expect(clipPlayback('chars/p', d, 'walk', 'left')).toMatchObject({ key: 'sprite:chars/p:walk-right', flipX: true })
    expect(clipPlayback('chars/p', d, 'walk', 'right')).toMatchObject({ key: 'sprite:chars/p:walk-right', flipX: false })
    expect(clipPlayback('chars/p', def({ clips: { sway: clip() } }), 'sway', 'left')).toMatchObject({ key: 'sprite:chars/p:sway', flipX: false })
    expect(clipPlayback('chars/p', d, 'nope', 'down')).toBeNull()
    expect(clipAnimKey('x', 'a', 'up')).toBe('sprite:x:a-up')
  })
  it('registers no animation for a mirrored facing', () => {
    const regs = buildClipRegistrations('chars/p', def({ clips: { walk: c } }))
    expect(regs.map((r) => r.key).sort()).toEqual(['sprite:chars/p:walk-down', 'sprite:chars/p:walk-right', 'sprite:chars/p:walk-up'])
  })
  it('reverse registers reversed frames, pingpong sets yoyo, clips on missing sheets are skipped', () => {
    const regs = buildClipRegistrations('x', def({ clips: { r: clip({ mode: 'reverse', frames: [0, 1, 2] }), p: clip({ mode: 'pingpong' }), bad: clip({ sheet: 'zzz' }) } }))
    expect(byKey(regs)['sprite:x:r'].frames).toEqual([2, 1, 0])
    expect(byKey(regs)['sprite:x:p'].yoyo).toBe(true)
    expect(byKey(regs)['sprite:x:bad']).toBeUndefined()
  })
  it('clipFrameAt: loop, hold last, reverse, pingpong, fps override', () => {
    expect(clipFrameAt({ fps: 10, loop: true }, [5, 6, 7], 0)).toBe(5)
    expect(clipFrameAt({ fps: 10, loop: true }, [5, 6, 7], 350)).toBe(5) // step 3 -> 0
    expect(clipFrameAt({ fps: 10, loop: false }, [5, 6, 7], 5000)).toBe(7)
    expect(clipFrameAt({ fps: 10, loop: true, mode: 'reverse' }, [5, 6, 7], 100)).toBe(6)
    const pp = { fps: 10, loop: true, mode: 'pingpong' as const }
    expect([0, 100, 200, 300, 400, 500].map((t) => clipFrameAt(pp, [5, 6, 7], t))).toEqual([5, 6, 7, 6, 5, 6])
    expect(clipFrameAt({ fps: 10, loop: true }, [5, 6, 7], 100, 20)).toBe(7)
    expect(clipFrameAt({ fps: 10, loop: true }, [], 100)).toBe(0)
  })
  it('sheet helpers', () => {
    const sheet = { image: 'x', frameWidth: 32, frameHeight: 48, margin: 1, spacing: 2 }
    expect(sheetFrameRect(sheet, 5, 32 * 4 + 2 * 3 + 2)).toEqual({ x: 1 + 1 * 34, y: 1 + 1 * 50, w: 32, h: 48 })
    expect(staticSheetKey(def({ still: { sheet: 'a', frame: 0 } }))).toBe('a')
    expect(staticSheetKey(def({ clips: { x: clip() } }))).toBe('a')
    expect(staticSheetKey({ still: undefined, clips: {}, sheets: {} })).toBeUndefined()
  })
})

describe('validateCharacter matrix (§5.7)', () => {
  const good = (): CharacterDef => def({ clips: { idle: clip({ ...dir(1) }), walk: clip({ ...dir() }) }, bindings: { idle: 'idle', walk: 'walk' } })
  const check = (mut: (d: any) => void, ctx = {}) => {
    const d: any = good()
    mut(d)
    return validateCharacter(d, ctx)
  }
  const codes = (r: ReturnType<typeof validateCharacter>, severity?: string) => r.issues.filter((i) => !severity || i.severity === severity).map((i) => i.code)

  it('accepts a good character and a bare one', () => {
    expect(validateCharacter(good())).toMatchObject({ ok: true, errors: [], warnings: [] })
    expect(validateCharacter(def({ facing: 'none' })).ok).toBe(true)
  })

  const errorCases: [string, (d: any) => void, string][] = [
    ['version', (d) => (d.version = 1), 'bad-version'],
    ['empty name', (d) => (d.name = '  '), 'empty-name'],
    ['bad tags', (d) => (d.tags = [1]), 'bad-tags'],
    ['bad facing', (d) => (d.facing = 'eight'), 'bad-facing'],
    ['pivot out of range', (d) => (d.pivot = { x: 2, y: 1 }), 'bad-pivot'],
    ['sheet pivot out of range', (d) => (d.sheets.a.pivot = { x: 0, y: -1 }), 'bad-pivot'],
    ['zero frame width', (d) => (d.sheets.a.frameWidth = 0), 'bad-frame-size'],
    ['fractional frame height', (d) => (d.sheets.a.frameHeight = 2.5), 'bad-frame-size'],
    ['negative margin', (d) => (d.sheets.a.margin = -1), 'bad-frame-gap'],
    ['negative spacing', (d) => (d.sheets.a.spacing = -1), 'bad-frame-gap'],
    ['sheet without image', (d) => (d.sheets.a.image = ''), 'missing-image'],
    ['clip with missing sheet', (d) => (d.clips.walk.sheet = 'zzz'), 'missing-sheet'],
    ['fps zero', (d) => (d.clips.walk.fps = 0), 'bad-fps'],
    ['loop not boolean', (d) => (d.clips.walk.loop = 1), 'bad-loop'],
    ['bad playback mode', (d) => (d.clips.walk.mode = 'zigzag'), 'bad-mode'],
    ['directional on facing none', (d) => (d.facing = 'none'), 'directional-without-facing'],
    ['directional clip lacking a facing', (d) => delete d.clips.walk.byFacing.up, 'missing-facing'],
    ['empty frames', (d) => (d.clips.walk.byFacing.down = []), 'bad-frames'],
    ['non-integer frames', (d) => (d.clips.walk.byFacing.down = [0.5]), 'bad-frames'],
    ['negative frames', (d) => (d.clips.walk.byFacing.down = [-1]), 'bad-frames'],
    ['non-directional clip without frames', (d) => (d.clips.walk = clip({ frames: [] })), 'bad-frames'],
    ['mirror cycle', (d) => { delete d.clips.walk.byFacing.left; delete d.clips.walk.byFacing.right; d.clips.walk.mirror = { left: 'right', right: 'left' } }, 'bad-mirror'],
    ['mirror to a facing without frames', (d) => { delete d.clips.walk.byFacing.left; d.clips.walk.mirror = { left: 'up' }; delete d.clips.walk.byFacing.up }, 'bad-mirror'],
    ['binding to a missing clip', (d) => (d.bindings.run = 'ghost'), 'binding-missing-clip'],
    ['follow speed reference zero', (d) => (d.clips.walk.followSpeed = { reference: 0 }), 'bad-follow-speed'],
    ['still on a missing sheet', (d) => (d.still = { sheet: 'zzz', frame: 0 }), 'bad-still'],
    ['key collision', (d) => (d.clips['walk-down'] = clip()), 'duplicate-key'],
  ]
  it.each(errorCases)('error: %s', (_label, mut, code) => {
    const r = check(mut)
    expect(r.ok).toBe(false)
    expect(codes(r, 'error')).toContain(code)
  })

  it('error: a sheet whose image is not a known graphic (set or predicate)', () => {
    expect(codes(check(() => undefined, { graphics: new Set(['g/a.png']) }))).toEqual([])
    expect(codes(check(() => undefined, { graphics: new Set(['other.png']) }), 'error')).toContain('unknown-graphic')
    expect(codes(check(() => undefined, { graphics: () => false }), 'error')).toContain('unknown-graphic')
  })

  it('not an object, and never throws on junk', () => {
    for (const junk of [null, 'x', 3, [], { version: 2 }, { version: 2, sheets: 3, clips: 4, bindings: 5 }]) {
      expect(() => validateCharacter(junk)).not.toThrow()
      expect(validateCharacter(junk).ok).toBe(false)
    }
  })

  const warnCases: [string, (d: any) => void, object, string][] = [
    ['frame beyond the sheet', (d) => (d.clips.walk.byFacing.down = [99]), { imageSizes: { 'g/a.png': { width: 128, height: 128 } } }, 'frame-beyond-sheet'],
    ['still beyond the sheet', (d) => (d.still = { sheet: 'a', frame: 99 }), { imageSizes: { 'g/a.png': { width: 128, height: 128 } } }, 'frame-beyond-sheet'],
    ['width not divisible', () => undefined, { imageSizes: { 'g/a.png': { width: 130, height: 128 } } }, 'width-not-divisible'],
    ['height not divisible', () => undefined, { imageSizes: { 'g/a.png': { width: 128, height: 100 } } }, 'height-not-divisible'],
    ['walk without idle', (d) => delete d.bindings.idle, {}, 'walk-without-idle'],
    ['unusual binding key', (d) => (d.bindings.fly = 'walk'), {}, 'odd-binding'],
    ['frames and mirror on the same facing', (d) => (d.clips.walk.mirror = { left: 'right' }), {}, 'frames-and-mirror'],
    ['profile not met', (d) => { d.profile = 'prop' }, {}, 'profile-unmet'],
  ]
  it.each(warnCases)('warning: %s', (_label, mut, ctx, code) => {
    const r = check(mut, ctx)
    expect(r.ok).toBe(true)
    expect(codes(r, 'warning')).toContain(code)
  })

  it('exact multiples do not warn; margin and spacing are accounted for', () => {
    const r = validateCharacter(def({ sheets: { a: { image: 'g/a.png', frameWidth: 30, frameHeight: 30, margin: 1, spacing: 2 } } }), { imageSizes: { 'g/a.png': { width: 2 + 30 * 3 + 2 * 2, height: 2 + 30 * 2 + 2 } } })
    expect(r.warnings).toEqual([])
  })

  it('info: unused clips only when the caller knows the other references', () => {
    expect(codes(check(() => undefined))).toEqual([])
    const r = check((d) => (d.clips.extra = clip()), { referencedClips: new Set<string>() })
    expect(r.issues.filter((i) => i.code === 'unused-clip').map((i) => i.path)).toEqual(['clips.extra'])
    expect(r.ok).toBe(true)
    expect(check((d) => (d.clips.extra = clip()), { referencedClips: new Set(['extra']) }).issues).toEqual([])
  })

  it('profiles: actor4 and prop', () => {
    expect(CHARACTER_PROFILES.actor4.unmet(good())).toEqual([])
    expect(CHARACTER_PROFILES.actor4.unmet(def({ facing: 'none' })).length).toBeGreaterThan(0)
    expect(CHARACTER_PROFILES.prop.unmet(def({ facing: 'none', clips: { s: clip() } }))).toEqual([])
    expect(CHARACTER_PROFILES.prop.unmet(def({ facing: 'none' }))).toEqual(['needs at least one animation or a still frame'])
    expect(check((d) => (d.profile = 'actor4')).warnings).toEqual([])
    expect(codes(check((d) => (d.profile = 'nope')), 'warning')).toContain('profile-unmet')
  })

  it('messages say what, why and how', () => {
    const r = check((d) => delete d.clips.walk.byFacing.right)
    expect(r.errors[0]).toContain('walk')
    expect(r.errors[0]).toContain('→ right')
  })
})

describe('Sprite.animSpeed', () => {
  it('defaults to 1 without a schema bump and normalises', () => {
    expect(createDefaultComponent('Sprite').animSpeed).toBe(1)
    expect(normalizeProps('Sprite', { asset: 'a' }).animSpeed).toBe(1)
    expect(normalizeProps('Sprite', { animSpeed: 2.5 }).animSpeed).toBe(2.5)
    expect(normalizeProps('Sprite', { animSpeed: 0 }).animSpeed).toBe(0)
    expect(normalizeProps('Sprite', { animSpeed: -1 }).animSpeed).toBe(0)
    expect(normalizeProps('Sprite', { animSpeed: 'fast' }).animSpeed).toBe(1)
  })
})
