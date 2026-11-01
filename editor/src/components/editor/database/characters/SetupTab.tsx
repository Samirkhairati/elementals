import { useState } from 'react'
import type { CharacterDef } from '../../../../../../shared/engine/characters'
import { CHARACTER_PROFILES, unmetProfileRequirements } from '../../../../../../shared/engine/profiles'
import type { FacingMode } from '../../../../../../shared/engine/characters'
import { facingChangeImpact, setBinding, setFacingMode, setPivot, setTags } from '@/lib/characterEdit'
import { EdButton, Field, FieldRow, InfoTip, NumberField, Segmented, TextField } from '../../ui/controls'
import { PivotPicker } from './PivotPicker'

interface Props {
  id: string
  def: CharacterDef
  onChange: (def: CharacterDef) => void
}

export function SetupTab({ id, def, onChange }: Props) {
  const clips = Object.keys(def.clips)
  const [newBinding, setNewBinding] = useState('')
  const [pendingFacing, setPendingFacing] = useState<FacingMode | null>(null)
  const impact = pendingFacing ? facingChangeImpact(def, pendingFacing) : null
  const base = ['idle', 'walk', 'run']
  const bindingKeys = [...base, ...Object.keys(def.bindings).filter((k) => !base.includes(k))]
  const unmet = def.profile ? unmetProfileRequirements(def, def.profile) : []

  return (
    <div className="flex flex-col gap-2" data-testid="setup-tab">
      <Field label="Name" info="What you'll see in lists and pickers. You can rename it any time; the id (below) is what maps use.">
        <TextField aria-label="Name" value={def.name} onCommit={(v) => onChange({ ...def, name: v })} />
      </Field>
      <Field label="Id" info="The permanent name maps and events use to refer to this character. Renaming it updates every place it's used (you'll see a preview first).">
        <code className="text-ed-label" aria-label="Character id">{id}</code>
      </Field>
      <Field label="Tags" info="Your own labels, like 'npc' or 'prop', for filtering. They don't affect the game.">
        <TextField aria-label="Tags" placeholder="npc, boss" value={def.tags.join(', ')} onCommit={(v) => onChange(setTags(def, v.split(',')))} />
      </Field>
      <Field label="Facing" info="Four directions: the character can look down, left, right or up and animations can differ per direction. None: it looks the same from every side.">
        <Segmented<FacingMode> aria-label="Facing" value={def.facing} options={[{ value: 'none', label: 'None' }, { value: 'four', label: 'Four directions' }]} onChange={(v) => (v === def.facing ? undefined : facingChangeImpact(def, v).invalid.length > 0 ? setPendingFacing(v) : onChange(setFacingMode(def, v)))} />
      </Field>
      {pendingFacing && impact && (
        <div role="alert" className="rounded border border-border p-2 text-ed-label">
          {impact.invalid.length} directional animation{impact.invalid.length === 1 ? '' : 's'} will become plain ones that show their “down” frames ({impact.invalid.join(', ')}).
          <FieldRow className="mt-1"><EdButton size="sm" variant="primary" onClick={() => { onChange(setFacingMode(def, pendingFacing)); setPendingFacing(null) }}>Change facing</EdButton><EdButton size="sm" onClick={() => setPendingFacing(null)}>Cancel</EdButton></FieldRow>
        </div>
      )}
      <Field label="Pivot" info="The point of the frame that stands on the spot where the entity is placed. Bottom-centre suits characters; centre suits things that float.">
        <FieldRow>
          <PivotPicker value={def.pivot} onChange={(p) => onChange(setPivot(def, p))} />
          <NumberField aria-label="Pivot x" size="xs" step={0.1} value={def.pivot.x} min={0} max={1} onCommit={(x) => onChange(setPivot(def, { ...def.pivot, x }))} />
          <NumberField aria-label="Pivot y" size="xs" step={0.1} value={def.pivot.y} min={0} max={1} onCommit={(y) => onChange(setPivot(def, { ...def.pivot, y }))} />
        </FieldRow>
      </Field>

      <div>
        <div className="flex items-center gap-1 text-ed-label font-medium">Animation bindings <InfoTip>Which animation plays automatically for each thing the character does. If a binding is missing, the next best one is used (run → walk → idle).</InfoTip></div>
        <table className="w-full text-ed-label" aria-label="Animation bindings">
          <tbody>
            {bindingKeys.map((key) => (
              <tr key={key}>
                <th className="w-24 text-left font-normal">{key}</th>
                <td>
                  <select aria-label={`Binding ${key}`} className="ed-input w-auto min-w-[120px]" value={def.bindings[key] ?? ''} onChange={(e) => onChange(setBinding(def, key, e.target.value || null))}>
                    <option value="">(none)</option>
                    {clips.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <FieldRow className="mt-1">
          <TextField aria-label="New binding" placeholder="swim.walk" value={newBinding} onCommit={setNewBinding} />
          <EdButton size="sm" disabled={!/^([a-z0-9_-]+\.)?(idle|walk|run)$/i.test(newBinding.trim())} onClick={() => { onChange(setBinding(def, newBinding.trim(), clips[0] ?? null)); setNewBinding('') }}>+ Add binding</EdButton>
        </FieldRow>
      </div>

      <Field label="Still frame" info="The picture shown when no animation is playing.">
        <FieldRow>
          <select aria-label="Still sheet" className="ed-input w-auto min-w-[100px]" value={def.still?.sheet ?? ''} onChange={(e) => onChange(e.target.value ? { ...def, still: { sheet: e.target.value, frame: def.still?.frame ?? 0 } } : (({ still: _s, ...rest }) => rest as CharacterDef)(def))}>
            <option value="">(none)</option>
            {Object.keys(def.sheets).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {def.still && <NumberField aria-label="Still frame" size="xs" min={0} value={def.still.frame} onCommit={(frame) => onChange({ ...def, still: { sheet: def.still!.sheet, frame } })} />}
        </FieldRow>
      </Field>

      <Field label="Profile" info="A checklist for characters that must behave the same way (for example, anything that can be swapped in as the player). Custom has no checklist.">
        <select aria-label="Profile" className="ed-input w-auto min-w-[160px]" value={def.profile ?? ''} onChange={(e) => onChange(e.target.value ? { ...def, profile: e.target.value } : (({ profile: _p, ...rest }) => rest as CharacterDef)(def))}>
          <option value="">Custom</option>
          {Object.values(CHARACTER_PROFILES).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>
      {def.profile && CHARACTER_PROFILES[def.profile] && (
        <ul aria-label="Profile checklist" className="text-ed-label">
          {CHARACTER_PROFILES[def.profile].requirements.map((r) => <li key={r}>{unmet.length === 0 ? '✓' : '•'} {r}</li>)}
          {unmet.map((u) => <li key={u} className="text-destructive">✕ {u}</li>)}
        </ul>
      )}
    </div>
  )
}
