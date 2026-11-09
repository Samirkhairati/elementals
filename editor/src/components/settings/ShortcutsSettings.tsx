import { useEffect, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { InfoTip } from '@/components/editor/ui/controls'
import { SHORTCUT_ACTIONS, comboFromEvent, findConflicts, formatCombo, isMac, resolveBindings, shortcutAction } from '@/lib/shortcuts'
import { useShortcutStore } from '@/store/shortcutStore'

interface Pending {
  actionId: string
  combo: string
  conflicts: string[]
}

/** Settings > Shortcuts: every action with its keys. Click + to record a new key, x to remove one, the arrow to reset. */
export function ShortcutsSettings() {
  const overrides = useShortcutStore(s => s.overrides)
  const { setBindings, reset, resetAll } = useShortcutStore.getState()
  const bindings = resolveBindings(overrides)
  const mac = isMac()
  const [recording, setRecording] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(null)
      const combo = comboFromEvent(e)
      if (!combo) return
      const conflicts = findConflicts(combo, bindings, recording)
      setRecording(null)
      if (conflicts.length > 0) setPending({ actionId: recording, combo, conflicts })
      else add(recording, combo)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, overrides])

  const add = (id: string, combo: string) => {
    const current = bindings[id] ?? []
    if (!current.includes(combo)) setBindings(id, [...current, combo])
  }
  const remove = (id: string, combo: string) => setBindings(id, (bindings[id] ?? []).filter(b => b !== combo))
  /** Use the key here and take it away from the actions that had it. */
  const takeOver = (p: Pending) => {
    for (const other of p.conflicts) setBindings(other, (bindings[other] ?? []).filter(b => findConflicts(b, { [p.actionId]: [p.combo] }).length === 0))
    add(p.actionId, p.combo)
    setPending(null)
  }

  const groups = [...new Set(SHORTCUT_ACTIONS.map(a => a.group))]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">
          Shortcuts
          <InfoTip>
            Click + on a row and press the keys you want. Esc cancels. Mod means Ctrl (or Cmd on a Mac). An action can have
            several keys. These are saved for this editor, not in the project.
          </InfoTip>
        </h2>
        <button type="button" className="ed-btn" data-size="sm" onClick={resetAll} disabled={Object.keys(overrides).length === 0}>
          <RotateCcw /> Reset all
        </button>
      </div>

      {pending && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>
            {formatCombo(pending.combo, mac)} is already used by {pending.conflicts.map(id => shortcutAction(id)?.label ?? id).join(', ')}.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="ed-btn" data-size="sm" data-variant="primary" onClick={() => takeOver(pending)}>
              Use it here instead
            </button>
            <button type="button" className="ed-btn" data-size="sm" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {groups.map(group => (
        <section key={group} className="rounded-lg border bg-card/40">
          <h3 className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h3>
          <ul>
            {SHORTCUT_ACTIONS.filter(a => a.group === group).map(a => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-1.5">
                <span className="text-sm">{a.label}</span>
                <span className="flex items-center gap-1.5">
                  {(bindings[a.id] ?? []).map(b => (
                    <kbd key={b} className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-xs">
                      {formatCombo(b, mac)}
                      <button type="button" title="Remove this key" aria-label={`Remove ${formatCombo(b, mac)} from ${a.label}`} onClick={() => remove(a.id, b)}>
                        <X className="h-3 w-3 opacity-60 hover:opacity-100" />
                      </button>
                    </kbd>
                  ))}
                  <button
                    type="button"
                    className="ed-btn"
                    data-size="sm"
                    data-active={recording === a.id}
                    title="Record a key"
                    aria-label={`Add a key to ${a.label}`}
                    onClick={() => setRecording(recording === a.id ? null : a.id)}
                  >
                    {recording === a.id ? 'Press keys…' : '+'}
                  </button>
                  <button
                    type="button"
                    className="ed-btn"
                    data-size="sm"
                    title="Back to the default"
                    aria-label={`Reset ${a.label}`}
                    disabled={!(a.id in overrides)}
                    onClick={() => reset(a.id)}
                  >
                    <RotateCcw />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
