// Keyboard shortcuts: the catalogue of actions, their default keys, and the pure maths to match a key press against the
// current bindings (defaults + the author's overrides). Components register handlers by action id (hooks/useShortcuts);
// the Settings > Shortcuts page edits the overrides (store/shortcutStore).
//
// A binding is a string like "Mod+Shift+N": modifiers in the order Ctrl, Meta, Mod, Alt, Shift, then one key.
// `Mod` means Ctrl or Cmd (either), `Ctrl` / `Meta` mean exactly that key.

import { MAIN_VIEWS } from '@/lib/views'

export interface ShortcutAction {
  id: string
  label: string
  /** Heading on the settings page. */
  group: string
  /** Bindings used until the author changes them (an action can have several). */
  defaults: string[]
  /** Fires while a text field has focus too (only for combos that cannot be typed, such as Ctrl+Tab). */
  inTextFields?: boolean
}

const VIEW_COUNT = MAIN_VIEWS.length

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'edit.undo', label: 'Undo', group: 'Edit', defaults: ['Mod+Z'] },
  { id: 'edit.redo', label: 'Redo', group: 'Edit', defaults: ['Mod+Shift+Z', 'Mod+Y'] },
  { id: 'edit.delete', label: 'Delete selection', group: 'Edit', defaults: ['Delete', 'Backspace'] },
  { id: 'tool.brush', label: 'Brush tool', group: 'Tools', defaults: ['B'] },
  { id: 'tool.eraser', label: 'Eraser tool', group: 'Tools', defaults: ['E'] },
  { id: 'tool.rectangle', label: 'Rectangle tool', group: 'Tools', defaults: ['M'] },
  { id: 'tool.bucket', label: 'Bucket tool', group: 'Tools', defaults: ['G'] },
  { id: 'view.next', label: 'Next view', group: 'Views', defaults: ['Ctrl+Tab'], inTextFields: true },
  { id: 'view.prev', label: 'Previous view', group: 'Views', defaults: ['Ctrl+Shift+Tab'], inTextFields: true },
  ...Array.from({ length: VIEW_COUNT }, (_, i) => ({
    id: `view.go${i + 1}`,
    label: `Go to view ${i + 1}`,
    group: 'Views',
    defaults: [`Ctrl+${i + 1}`],
    inTextFields: true,
  })),
]

const BY_ID = new Map(SHORTCUT_ACTIONS.map(a => [a.id, a]))
export const shortcutAction = (id: string): ShortcutAction | undefined => BY_ID.get(id)

export type Overrides = Record<string, string[]>
export type Bindings = Record<string, string[]>

/** Defaults with the author's overrides on top (an override replaces all defaults of that action; `[]` unbinds it). */
export function resolveBindings(overrides: Overrides = {}): Bindings {
  const out: Bindings = {}
  for (const a of SHORTCUT_ACTIONS) out[a.id] = overrides[a.id] ?? a.defaults
  return out
}

// ── combos ─────────────────────────────────────────────────────────────────────────────────────

export interface Combo {
  ctrl: boolean
  meta: boolean
  mod: boolean
  alt: boolean
  shift: boolean
  key: string
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'AltGraph'])

/** The key name used in bindings: letters upper-case, digits as digits, other keys as `KeyboardEvent.key`. */
function keyName(e: Pick<KeyboardEvent, 'key' | 'code'>, useCode: boolean): string {
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5)
  if (useCode && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3)
  if (e.key === ' ') return 'Space'
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

/** The binding string for a key press, or null while only a modifier is held. */
export function comboFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Meta')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(keyName(e, e.altKey))
  return parts.join('+')
}

export function parseCombo(binding: string): Combo | null {
  const parts = binding.split('+')
  const key = parts.pop()
  if (!key) return null
  const mods = new Set(parts)
  return { ctrl: mods.has('Ctrl'), meta: mods.has('Meta'), mod: mods.has('Mod'), alt: mods.has('Alt'), shift: mods.has('Shift'), key }
}

type PressLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

export function matchesCombo(combo: Combo, e: PressLike): boolean {
  if (keyName(e, e.altKey) !== combo.key) return false
  if (e.altKey !== combo.alt || e.shiftKey !== combo.shift) return false
  if (combo.mod) return (e.ctrlKey || e.metaKey) && !combo.ctrl && !combo.meta
  return e.ctrlKey === combo.ctrl && e.metaKey === combo.meta
}

/** Action ids whose binding matches this key press. */
export function matchActions(e: PressLike, bindings: Bindings): string[] {
  const hits: string[] = []
  for (const [id, list] of Object.entries(bindings)) {
    for (const b of list) {
      const combo = parseCombo(b)
      if (combo && matchesCombo(combo, e)) {
        hits.push(id)
        break
      }
    }
  }
  return hits
}

/** Human text for a binding: "⌘⇧N" on macOS, "Ctrl+Shift+N" elsewhere. */
export function formatCombo(binding: string, mac: boolean): string {
  const combo = parseCombo(binding)
  if (!combo) return binding
  const key = combo.key === 'Delete' ? 'Del' : combo.key.startsWith('Arrow') ? combo.key.slice(5) : combo.key
  if (mac) {
    return [combo.ctrl && '⌃', combo.alt && '⌥', combo.shift && '⇧', (combo.meta || combo.mod) && '⌘', key].filter(Boolean).join('')
  }
  return [combo.ctrl && 'Ctrl', combo.mod && 'Ctrl', combo.meta && 'Win', combo.alt && 'Alt', combo.shift && 'Shift', key].filter(Boolean).join('+')
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** The current display text for an action's bindings, for tooltips and menus ("" when unbound). */
export function describeBindings(id: string, bindings: Bindings, mac = isMac()): string {
  return (bindings[id] ?? []).map(b => formatCombo(b, mac)).join(' / ')
}

// ── conflicts ──────────────────────────────────────────────────────────────────────────────────

/** Two bindings fire on the same key press (a `Mod` binding covers both `Ctrl` and `Meta` ones). */
function overlaps(a: Combo, b: Combo): boolean {
  if (a.key !== b.key || a.alt !== b.alt || a.shift !== b.shift) return false
  const ctrlA = a.ctrl || a.mod
  const metaA = a.meta || a.mod
  const ctrlB = b.ctrl || b.mod
  const metaB = b.meta || b.mod
  if (a.mod || b.mod) return (ctrlA && ctrlB) || (metaA && metaB) || (a.mod && b.mod)
  return ctrlA === ctrlB && metaA === metaB
}

/** The other actions that already use `binding`, ignoring `exceptId` (the one being edited). */
export function findConflicts(binding: string, bindings: Bindings, exceptId?: string): string[] {
  const combo = parseCombo(binding)
  if (!combo) return []
  const out: string[] = []
  for (const [id, list] of Object.entries(bindings)) {
    if (id === exceptId) continue
    if (list.some(b => {
      const other = parseCombo(b)
      return other !== null && overlaps(combo, other)
    })) out.push(id)
  }
  return out
}

/** Keys that are typed into text, so a binding made of one alone must not fire while a field has focus. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null
}
