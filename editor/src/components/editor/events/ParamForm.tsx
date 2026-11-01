// The parameter form of one command, generated from the catalog's FieldDefs. Every FieldKind has a real
// control here (no raw-JSON fallbacks).

import React, { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { ChoiceOption, Command, CommandTarget, Condition, FieldDef, RouteStep } from '../../../../../shared/engine/types'
import { getCommandDef, isFieldVisible } from '../../../../../shared/engine/commands'
import { ConditionsEditor } from './ConditionsEditor'
import { ChoicesEditor, RouteEditor } from './RouteChoicesEditors'
import { CommonEventPicker, FacingPicker, MapPicker, SpritePicker, StagePicker, StageValuePicker, SwitchPicker, TargetPicker, VariablePicker } from './pickers'
import { CheckRow, DraftNumber, DraftText, DraftTextarea, FieldRow, IconButton, SmallButton, inputClass, selectClass } from './primitives'
import { useEventEnv } from './eventEnv'

export type ParamPatch = (patch: Record<string, unknown>, pruneBranches?: string[]) => void

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const asNumber = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

function StringListEditor({ items, onChange, placeholder, label }: { items: string[]; onChange: (next: string[]) => void; placeholder?: string; label: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    setDraft('')
  }
  return (
    <div className="space-y-1" data-testid="string-list-editor">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {items.map((it) => (
            <li key={it} className="inline-flex items-center gap-1 rounded border border-border bg-background/60 py-0.5 pl-2 pr-0.5 text-[11px]">
              {it}
              <button type="button" aria-label={`Remove ${it}`} title={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))} className="rounded p-0.5 text-muted-foreground hover:bg-red-500/15 hover:text-red-400">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        <input
          value={draft}
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          className={inputClass}
        />
        <button type="button" aria-label="Add" title="Add" onClick={add} disabled={!draft.trim()} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

const PLACEHOLDERS: Partial<Record<FieldDef['kind'], string>> = {
  sound: 'e.g. door_open (audio file name)',
  item: 'e.g. potion (item id)',
}

interface FieldControlProps {
  field: FieldDef
  command: Command
  params: Record<string, unknown>
  onPatch: ParamPatch
  id: string
}

/** The values of a stage a `branchStage` command has a path for (`cases`): add one, add all, remove. */
function StageCasesEditor({ stageId, cases, onChange }: { stageId: string; cases: string[]; onChange: (next: string[]) => void }) {
  const env = useEventEnv()
  const stage = env.stages.find((st) => st.id === stageId)
  const nameOf = (valueId: string) => stage?.values.find((v) => v.id === valueId)?.name ?? `Missing: ${valueId}`
  const missing = stage ? stage.values.filter((v) => !cases.includes(v.id)) : []
  return (
    <div className="space-y-1" data-testid="stage-cases">
      {cases.length === 0 && <p className="text-[11px] text-muted-foreground">{stage ? 'No values yet: everything takes Default.' : 'Choose a stage first.'}</p>}
      <ul className="space-y-1">
        {cases.map((c) => (
          <li key={c} className="flex items-center justify-between gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-xs">
            <span className={stage?.values.some((v) => v.id === c) ? '' : 'text-amber-400'}>{nameOf(c)}</span>
            <IconButton title={`Remove ${nameOf(c)}`} danger onClick={() => onChange(cases.filter((x) => x !== c))}>
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <StageValuePicker stageId={stageId} value="" onChange={(v) => v && !cases.includes(v) && onChange([...cases, v])} />
        </div>
        <SmallButton disabled={missing.length === 0} onClick={() => onChange([...cases, ...missing.map((v) => v.id)])}>
          Add all
        </SmallButton>
      </div>
    </div>
  )
}

function FieldControl({ field, command, params, onPatch, id }: FieldControlProps) {
  const def = getCommandDef(command.type)
  const raw = params[field.key] ?? def?.defaultParams[field.key]
  const set = (value: unknown) => onPatch({ [field.key]: value })

  if (field.kind === 'stageValue' && field.multiple) {
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    return <StageCasesEditor stageId={asString(params[field.stageKey ?? 'id'])} cases={list} onChange={set} />
  }

  if (field.multiple) {
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    return <StringListEditor items={list} onChange={set} placeholder={PLACEHOLDERS[field.kind] ?? field.placeholder} label={`${field.label}: add`} />
  }

  switch (field.kind) {
    case 'number':
      return <DraftNumber id={id} value={asNumber(raw)} min={field.min} max={field.max} step={field.step} onCommit={set} />
    case 'text':
    case 'sound':
    case 'item':
      return <DraftText id={id} value={asString(raw)} placeholder={field.placeholder ?? PLACEHOLDERS[field.kind]} onCommit={set} />
    case 'textarea':
      return <DraftTextarea id={id} value={asString(raw)} placeholder={field.placeholder} onCommit={set} />
    case 'boolean':
      return <CheckRow checked={raw !== false && raw !== undefined && raw !== null && raw !== 0} onChange={set} label="Enabled" />
    case 'select': {
      const value = asString(raw)
      const options = field.options ?? []
      return (
        <select id={id} value={value} onChange={(e) => set(e.target.value)} className={selectClass}>
          {!options.some((o) => o.value === value) && <option value={value}>{value === '' ? '(none)' : `${value} (invalid)`}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    case 'color': {
      const value = asString(raw)
      return (
        <div className="flex items-center gap-1.5">
          <input id={id} type="color" aria-label={`${field.label} picker`} value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'} onChange={(e) => set(e.target.value)} className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
          <DraftText aria-label={`${field.label} hex`} value={value} placeholder="#rrggbb" onCommit={set} />
        </div>
      )
    }
    case 'sprite':
      return <SpritePicker id={id} value={asString(raw)} onChange={set} clearLabel={field.required ? undefined : 'No sprite'} />
    case 'facing':
      return <FacingPicker id={id} value={asString(raw)} onChange={set} />
    case 'map':
      return <MapPicker id={id} value={asString(raw)} onChange={set} />
    case 'commonEvent':
      return <CommonEventPicker id={id} value={asString(raw)} onChange={set} />
    case 'switch':
      return <SwitchPicker id={id} value={asString(raw)} onChange={set} />
    case 'variable':
      return <VariablePicker id={id} value={asString(raw)} onChange={set} />
    case 'stage':
      return (
        <StagePicker
          id={id}
          value={asString(raw)}
          onChange={(next) => {
            // Values that belonged to the previous stage mean nothing for the new one.
            const patch: Record<string, unknown> = { [field.key]: next }
            if (next !== asString(raw)) for (const f of def?.params ?? []) if (f.stageKey === field.key) patch[f.key] = f.multiple ? [] : ''
            onPatch(patch)
          }}
        />
      )
    case 'stageValue':
      return <StageValuePicker id={id} stageId={asString(params[field.stageKey ?? 'id'])} value={asString(raw)} onChange={set} />
    case 'target':
      return <TargetPicker id={id} value={raw as CommandTarget | undefined} onChange={set} />
    case 'position': {
      const [kx, ky] = field.keys ?? ['x', 'y']
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Column (x)
            <DraftNumber aria-label="Tile column" min={0} step={1} value={asNumber(params[kx] ?? def?.defaultParams[kx])} onCommit={(v) => onPatch({ [kx]: Math.round(v) })} />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Row (y)
            <DraftNumber aria-label="Tile row" min={0} step={1} value={asNumber(params[ky] ?? def?.defaultParams[ky])} onCommit={(v) => onPatch({ [ky]: Math.round(v) })} />
          </label>
        </div>
      )
    }
    case 'route':
      return <RouteEditor steps={Array.isArray(raw) ? (raw as RouteStep[]) : []} onChange={set} />
    case 'choices': {
      // Removing an option only unwires its path in a graph; nothing is deleted with it.
      return <ChoicesEditor options={Array.isArray(raw) ? (raw as ChoiceOption[]) : []} branchCounts={{}} onChange={(options, prune) => onPatch({ [field.key]: options }, prune)} />
    }
    case 'conditions':
      return <ConditionsEditor conditions={Array.isArray(raw) ? (raw as Condition[]) : []} onChange={set} emptyHint="No conditions: the Then branch always runs." />
    default:
      return <DraftText id={id} value={asString(raw)} onCommit={set} />
  }
}

export function ParamForm({ command, onPatch }: { command: Command; onPatch: ParamPatch }) {
  const def = getCommandDef(command.type)
  if (!def) {
    return <p className="text-xs text-red-400">Unknown command type “{command.type}”. It is kept as is; delete it or edit the project data.</p>
  }
  const params = command.params ?? {}
  const fields = def.params.filter((f) => isFieldVisible(f, params, def.defaultParams))
  if (fields.length === 0) {
    return <p className="text-[11px] text-muted-foreground">This command has no parameters.</p>
  }
  return (
    <div data-testid="param-form">
      {fields.map((field) => {
        if (field.kind === 'boolean') {
          const raw = params[field.key] ?? def.defaultParams[field.key]
          return (
            <div key={field.key} data-field={field.label} className="py-1">
              <CheckRow checked={raw !== false && raw !== undefined && raw !== null && raw !== 0} onChange={(v) => onPatch({ [field.key]: v })} label={field.label} help={field.help} />
            </div>
          )
        }
        const wide = ['textarea', 'route', 'choices', 'conditions', 'position', 'color', 'target', 'sprite', 'switch', 'variable', 'stage', 'stageValue', 'map', 'commonEvent'].includes(field.kind) || !!field.multiple
        return (
          <FieldRow key={field.key} label={field.label} help={field.help} required={field.required} unit={field.unit} inline={!wide && field.kind !== 'text' && field.kind !== 'select' && field.kind !== 'sound' && field.kind !== 'item'}>
            {(id) => <FieldControl field={field} command={command} params={params} onPatch={onPatch} id={id} />}
          </FieldRow>
        )
      })}
    </div>
  )
}
