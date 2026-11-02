import { describe, expect, it } from 'vitest'
import { checkNames, sanitizeStem } from './importNames'

describe('sanitizeStem', () => {
  it('keeps the file name, minus extension, with unusable characters turned into dashes', () => {
    expect(sanitizeStem('hero.png')).toBe('hero')
    expect(sanitizeStem('Hero Walk (2).PNG')).toBe('Hero-Walk-2')
    expect(sanitizeStem('café_tiles.png')).toBe('caf-_tiles')
    expect(sanitizeStem('.hidden.png')).toBe('hidden')
    expect(sanitizeStem('___.png')).toBe('image')
    expect(sanitizeStem('???.png', 'tileset')).toBe('tileset')
  })
})

describe('checkNames', () => {
  it('passes good, free names', () => {
    expect(checkNames(['a', 'b-2', 'C_3'], new Set())).toEqual(['', '', ''])
  })

  it('flags empty, unusable and existing names', () => {
    expect(checkNames(['', 'a b', '-x', 'taken'], new Set(['taken']))).toEqual(['Give it a name.', 'Use letters, digits, “-” and “_”.', 'Use letters, digits, “-” and “_”.', 'Already exists here.'])
  })

  it('flags every row that shares a name with another, ignoring case', () => {
    expect(checkNames(['a', 'A', 'b'], new Set())).toEqual(['Used twice in this import.', 'Used twice in this import.', ''])
  })

  it('compares with existing names ignoring case', () => {
    expect(checkNames(['Hero'], new Set(['hero']))).toEqual(['Already exists here.'])
  })
})
