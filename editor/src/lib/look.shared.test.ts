import { describe, expect, it } from 'vitest'
import {
  LOOK_PRESETS,
  LUT_SIZE,
  MAX_MASKS,
  applyPreset,
  cleanLookSet,
  cleanLooksFile,
  colorFunction,
  compileLooks,
  hasDetail,
  lookDetailUniforms,
  curveTable,
  isNeutralLook,
  lookUniforms,
  mixCompiled,
  parseShader,
  rasterizeStrokes,
  resolveLook,
  sampleStrip,
  shaderParamValues,
  validateLooksFile,
  type Look,
  type LookMask,
} from '../../../shared/look/index'
import { convertEditorMapToTiled } from '../../../shared/mapExport'
import { validateEditorMap } from '../../../shared/mapSchema'
import type { EditorMap } from '../../../shared/mapTypes'

const SIZE = { subjectSize: { w: 64, h: 64 }, mapSize: { w: 320, h: 320 } }
const close = (a: number[], b: number[], eps = 0.02) => a.every((v, i) => Math.abs(v - b[i]) <= eps)

describe('look colour function', () => {
  it('changes nothing with no adjustments', () => {
    const fn = colorFunction({})
    for (const c of [[0, 0, 0], [1, 1, 1], [0.2, 0.5, 0.9], [0.73, 0.1, 0.33]] as [number, number, number][]) expect(close(fn(c), c, 1e-6)).toBe(true)
  })

  it('exposure brightens and darkens, temperature warms', () => {
    const grey: [number, number, number] = [0.4, 0.4, 0.4]
    expect(colorFunction({ exposure: 1 })(grey)[1]).toBeGreaterThan(0.45)
    expect(colorFunction({ exposure: -1 })(grey)[1]).toBeLessThan(0.35)
    const warm = colorFunction({ temperature: 60 })(grey)
    expect(warm[0]).toBeGreaterThan(warm[2])
  })

  it('saturation -100 turns colours grey', () => {
    const c = colorFunction({ saturation: -100 })([0.8, 0.2, 0.1])
    expect(Math.abs(c[0] - c[1])).toBeLessThan(0.01)
    expect(Math.abs(c[1] - c[2])).toBeLessThan(0.01)
  })

  it('a section switched off is not applied', () => {
    const fn = colorFunction({ exposure: 2, off: { light: true } })
    expect(close(fn([0.3, 0.3, 0.3]), [0.3, 0.3, 0.3], 1e-6)).toBe(true)
  })

  it('curves go through their points', () => {
    const t = curveTable([{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }])!
    expect(t[0]).toBeCloseTo(0)
    expect(t[255]).toBeCloseTo(1)
    expect(t[128]).toBeCloseTo(0.7, 1)
    expect(curveTable([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull()
  })
})

describe('compileLooks', () => {
  it('texture, clarity and dehaze are a detail pass: they add up over the stack, clamp, skip masks and an Effects eye that is off', () => {
    const only = compileLooks([{ look: { adjust: { dehaze: 40, texture: -20 } }, space: 'world' }], SIZE)
    expect(only.detail).toEqual([-0.2, 0, 0.4, 0])
    expect(hasDetail(only)).toBe(true)
    expect(only.gradeNeutral).toBe(true) // no colour change: the grade pass is skipped
    expect(only.neutral).toBe(false)
    expect(only.hasGlobal).toBe(false)
    expect(lookDetailUniforms(only)).toEqual([{ name: 'uLookDetail', type: '4f', value: [-0.2, 0, 0.4, 0] }])
    const stacked = compileLooks(
      [
        { look: { adjust: { clarity: 80 } }, space: 'subject' },
        { look: { adjust: { clarity: 70, dehaze: 10, off: { effects: true } }, masks: [{ id: 'm', name: 'M', components: [{ id: 'c', type: 'all' }], adjust: { dehaze: 100 } }] }, space: 'world' },
      ] as Parameters<typeof compileLooks>[0],
      SIZE
    )
    expect(stacked.detail).toEqual([0, 0.8, 0, 0])
    const sum = compileLooks([{ look: { adjust: { clarity: 80 } }, space: 'subject' }, { look: { adjust: { clarity: 70 } }, space: 'world' }], SIZE)
    expect(sum.detail[1]).toBe(1)
  })

  it('a detail change does not bake the LUT again', () => {
    const a = compileLooks([{ look: { adjust: { exposure: 0.3, dehaze: 10 } }, space: 'world' }], SIZE)
    const b = compileLooks([{ look: { adjust: { exposure: 0.3, dehaze: 60 } }, space: 'world' }], SIZE)
    expect(b.lut).toBe(a.lut)
    expect(b.key).not.toBe(a.key)
  })

  it('bakes the LUT so a lookup matches the colour function', () => {
    const adjust = { exposure: 0.5, contrast: 20, saturation: 30, temperature: -20 }
    const compiled = compileLooks([{ look: { adjust }, space: 'world' }], SIZE)
    const fn = colorFunction(adjust)
    for (const c of [[0.1, 0.5, 0.9], [0.5, 0.5, 0.5], [0.95, 0.3, 0.05]] as [number, number, number][]) {
      expect(close(sampleStrip(compiled.lut, compiled.lutWidth, 0, c), fn(c), 0.03)).toBe(true)
    }
    expect(compiled.lutWidth).toBe(LUT_SIZE * LUT_SIZE)
    expect(compiled.hasGlobal).toBe(true)
    expect(compiled.neutral).toBe(false)
  })

  it('an empty or disabled look is neutral', () => {
    expect(compileLooks([{ look: {}, space: 'world' }], SIZE).neutral).toBe(true)
    expect(compileLooks([{ look: { enabled: false, adjust: { exposure: 2 } }, space: 'world' }], SIZE).neutral).toBe(true)
  })

  it('packs masks in order and leaves out what is over the limit', () => {
    const mask = (i: number): LookMask => ({ id: `m${i}`, name: `M${i}`, components: [{ id: `c${i}`, mode: 'add', type: 'all' }], adjust: { exposure: 1 } })
    const look: Look = { masks: Array.from({ length: MAX_MASKS + 1 }, (_, i) => mask(i)) }
    const compiled = compileLooks([{ look, space: 'subject' }], SIZE)
    expect(compiled.maskCount).toBe(MAX_MASKS)
    expect(compiled.warnings.length).toBe(1)
    expect(compiled.maskIndex).toMatchObject({ m0: 0, m1: 1 })
    // mask 1: amount 1, not inverted, starts at component 1, one component
    expect([...compiled.masks.subarray(4, 8)]).toEqual([1, 0, 1, 1])
  })

  it('rasterizes brush strokes into their channel', () => {
    const look: Look = { masks: [{ id: 'm', name: 'Brush', adjust: { exposure: 1 }, components: [{ id: 'b', mode: 'add', type: 'brush', strokes: [{ points: [32, 32, 40, 32], size: 8, feather: 0, flow: 1 }] }] }] }
    const compiled = compileLooks([{ look, space: 'subject' }], SIZE)
    expect(compiled.brush).not.toBeNull()
    const res = compiled.brushSize
    const at = (x: number, y: number) => compiled.brush![(Math.floor((y / 64) * res) * res + Math.floor((x / 64) * res)) * 4]
    expect(at(33, 32)).toBe(255)
    expect(at(5, 5)).toBe(0)
  })

  it('an eraser stroke takes paint away', () => {
    const out = new Uint8Array(64 * 64 * 4)
    rasterizeStrokes([{ points: [32, 32], size: 20, feather: 0, flow: 1 }, { points: [32, 32], size: 5, feather: 0, flow: 1, erase: true }], 64, 64, 64, out, 2)
    expect(out[(32 * 64 + 32) * 4 + 2]).toBe(0)
    expect(out[(32 * 64 + 45) * 4 + 2]).toBe(255)
    expect(out[(32 * 64 + 45) * 4]).toBe(0)
  })

  it('uniforms carry the placement and the mask preview', () => {
    const compiled = compileLooks([{ look: { adjust: { exposure: 1 } }, space: 'world' }], SIZE)
    const u = Object.fromEntries(lookUniforms(compiled, { subject: { ox: 10, oy: 20, sx: -1, sy: 1 }, frame: { x: 0, y: 0, w: 100, h: 50 }, preview: { mask: 2, mode: 'bw' } }).map((x) => [x.name, x.value]))
    expect(u.uLookSubject).toEqual([10, 20, -1, 1])
    expect(u.uLookPreview).toEqual([2, 1, 1, 0])
  })

  it('mixes two looks for a transition', () => {
    const a = compileLooks([{ look: { adjust: { exposure: -2 } }, space: 'world' }], SIZE)
    const b = compileLooks([{ look: { adjust: { exposure: 2 } }, space: 'world' }], SIZE)
    const mid = mixCompiled(a, b, 0.5)
    const g = (l: typeof a) => sampleStrip(l.lut, l.lutWidth, 0, [0.4, 0.4, 0.4])[0]
    expect(g(mid)).toBeGreaterThan(g(a))
    expect(g(mid)).toBeLessThan(g(b))
    expect(mixCompiled(a, b, 0)).toBe(a)
  })
})

describe('look sets, profiles and presets', () => {
  it('cleans stored looks: clamps, drops junk, keeps a clean value unchanged', () => {
    const set = cleanLookSet({ default: { adjust: { exposure: 99, contrast: 'x', hsl: { red: { h: 10 } } }, masks: [{ id: 'm', components: [{ id: 'c', type: 'radial', mode: 'add', cx: 1, cy: 2, rx: 3, ry: 4 }, { type: 'bogus' }] }] }, profiles: { night: { adjust: {} } } })!
    expect(set.default!.adjust).toEqual({ exposure: 5, hsl: { red: { h: 10 } } })
    expect(set.default!.masks![0].components).toHaveLength(1)
    expect(cleanLookSet(set)).toEqual(set)
    expect(cleanLookSet({})).toBeUndefined()
  })

  it('resolves the profile look, else the default; disabled looks are none', () => {
    const set = { default: { adjust: { exposure: 1 } }, profiles: { night: { adjust: { exposure: -2 } }, off: { enabled: false } } }
    expect(resolveLook(set, 'night')!.adjust!.exposure).toBe(-2)
    expect(resolveLook(set, 'day')!.adjust!.exposure).toBe(1)
    expect(resolveLook(set, null)!.adjust!.exposure).toBe(1)
    expect(resolveLook(set, 'off')).toBeNull()
  })

  it('every preset is clean and does something', () => {
    for (const p of LOOK_PRESETS) {
      const look = applyPreset(undefined, p)
      expect(cleanLookSet({ default: look })!.default).toEqual(look)
      expect(isNeutralLook(look)).toBe(false)
    }
  })

  it('applying a preset keeps the masks and shaders', () => {
    const masks: LookMask[] = [{ id: 'm', name: 'M', components: [], adjust: {} }]
    const look = applyPreset({ adjust: { exposure: 3 }, masks, shaders: [{ id: 's', shader: 'x' }] }, LOOK_PRESETS[0])
    expect(look.masks).toBe(masks)
    expect(look.shaders).toHaveLength(1)
    expect(look.adjust!.exposure).not.toBe(3)
  })

  it('looks.json falls back to the default profiles and validates ids', () => {
    expect(cleanLooksFile(null).profiles.map((p) => p.id)).toEqual(['day', 'sunset', 'night'])
    expect(cleanLooksFile({ profiles: [{ id: 'a' }, { id: 'a' }], start: 'a' })).toEqual({ version: 1, profiles: [{ id: 'a', name: 'a' }], start: 'a' })
    expect(validateLooksFile({ profiles: [{ id: 'a' }, { id: 'a' }] })).toHaveLength(1)
  })
})

describe('user shaders', () => {
  it('reads the annotations', () => {
    const info = parseShader('fx/ripple', `// @name Ripple\n// @animated\n// @pad 6\nuniform float amount; // @param 0 2 0.5 Wave amount\nuniform vec3 tint; // @color #ff0000 Tint\nvoid main(){}`)
    expect(info).toMatchObject({ name: 'Ripple', animated: true, pad: 6 })
    expect(info.params[0]).toMatchObject({ name: 'amount', min: 0, max: 2, default: 0.5, label: 'Wave amount', color: false })
    expect(info.params[1]).toMatchObject({ name: 'tint', color: true, default: [1, 0, 0] })
    expect(shaderParamValues(info, { amount: 1.5, tint: [1] })).toEqual({ amount: 1.5, tint: [1, 0, 0] })
  })
})

describe('looks in maps', () => {
  const map: EditorMap = {
    name: 'm',
    width: 2,
    height: 2,
    schemaVersion: 5,
    look: { default: { adjust: { exposure: -1 } } },
    layers: [
      { id: 't', name: 'Ground', type: 'tile', visible: true, data: {}, look: { profiles: { night: { adjust: { saturation: -50 } } } } },
      { id: 'i', name: 'Pics', type: 'image', visible: true, images: [{ id: 'p', graphicId: 'a.png', x: 0, y: 0, look: { default: { vignette: { amount: -30 } } } }], look: { default: { adjust: { tint: 10 } } } },
    ],
  }

  it('validates and exports the map, layer and picture looks as JSON properties', () => {
    expect(validateEditorMap(map).errors).toEqual([])
    const tiled = convertEditorMapToTiled(map, [])
    const prop = (props: { name: string; value: unknown }[] | undefined) => JSON.parse(String(props?.find((p) => p.name === 'look')?.value))
    expect(prop(tiled.properties)).toEqual(map.look)
    expect(prop(tiled.layers[0].properties)).toEqual(map.layers![0].look)
    expect(prop(tiled.layers[1].properties)).toEqual(map.layers![1].look)
    expect(prop(tiled.layers[1].objects![0].properties)).toEqual(map.layers![1].images![0].look)
  })

  it('a map without looks exports exactly as before', () => {
    const plain: EditorMap = { ...map, look: undefined, layers: [{ id: 't', name: 'Ground', type: 'tile', visible: true, data: {} }] }
    const tiled = convertEditorMapToTiled(plain, [])
    expect(tiled.properties).toBeUndefined()
    expect(tiled.layers[0].properties).toBeUndefined()
  })
})
