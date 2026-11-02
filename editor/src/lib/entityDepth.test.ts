import { describe, expect, it } from 'vitest'
import { CHARACTER_DEPTH, withCharacterDepth } from './entityDepth'

const comps = (depth: number) => ({ Transform: { x: 0, y: 0, depth }, Sprite: { asset: '' } })

describe('withCharacterDepth', () => {
  it('moves an untouched object-layer entity to the characters layer when a character sprite is chosen', () => {
    const out = withCharacterDepth(comps(10), 'characters/npc-red')
    expect(out.Transform).toMatchObject({ depth: CHARACTER_DEPTH, x: 0, y: 0 })
    expect(out.Sprite).toEqual({ asset: '' })
  })

  it('leaves objects, other depths and entities without a Transform alone', () => {
    const objects = comps(10)
    expect(withCharacterDepth(objects, 'objects/chest')).toBe(objects)
    expect(withCharacterDepth(objects, '')).toBe(objects)
    const custom = comps(7)
    expect(withCharacterDepth(custom, 'characters/npc-red')).toBe(custom)
    const bare = { Sprite: { asset: '' } }
    expect(withCharacterDepth(bare, 'characters/npc-red')).toBe(bare)
  })
})
