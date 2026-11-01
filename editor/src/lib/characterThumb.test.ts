import { describe, expect, it } from 'vitest'
import type { CharacterDef } from '../../../shared/engine/characters'
import { newCharacter } from './characterEdit'
import { thumbFrame } from './characterThumb'

const SIZE = { width: 128, height: 192 }

describe('thumbFrame', () => {
  it('uses the idle frame facing down', () => {
    const def = newCharacter('actor', 'Hero', 'a.png', SIZE)
    const idle = def.clips[def.bindings.idle]
    expect(thumbFrame(def)).toEqual({ sheet: idle.sheet, frame: idle.byFacing!.down![0] })
  })

  it('falls back to the still frame, then to the first animation, then to frame 0', () => {
    const base = newCharacter('prop', 'Chest', 'c.png', { width: 32, height: 32 })
    const still: CharacterDef = { ...base, clips: {}, bindings: {}, still: { sheet: 'sheet', frame: 3 } }
    expect(thumbFrame(still)).toEqual({ sheet: 'sheet', frame: 3 })
    const clipped: CharacterDef = { ...base, bindings: {}, still: undefined, clips: { open: { sheet: 'sheet', fps: 4, loop: false, directional: false, frames: [5, 6] } } }
    expect(thumbFrame(clipped)).toEqual({ sheet: 'sheet', frame: 5 })
    expect(thumbFrame({ ...base, clips: {}, bindings: {}, still: undefined })).toEqual({ sheet: 'sheet', frame: 0 })
  })

  it('is null for a character without sheets', () => {
    expect(thumbFrame({ ...newCharacter('prop', 'Empty', 'c.png', { width: 8, height: 8 }), sheets: {}, clips: {}, bindings: {}, still: undefined })).toBeNull()
  })
})
