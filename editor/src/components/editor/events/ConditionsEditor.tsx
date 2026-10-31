// Conditions builder, used for page conditions and the `conditional` command's `conditions` field.
// Every row is one condition; all rows must hold (AND).

import React, { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ComparisonOp, Condition, SelfSwitchKey } from '../../../../../shared/engine/types'
import { COMPARISON_OPS, SELF_SWITCH_KEYS } from '../../../../../shared/engine/constants'
import { validateConditions } from '../../../../../shared/engine/commands'
import { cn } from '@/lib/utils'
import { DraftNumber, DraftText, IconButton, Popover, SmallButton, selectClass } from './primitives'
import { SwitchPicker, VariablePicker } from './pickers'
import { useEventEnv } from './eventEnv'
import { buildValidationContext } from './eventModel'

export type ConditionKind = Condition['kind']

export const CONDITION_KINDS: { kind: ConditionKind; label: string; description: string }[] = [
  { kind: 'switch', label: 'Switch', description: 'A global switch is ON or OFF' },
  { kind: 'variable', label: 'Variable', description: 'A global variable compared with a number' },
  { kind: 'selfSwitch', label: 'Self switch', description: 'One of this event\'s own switches A-D' },
  { kind: 'hasItem', label: 'Has item', description: 'The player carries at least some of an item' },
]

export function defaultCondition(kind: ConditionKind): Condition {
  switch (kind) {
    case 'switch':
      return { kind: 'switch', id: '', value: true }
    case 'variable':
      return { kind: 'variable', id: '', op: '==', value: 0 }
    case 'selfSwitch':
      return { kind: 'selfSwitch', key: 'A', value: true }
    case 'hasItem':
      return { kind: 'hasItem', item: '', qty: 1 }
  }
}

const OP_LABELS: Record<ComparisonOp, string> = {
  '==': '= equals',
  '!=': '≠ not equal',
  '>': '> greater than',
  '>=': '≥ at least',
  '<': '< less than',
  '<=': '≤ at most',
}

function OnOffSelect({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <select aria-label={label} value={value ? 'on' : 'off'} onChange={(e) => onChange(e.target.value === 'on')} className={cn(selectClass, 'w-16 shrink-0')}>
      <option value="on">ON</option>
      <option value="off">OFF</option>
    </select>
  )
}

function ConditionRow({ condition, index, onChange, onRemove, problem }: { condition: Condition; index: number; onChange: (c: Condition) => void; onRemove: () => void; problem?: string }) {
  const n = index + 1
  // Rows stack (kind + remove on top, the controls below) because the editor lives in narrow columns.
  return (
    <li className="space-y-1 rounded border border-border/60 bg-background/40 p-1.5" data-condition-kind={condition.kind} title={problem}>
      <div className="flex items-center gap-1.5">
        <select
          aria-label={`Condition ${n} type`}
          value={condition.kind}
          onChange={(e) => {
            const kind = e.target.value as ConditionKind
            if (kind !== condition.kind) onChange(defaultCondition(kind))
          }}
          className={selectClass}
        >
          {CONDITION_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <IconButton title={`Remove condition ${n}`} danger onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {condition.kind === 'switch' && (
          <>
            <div className="min-w-[8rem] flex-1">
              <SwitchPicker value={condition.id} onChange={(id) => onChange({ ...condition, id })} />
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">is</span>
            <OnOffSelect label={`Condition ${n} value`} value={condition.value} onChange={(value) => onChange({ ...condition, value })} />
          </>
        )}
        {condition.kind === 'variable' && (
          <>
            <div className="w-full">
              <VariablePicker value={condition.id} onChange={(id) => onChange({ ...condition, id })} />
            </div>
            <select
              aria-label={`Condition ${n} comparison`}
              value={condition.op}
              onChange={(e) => onChange({ ...condition, op: e.target.value as ComparisonOp })}
              className={cn(selectClass, 'min-w-[7rem] flex-1')}
            >
              {COMPARISON_OPS.map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
            <DraftNumber aria-label={`Condition ${n} number`} value={condition.value} onCommit={(value) => onChange({ ...condition, value })} className="w-20 shrink-0" />
          </>
        )}
        {condition.kind === 'selfSwitch' && (
          <>
            <select
              aria-label={`Condition ${n} self switch`}
              value={condition.key}
              onChange={(e) => onChange({ ...condition, key: e.target.value as SelfSwitchKey })}
              className={cn(selectClass, 'w-20 shrink-0')}
            >
              {SELF_SWITCH_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <span className="shrink-0 text-[11px] text-muted-foreground">is</span>
            <OnOffSelect label={`Condition ${n} value`} value={condition.value} onChange={(value) => onChange({ ...condition, value })} />
          </>
        )}
        {condition.kind === 'hasItem' && (
          <>
            <div className="w-full">
              <DraftText aria-label={`Condition ${n} item`} value={condition.item} placeholder="item id, e.g. potion" onCommit={(item) => onChange({ ...condition, item })} />
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">at least</span>
            <DraftNumber aria-label={`Condition ${n} quantity`} min={1} value={condition.qty} onCommit={(qty) => onChange({ ...condition, qty: Math.max(1, Math.round(qty)) })} className="w-16 shrink-0" />
          </>
        )}
      </div>
      {problem && <p className="text-[10px] text-amber-400">{problem}</p>}
    </li>
  )
}

interface ConditionsEditorProps {
  conditions: Condition[]
  onChange: (next: Condition[]) => void
  /** Text under the list when it is empty. */
  emptyHint?: string
  /** Show the "all must hold" explanation. */
  showAndHint?: boolean
}

export function ConditionsEditor({ conditions, onChange, emptyHint = 'No conditions.', showAndHint = true }: ConditionsEditorProps) {
  const env = useEventEnv()
  const list = Array.isArray(conditions) ? conditions : []
  const [menuOpen, setMenuOpen] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const issues = validateConditions(list, buildValidationContext(env))

  return (
    <div className="space-y-1.5" data-testid="conditions-editor">
      {list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {list.map((c, i) => (
            <ConditionRow
              key={i}
              condition={c}
              index={i}
              problem={issues.find((x) => x.index === i)?.message}
              onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
              onRemove={() => onChange(list.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
      {showAndHint && list.length > 1 && <p className="text-[10px] text-muted-foreground">All conditions must be true at the same time (AND).</p>}
      <SmallButton ref={addRef} onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
        <Plus className="h-3 w-3" /> Add condition
      </SmallButton>
      <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={addRef} width={260} label="Add a condition">
        <div role="menu" className="py-1">
          {CONDITION_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange([...list, defaultCondition(k.kind)])
                setMenuOpen(false)
              }}
              className="block w-full px-3 py-1 text-left hover:bg-accent"
            >
              <span className="block text-xs">{k.label}</span>
              <span className="block text-[10px] text-muted-foreground">{k.description}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  )
}
