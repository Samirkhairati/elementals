import { describe, expect, it } from 'vitest'
import { checkNames, checkRowNames, sanitizeDir, sanitizeStem } from './importNames'

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

describe('sanitizeDir', () => {
  it('turns each folder name into a library name and drops what is left empty', () => {
    expect(sanitizeDir('My Trees/old oak (2)')).toBe('My-Trees/old-oak-2')
    expect(sanitizeDir('Trees/!!!/leaves')).toBe('Trees/leaves')
    expect(sanitizeDir('')).toBe('')
  })
})

describe('checkRowNames', () => {
  const none = () => new Set<string>()
  it('lets the same name sit in different folders', () => {
    expect(checkRowNames([{ dir: 'a', name: 'tree' }, { dir: 'b', name: 'tree' }], none)).toEqual(['', ''])
  })
  it('reports a repeat in the same folder and a name that already exists there', () => {
    const rows = [{ dir: 'a', name: 'tree' }, { dir: 'a', name: 'Tree' }, { dir: 'b', name: 'rock' }]
    expect(checkRowNames(rows, (dir) => new Set(dir === 'b' ? ['rock'] : []))).toEqual(['Used twice in this import.', 'Used twice in this import.', 'Already exists here.'])
  })
  it('compares across folders when names must be unique everywhere', () => {
    expect(checkRowNames([{ dir: 'a', name: 'grass' }, { dir: 'b', name: 'grass' }], none, true)).toEqual(['Used twice in this import.', 'Used twice in this import.'])
  })
})
