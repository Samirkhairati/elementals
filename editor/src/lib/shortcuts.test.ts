import { describe, expect, it } from 'vitest'
import { SHORTCUT_ACTIONS, comboFromEvent, describeBindings, findConflicts, formatCombo, matchActions, parseCombo, resolveBindings } from './shortcuts'

const press = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}, code = '') => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('catalogue', () => {
  it('has unique ids and at least one default binding per action', () => {
    expect(new Set(SHORTCUT_ACTIONS.map(a => a.id)).size).toBe(SHORTCUT_ACTIONS.length)
    expect(SHORTCUT_ACTIONS.every(a => a.defaults.length > 0)).toBe(true)
  })

  it('has no conflicting defaults', () => {
    const bindings = resolveBindings()
    for (const a of SHORTCUT_ACTIONS) for (const b of a.defaults) expect(findConflicts(b, bindings, a.id)).toEqual([])
  })
})

describe('matching', () => {
  const bindings = resolveBindings()

  it('Mod matches Ctrl and Cmd, nothing else', () => {
    expect(matchActions(press('z', { ctrlKey: true }), bindings)).toEqual(['edit.undo'])
    expect(matchActions(press('z', { metaKey: true }), bindings)).toEqual(['edit.undo'])
    expect(matchActions(press('z'), bindings)).toEqual([])
    expect(matchActions(press('z', { ctrlKey: true, altKey: true }), bindings)).toEqual([])
  })

  it('Shift is part of the combo: redo, not undo', () => {
    expect(matchActions(press('Z', { ctrlKey: true, shiftKey: true }), bindings)).toEqual(['edit.redo'])
    expect(matchActions(press('y', { metaKey: true }), bindings)).toEqual(['edit.redo'])
  })

  it('plain keys only match without modifiers', () => {
    expect(matchActions(press('b'), bindings)).toEqual(['tool.brush'])
    expect(matchActions(press('b', { ctrlKey: true }), bindings)).toEqual([])
    expect(matchActions(press('Delete'), bindings)).toEqual(['edit.delete'])
  })

  it('Ctrl+Tab, Ctrl+Shift+Tab and Ctrl+digit are the view shortcuts; Cmd does not match Ctrl bindings', () => {
    expect(matchActions(press('Tab', { ctrlKey: true }), bindings)).toEqual(['view.next'])
    expect(matchActions(press('Tab', { ctrlKey: true, shiftKey: true }), bindings)).toEqual(['view.prev'])
    expect(matchActions(press('2', { ctrlKey: true }, 'Digit2'), bindings)).toEqual(['view.go2'])
    expect(matchActions(press('2', { metaKey: true }, 'Digit2'), bindings)).toEqual([])
  })

  it('an override replaces the defaults of that action, and [] unbinds it', () => {
    const custom = resolveBindings({ 'tool.brush': ['Q'], 'tool.eraser': [] })
    expect(matchActions(press('q'), custom)).toEqual(['tool.brush'])
    expect(matchActions(press('b'), custom)).toEqual([])
    expect(matchActions(press('e'), custom)).toEqual([])
  })

  it('Alt combos use the physical key, because Alt changes `key` on macOS', () => {
    const custom = resolveBindings({ 'tool.brush': ['Alt+N'] })
    expect(matchActions(press('˜', { altKey: true }, 'KeyN'), custom)).toEqual(['tool.brush'])
  })
})

describe('comboFromEvent', () => {
  it('builds the binding string, ignores bare modifiers', () => {
    expect(comboFromEvent(press('n', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+N')
    expect(comboFromEvent(press('Tab', { ctrlKey: true }))).toBe('Ctrl+Tab')
    expect(comboFromEvent(press('1', { ctrlKey: true }, 'Digit1'))).toBe('Ctrl+1')
    expect(comboFromEvent(press('Control', { ctrlKey: true }))).toBeNull()
  })

  it('round-trips with parseCombo', () => {
    expect(parseCombo('Ctrl+Shift+N')).toMatchObject({ ctrl: true, shift: true, alt: false, key: 'N' })
  })
})

describe('conflicts', () => {
  const bindings = resolveBindings()
  it('finds the action that already has a key, ignoring the one being edited', () => {
    expect(findConflicts('B', bindings)).toEqual(['tool.brush'])
    expect(findConflicts('B', bindings, 'tool.brush')).toEqual([])
    expect(findConflicts('Q', bindings)).toEqual([])
  })

  it('a Mod binding overlaps the Ctrl and Cmd versions of the same key', () => {
    expect(findConflicts('Ctrl+Z', bindings)).toEqual(['edit.undo'])
    expect(findConflicts('Meta+Z', bindings)).toEqual(['edit.undo'])
    expect(findConflicts('Ctrl+Shift+Z', bindings)).toEqual(['edit.redo'])
  })
})

describe('display', () => {
  it('writes Mac and other keys the usual way', () => {
    expect(formatCombo('Mod+Shift+N', true)).toBe('⇧⌘N')
    expect(formatCombo('Mod+Shift+N', false)).toBe('Ctrl+Shift+N')
    expect(formatCombo('Ctrl+Tab', true)).toBe('⌃Tab')
    expect(describeBindings('edit.redo', resolveBindings(), false)).toBe('Ctrl+Shift+Z / Ctrl+Y')
    expect(describeBindings('nope', resolveBindings(), false)).toBe('')
  })
})
