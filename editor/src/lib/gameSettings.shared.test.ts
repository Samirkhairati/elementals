import { describe, expect, it } from 'vitest'
import { GAME_SETTINGS_SCHEMA, VIEW_ASPECT, defaultGameSettings, normalizeGameSettings, viewSizeForTiles, withSetting } from '../../../shared/gameSettings'

describe('game settings', () => {
  it('defaults come from the schema, and every field has a label and an info text', () => {
    const d = defaultGameSettings()
    expect(d.display.visibleTilesX).toBe(32)
    expect(d.camera.followLag).toBe(0.08)
    expect(d.movement.tileBased).toBe(true)
    for (const cat of GAME_SETTINGS_SCHEMA) for (const f of cat.fields) {
      expect(f.label).toBeTruthy()
      expect(f.info).toBeTruthy()
      if (f.kind === 'number') expect(f.default).toBeGreaterThanOrEqual(f.min)
    }
  })

  it('the default view is 32 x 18 tiles at 16:9', () => {
    expect(VIEW_ASPECT).toBeCloseTo(16 / 9)
    expect(viewSizeForTiles(32)).toEqual({ width: 1024, height: 576 })
    expect(viewSizeForTiles(40)).toEqual({ width: 1280, height: 720 })
  })

  it('anything unusable falls back and numbers are clamped to their range and step', () => {
    expect(normalizeGameSettings(null)).toEqual(defaultGameSettings())
    expect(normalizeGameSettings([1, 2])).toEqual(defaultGameSettings())
    const s = normalizeGameSettings({
      display: { visibleTilesX: 500, integerScaling: 'yes', pixelSnapping: true, extra: 1 },
      camera: { followLag: 0.07999999 },
      movement: { playerSpeed: 5, turnDelayMs: Number.NaN },
      unknown: {},
    })
    expect(s.display).toEqual({ visibleTilesX: 64, integerScaling: false, pixelSnapping: true })
    expect(s.camera.followLag).toBe(0.08)
    expect(s.movement).toEqual({ tileBased: true, playerSpeed: 40, turnDelayMs: 50 })
    expect(s).not.toHaveProperty('unknown')
  })

  it('withSetting changes one value and cleans it', () => {
    const base = defaultGameSettings()
    expect(withSetting(base, 'display', 'visibleTilesX', 36.4).display.visibleTilesX).toBe(36)
    expect(withSetting(base, 'movement', 'tileBased', false).movement.tileBased).toBe(false)
    expect(base.display.visibleTilesX).toBe(32) // the original is untouched
  })
})
