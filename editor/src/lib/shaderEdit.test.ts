import { describe, expect, it } from 'vitest'
import { colorParamValue, isValidShaderId, lineStart, parseShaderErrors, shaderIdProblem, uniqueShaderId, vecToHex } from './shaderEdit'

describe('shaderEdit', () => {
  it('maps compile errors to lines of the user file', () => {
    expect(parseShaderErrors(null)).toEqual([])
    expect(parseShaderErrors("ERROR: 0:7: 'foo' : undeclared identifier\nERROR: 0:9: bad\n")).toEqual([
      { line: 7, message: "'foo' : undeclared identifier" },
      { line: 9, message: 'bad' },
    ])
    expect(parseShaderErrors('link failed')).toEqual([{ line: null, message: 'link failed' }])
  })

  it('finds the start of a line', () => {
    expect(lineStart('ab\ncd\nef', 1)).toBe(0)
    expect(lineStart('ab\ncd\nef', 3)).toBe(6)
    expect(lineStart('ab\ncd', 9)).toBe(3)
  })

  it('validates ids like the store', () => {
    expect(isValidShaderId('samples/crt-2')).toBe(true)
    for (const bad of ['', 'Upper', 'a b', '/a', 'a//b', 'a/']) expect(isValidShaderId(bad)).toBe(false)
    expect(shaderIdProblem('a', ['a', 'b'])).toMatch(/exists/)
    expect(shaderIdProblem('a', ['a'], 'a')).toBeNull()
    expect(uniqueShaderId('x', ['x', 'x-2'])).toBe('x-3')
  })

  it('converts colour params', () => {
    expect(vecToHex([1, 0, 0.5])).toBe('#ff0080')
    expect(colorParamValue([0, 0, 0, 0.5], '#ff0000')).toEqual([1, 0, 0, 0.5])
    expect(colorParamValue([0, 0, 0], '#00ff00')).toEqual([0, 1, 0])
  })
})
