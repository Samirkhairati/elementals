import { describe, expect, it } from 'vitest'
import { appendFrame, cloneMeta, isDraftDirty, nextAnimationName, parseFrameList, removeFrameAt, switchableKinds, validateDraft, withKind } from './spriteDraft'
import { countSpriteUsage } from './usage'
import { frameIndexAt } from './SheetViewer'
import { characterMeta, objectMeta } from '@/test/editorContext'
import { makeEntity, makeMap } from '@/test/helpers'

describe('spriteDraft', () => {
  it('clones and detects changes', () => {
    const saved = objectMeta()
    const draft = cloneMeta(saved)
    expect(isDraftDirty(draft, saved)).toBe(false)
    draft.frameWidth = 8
    expect(isDraftDirty(draft, saved)).toBe(true)
    expect(saved.frameWidth).toBe(24)
  })

  it('only objects and animated assets can switch kind', () => {
    expect(switchableKinds('character')).toEqual(['character'])
    expect(switchableKinds('object')).toEqual(['object', 'animated'])
    expect(withKind(objectMeta(), 'animated').kind).toBe('animated')
    const hero = characterMeta()
    expect(withKind(hero, 'object')).toBe(hero)
  })

  it('names new animations without clashes', () => {
    expect(nextAnimationName([])).toBe('anim')
    expect(nextAnimationName(['anim'])).toBe('anim2')
    expect(nextAnimationName(['anim', 'anim2'])).toBe('anim3')
  })

  it('edits frame lists', () => {
    const a = { frames: [0, 1], fps: 8, loop: true }
    expect(appendFrame(a, 4).frames).toEqual([0, 1, 4])
    expect(removeFrameAt(appendFrame(a, 4), 0).frames).toEqual([1, 4])
    expect(a.frames).toEqual([0, 1])
  })

  it('parses frame lists with ranges and ignores junk', () => {
    expect(parseFrameList('0, 1, 2')).toEqual([0, 1, 2])
    expect(parseFrameList('0-3, 5')).toEqual([0, 1, 2, 3, 5])
    expect(parseFrameList('3-1')).toEqual([3, 2, 1])
    expect(parseFrameList('a, -2, 4')).toEqual([4])
    expect(parseFrameList('')).toEqual([])
  })

  it('validates metadata and sheet sizes', () => {
    const meta = characterMeta()
    expect(validateDraft(meta, { 'walk.png': { width: 128, height: 192 }, 'run.png': { width: 128, height: 192 } }).warnings).toEqual([])
    const bad = validateDraft(meta, { 'walk.png': { width: 100, height: 192 }, 'run.png': { width: 128, height: 192 } })
    expect(bad.warnings.join(' ')).toMatch(/needs 4x4/)
    // sheets that are still decoding produce no dimension warnings
    expect(validateDraft(meta, {}).warnings).toEqual([])
    expect(validateDraft(meta, {}, ['walk.png']).warnings.join(' ')).toMatch(/"run.png" was not found/)
    const broken = { ...objectMeta(), animations: { a: { frames: [], fps: 8, loop: true } } }
    expect(validateDraft(broken, {}).errors.join(' ')).toMatch(/frames must be a non-empty list/)
  })
})

describe('countSpriteUsage', () => {
  it('counts entities per asset across maps, including event page appearance overrides', () => {
    const maps = [
      makeMap({ fileName: 'a.json', entities: [makeEntity('1', { components: { Sprite: { asset: 'x/a' } } }), makeEntity('2', { components: { Sprite: { asset: 'x/a' }, Event: { pages: [{ appearance: { asset: 'x/b' } }, { appearance: { asset: 'x/a' } }] } } })] }),
      makeMap({ fileName: 'b.json', entities: [makeEntity('3', { components: { Sprite: { asset: 'x/b' } } }), makeEntity('4', { components: {} })] }),
    ]
    expect(countSpriteUsage(maps)).toEqual({ 'x/a': 2, 'x/b': 2 })
  })

  it('prefers the live entities of the active map', () => {
    const maps = [makeMap({ fileName: 'a.json', folderPath: null, entities: [makeEntity('1', { components: { Sprite: { asset: 'x/a' } } })] })]
    const live = [makeEntity('1', { components: { Sprite: { asset: 'x/z' } } })]
    expect(countSpriteUsage(maps, { fileName: 'a.json', folderPath: null, entities: live })).toEqual({ 'x/z': 1 })
  })
})

describe('frameIndexAt', () => {
  const p = { frameWidth: 16, frameHeight: 16, margin: 2, spacing: 1, columns: 3, rows: 2 }
  it('finds the frame under a point on the sheet', () => {
    expect(frameIndexAt(3, 3, p)).toBe(0)
    expect(frameIndexAt(2 + 17 + 1, 3, p)).toBe(1)
    expect(frameIndexAt(3, 2 + 17 + 1, p)).toBe(3)
    expect(frameIndexAt(2 + 34 + 5, 2 + 17 + 5, p)).toBe(5)
  })
  it('returns null on margins, gaps and outside the grid', () => {
    expect(frameIndexAt(1, 1, p)).toBeNull()
    expect(frameIndexAt(2 + 16, 4, p)).toBeNull() // the 1px gap
    expect(frameIndexAt(200, 3, p)).toBeNull()
  })
})
