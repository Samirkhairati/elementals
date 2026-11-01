// Everything about a state except its commands: name, trigger, conditions, solidity and appearance override.

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { EventState, EventTrigger, StateAppearance } from '../../../../../shared/engine/types'
import { EVENT_TRIGGERS, TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { ConditionsEditor } from './ConditionsEditor'
import { FacingPicker, SpritePicker } from './pickers'
import { CheckRow, DraftNumber, DraftText, FieldRow, Group, selectClass } from './primitives'
import { useEventEnv } from './eventEnv'

export const TRIGGER_HELP: Record<EventTrigger, string> = {
  action: 'Runs when the player presses the action button while facing this entity. Best for NPCs, signs and chests.',
  playerTouch: 'Runs when the player walks onto or into this entity. Best for doors, warps and trigger zones.',
  eventTouch: 'Runs when another entity (an NPC, for example) touches this one.',
  autorun: 'Starts by itself as soon as the state is active and blocks the player until it finishes. It repeats, so end it with a switch or self switch or the game will lock up.',
  parallel: 'Runs in the background over and over without stopping the player. Use it for ambient effects and use sparingly.',
}

function OverrideRow({ label, active, onToggle, children }: { label: string; active: boolean; onToggle: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="space-y-1 py-1" data-override={label}>
      <CheckRow checked={active} onChange={onToggle} label={`Override ${label.toLowerCase()}`} />
      {active && <div className="pl-5">{children}</div>}
    </div>
  )
}

function AppearanceEditor({ appearance, onChange }: { appearance: StateAppearance; onChange: (a: StateAppearance) => void }) {
  const env = useEventEnv()
  const ap = appearance ?? {}
  const set = <K extends keyof StateAppearance>(key: K, value: StateAppearance[K] | undefined) => {
    const next = { ...ap }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange(next)
  }
  const info = ap.asset ? env.getSpriteAsset(ap.asset) : undefined
  const animations = info?.meta.animations ? Object.keys(info.meta.animations) : []
  return (
    <div className="space-y-0.5" data-testid="appearance-editor">
      <p className="text-[10px] text-muted-foreground">While this state is active, these replace the entity’s own Sprite settings. Anything not overridden stays as it is.</p>
      <OverrideRow label="Visibility" active={ap.visible !== undefined} onToggle={(on) => set('visible', on ? true : undefined)}>
        <select aria-label="Visibility while active" value={ap.visible === false ? 'hidden' : 'visible'} onChange={(e) => set('visible', e.target.value === 'visible')} className={selectClass}>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </select>
      </OverrideRow>
      <OverrideRow label="Sprite" active={ap.asset !== undefined} onToggle={(on) => set('asset', on ? '' : undefined)}>
        <SpritePicker value={ap.asset ?? ''} onChange={(asset) => set('asset', asset)} facing={ap.facing} frame={ap.frame} animation={ap.animation} />
      </OverrideRow>
      <OverrideRow label="Animation" active={ap.animation !== undefined} onToggle={(on) => set('animation', on ? '' : undefined)}>
        {animations.length > 0 ? (
          <select aria-label="Animation" value={ap.animation ?? ''} onChange={(e) => set('animation', e.target.value)} className={selectClass}>
            <option value="">(static frame)</option>
            {animations.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : (
          <DraftText aria-label="Animation" value={ap.animation ?? ''} placeholder="animation name, empty = static frame" onCommit={(v) => set('animation', v)} />
        )}
      </OverrideRow>
      <OverrideRow label="Frame" active={ap.frame !== undefined} onToggle={(on) => set('frame', on ? 0 : undefined)}>
        <div className="w-24">
          <DraftNumber aria-label="Frame" min={0} step={1} value={ap.frame ?? 0} onCommit={(v) => set('frame', Math.max(0, Math.round(v)))} />
        </div>
      </OverrideRow>
      <OverrideRow label="Facing" active={ap.facing !== undefined} onToggle={(on) => set('facing', on ? 'down' : undefined)}>
        <FacingPicker value={ap.facing ?? 'down'} onChange={(f) => set('facing', f)} />
      </OverrideRow>
    </div>
  )
}

export function StateSettings({ state, onChange }: { state: EventState; onChange: (patch: Partial<EventState>) => void }) {
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const overrides = Object.keys(state.appearance ?? {}).length
  return (
    <div className="grid gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3" data-testid="state-settings">
      <Group title="When it runs">
        <FieldRow label="State name">{(id) => <DraftText id={id} value={state.name} placeholder="e.g. After the quest" onCommit={(name) => onChange({ name })} />}</FieldRow>
        <FieldRow label="Trigger" help={TRIGGER_HELP[state.trigger]}>
          {(id) => (
            <select id={id} value={state.trigger} onChange={(e) => onChange({ trigger: e.target.value as EventTrigger })} className={selectClass}>
              {EVENT_TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
          )}
        </FieldRow>
      </Group>

      <Group title="Behaviour">
        <CheckRow
          checked={state.faceOnInteract}
          onChange={(faceOnInteract) => onChange({ faceOnInteract })}
          label="Face player when triggered"
          help="The entity turns towards the player before its commands run."
        />
        <FieldRow label="Solid" help="Solid entities block the player. “Inherit” keeps the Collider’s setting.">
          {(id) => (
            <select
              id={id}
              value={state.solid === null ? 'inherit' : state.solid ? 'solid' : 'nonsolid'}
              onChange={(e) => onChange({ solid: e.target.value === 'inherit' ? null : e.target.value === 'solid' })}
              className={selectClass}
            >
              <option value="inherit">Inherit from Collider</option>
              <option value="solid">Solid (blocks movement)</option>
              <option value="nonsolid">Not solid (walk through)</option>
            </select>
          )}
        </FieldRow>
        <div className="border-t border-border/50 pt-1.5">
          <button
            type="button"
            aria-expanded={appearanceOpen}
            onClick={() => setAppearanceOpen((o) => !o)}
            className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {appearanceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Appearance override{overrides > 0 && <span className="rounded bg-primary/20 px-1 text-primary">{overrides}</span>}
          </button>
          {appearanceOpen && (
            <div className="mt-1">
              <AppearanceEditor appearance={state.appearance} onChange={(appearance) => onChange({ appearance })} />
            </div>
          )}
        </div>
      </Group>

      <Group
        title="Conditions"
        className="md:col-span-2 2xl:col-span-1"
        hint={state.conditions.length > 0 ? 'The state is used while these hold. If a later state also qualifies, the later state wins.' : undefined}
      >
        <ConditionsEditor
          conditions={state.conditions}
          onChange={(conditions) => onChange({ conditions })}
          emptyHint="No conditions: this state is always eligible. When several states qualify, the last one runs."
        />
      </Group>
    </div>
  )
}
