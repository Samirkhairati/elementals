// Editors for the two list-valued parameters: move-route steps and choice options.

import React, { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { ChoiceOption, Facing, RouteStep, RouteStepType } from '../../../../../shared/engine/types'
import { FACINGS } from '../../../../../shared/engine/constants'
import { cn } from '@/lib/utils'
import { DraftNumber, DraftText, IconButton, SmallButton, selectClass } from './primitives'

// ── route ───────────────────────────────────────────────────────────────────────────────────────

const MOVE_TYPES: RouteStepType[] = ['up', 'down', 'left', 'right', 'forward', 'back']

const STEP_LABELS: Record<RouteStepType, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  forward: 'Move forward',
  back: 'Move back',
  turn: 'Turn',
  wait: 'Wait',
  speed: 'Set speed',
}

const STEP_HELP: Record<RouteStepType, string> = {
  up: 'Walk one tile up',
  down: 'Walk one tile down',
  left: 'Walk one tile left',
  right: 'Walk one tile right',
  forward: 'Walk one tile in the direction it faces',
  back: 'Walk one tile backwards (without turning)',
  turn: 'Turn to face a direction',
  wait: 'Pause for some milliseconds',
  speed: 'Change the walking speed (pixels per second)',
}

const MOVE_ICONS: Partial<Record<RouteStepType, typeof ArrowUp>> = { up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight }

export function defaultStep(type: RouteStepType): RouteStep {
  if (type === 'turn') return { type, value: 'down' }
  if (type === 'wait') return { type, value: 500 }
  if (type === 'speed') return { type, value: 100 }
  return { type }
}

/** "Move up ×3, turn left, wait 500 ms" - consecutive identical moves are folded. */
export function describeRouteSteps(steps: RouteStep[]): string {
  if (steps.length === 0) return 'No steps yet'
  const parts: string[] = []
  let i = 0
  while (i < steps.length) {
    const s = steps[i]
    let n = 1
    if (MOVE_TYPES.includes(s.type)) while (i + n < steps.length && steps[i + n].type === s.type) n++
    const base =
      s.type === 'turn'
        ? `turn ${String(s.value ?? 'down')}`
        : s.type === 'wait'
          ? `wait ${String(s.value ?? 0)} ms`
          : s.type === 'speed'
            ? `speed ${String(s.value ?? 0)} px/s`
            : `move ${s.type}`
    parts.push(n > 1 ? `${base} ×${n}` : base)
    i += n
  }
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function RouteEditor({ steps, onChange }: { steps: RouteStep[]; onChange: (next: RouteStep[]) => void }) {
  const list = Array.isArray(steps) ? steps : []
  const [count, setCount] = useState(1)
  const add = (type: RouteStepType) => {
    const n = MOVE_TYPES.includes(type) ? Math.max(1, Math.min(32, count)) : 1
    onChange([...list, ...Array.from({ length: n }, () => defaultStep(type))])
  }
  const patch = (index: number, step: RouteStep) => onChange(list.map((s, i) => (i === index ? step : s)))
  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta
    if (to < 0 || to >= list.length) return
    const next = list.slice()
    const [s] = next.splice(index, 1)
    next.splice(to, 0, s)
    onChange(next)
  }

  return (
    <div className="space-y-1.5" data-testid="route-editor">
      <p className="rounded bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground" data-testid="route-summary">
        {describeRouteSteps(list)}
      </p>
      {list.length > 0 && (
        <ol className="space-y-0.5">
          {list.map((step, i) => (
            <li key={i} className="flex items-center gap-1 rounded border border-border/50 bg-background/40 px-1.5 py-0.5" data-step-type={step.type}>
              <span className="w-4 shrink-0 text-right text-[10px] text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[11px]">{STEP_LABELS[step.type] ?? step.type}</span>
              {step.type === 'turn' && (
                <select aria-label={`Step ${i + 1} direction`} value={String(step.value ?? 'down')} onChange={(e) => patch(i, { type: 'turn', value: e.target.value as Facing })} className={cn(selectClass, 'w-20')}>
                  {FACINGS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              )}
              {step.type === 'wait' && (
                <>
                  <DraftNumber aria-label={`Step ${i + 1} milliseconds`} min={0} step={50} value={typeof step.value === 'number' ? step.value : 0} onCommit={(v) => patch(i, { type: 'wait', value: Math.max(0, v) })} className="w-20" />
                  <span className="text-[10px] text-muted-foreground">ms</span>
                </>
              )}
              {step.type === 'speed' && (
                <>
                  <DraftNumber aria-label={`Step ${i + 1} speed`} min={1} step={10} value={typeof step.value === 'number' ? step.value : 100} onCommit={(v) => patch(i, { type: 'speed', value: Math.max(1, v) })} className="w-20" />
                  <span className="text-[10px] text-muted-foreground">px/s</span>
                </>
              )}
              <IconButton title={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ChevronUp className="h-3 w-3" />
              </IconButton>
              <IconButton title={`Move step ${i + 1} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                <ChevronDown className="h-3 w-3" />
              </IconButton>
              <IconButton title={`Delete step ${i + 1}`} danger onClick={() => onChange(list.filter((_, j) => j !== i))}>
                <Trash2 className="h-3 w-3" />
              </IconButton>
            </li>
          ))}
        </ol>
      )}
      <div className="rounded border border-dashed border-border/70 p-1.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add step</span>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            tiles
            <input
              type="number"
              min={1}
              max={32}
              value={count}
              aria-label="Tiles per move step"
              onChange={(e) => setCount(Math.max(1, Math.min(32, Math.round(Number(e.target.value)) || 1)))}
              className="h-5 w-10 rounded border border-input bg-background/60 px-1 text-right text-[11px]"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {(['up', 'down', 'left', 'right', 'forward', 'back', 'turn', 'wait', 'speed'] as RouteStepType[]).map((t) => {
            const Icon = MOVE_ICONS[t]
            return (
              <SmallButton key={t} title={STEP_HELP[t]} aria-label={`Add step: ${STEP_LABELS[t]}`} onClick={() => add(t)} className="px-1.5">
                {Icon ? <Icon className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {Icon ? null : <span>{STEP_LABELS[t].replace('Move ', '')}</span>}
              </SmallButton>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── choices ─────────────────────────────────────────────────────────────────────────────────────

/** Smallest unused `optN` id. */
export function nextOptionId(options: ChoiceOption[]): string {
  const used = new Set(options.map((o) => o.id))
  for (let n = 1; ; n++) if (!used.has(`opt${n}`)) return `opt${n}`
}

interface ChoicesEditorProps {
  options: ChoiceOption[]
  /** Commands (including nested ones) currently inside each option's branch. */
  branchCounts: Record<string, number>
  /** `prune` lists branch ids whose commands should be deleted together with their option. */
  onChange: (options: ChoiceOption[], prune: string[]) => void
}

export function ChoicesEditor({ options, branchCounts, onChange }: ChoicesEditorProps) {
  const list = Array.isArray(options) ? options : []
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta
    if (to < 0 || to >= list.length) return
    const next = list.slice()
    const [o] = next.splice(index, 1)
    next.splice(to, 0, o)
    onChange(next, [])
  }

  const remove = (option: ChoiceOption) => {
    const count = branchCounts[option.id] ?? 0
    if (count > 0 && pendingRemove !== option.id) {
      setPendingRemove(option.id)
      return
    }
    setPendingRemove(null)
    onChange(
      list.filter((o) => o.id !== option.id),
      count > 0 ? [option.id] : [],
    )
  }

  return (
    <div className="space-y-1" data-testid="choices-editor">
      <ol className="space-y-1">
        {list.map((o, i) => {
          const count = branchCounts[o.id] ?? 0
          return (
            <li key={o.id} className="rounded border border-border/50 bg-background/40 p-1" data-option-id={o.id}>
              <div className="flex items-center gap-1">
                <span className="w-4 shrink-0 text-right text-[10px] text-muted-foreground">{i + 1}</span>
                <DraftText
                  aria-label={`Option ${i + 1} label`}
                  value={o.label}
                  placeholder="Option text"
                  onCommit={(label) => onChange(list.map((x) => (x.id === o.id ? { ...x, label } : x)), [])}
                />
                <IconButton title={`Move option ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ChevronUp className="h-3 w-3" />
                </IconButton>
                <IconButton title={`Move option ${i + 1} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                  <ChevronDown className="h-3 w-3" />
                </IconButton>
                <IconButton title={`Remove option ${i + 1}`} danger onClick={() => remove(o)}>
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </div>
              {pendingRemove === o.id && (
                <div role="alert" className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-[11px]">
                  <p className="text-amber-300">
                    “{o.label || o.id}” has {count} {count === 1 ? 'command' : 'commands'} in its branch. Removing the option deletes them too.
                  </p>
                  <div className="mt-1 flex gap-1">
                    <SmallButton variant="danger" onClick={() => remove(o)}>
                      Remove option and commands
                    </SmallButton>
                    <SmallButton onClick={() => setPendingRemove(null)}>Keep</SmallButton>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <SmallButton onClick={() => onChange([...list, { id: nextOptionId(list), label: `Option ${list.length + 1}` }], [])}>
        <Plus className="h-3 w-3" /> Add option
      </SmallButton>
    </div>
  )
}
