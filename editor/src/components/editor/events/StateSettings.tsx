// Everything about a state except its commands: name, trigger, conditions, solidity and appearance override.

import { Select } from '../ui/fields'
import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { EventState, EventTrigger, StateAppearance } from '../../../../../shared/engine/types'
import { EVENT_TRIGGERS, MAX_TRIGGER_RANGE, TRIGGER_GROUPS, TRIGGER_LABELS } from '../../../../../shared/engine/constants'
import { defaultBlocks, normalizeRange, stateInterval, statePriority, stateRange } from '../../../../../shared/engine/triggers'
import { ConditionsEditor } from './ConditionsEditor'
import { FacingPicker, SpritePicker } from './pickers'
import { CheckRow, DraftNumber, DraftText, FieldRow, Group } from './primitives'
import { useEventEnv } from './eventEnv'
import { InfoTip } from '../ui/controls'

export const TRIGGER_HELP: Record<EventTrigger, string> = {
  interact: 'Runs when the player presses the action button next to this entity (or on it). Best for NPCs, signs and chests. Range lets it be used from further away.',
  playerEnter: 'Runs when the player steps onto this entity or walks into it. Best for doors, warps and trigger zones.',
  playerLeave: 'Runs when the player steps off this entity. For doors that close behind the player, or an area you leave.',
  playerNear: 'Runs once each time the player comes within a number of tiles. For a guard who notices the player, with an optional line of sight.',
  eventEnter: 'Runs when another character (an NPC, for example) steps onto this entity.',
  eventLeave: 'Runs when another character steps off this entity.',
  onActive: 'Runs once as soon as this state becomes active, for example when a switch turns on. To repeat it, wire the last node back to an earlier one.',
  timer: 'Runs every few seconds for as long as this state is active. The count starts again whenever the state changes.',
  mapEnter: 'Runs once when the map has been loaded and the player has arrived. For intro scenes and for setting up the map.',
  mapLeave: 'Runs once just before the player leaves the map through a warp, and the warp waits until it has finished. For saving progress or a goodbye.',
}

/** What each start kind does, with the chosen one first and in bold. */
function TriggerHelp({ current }: { current: EventTrigger }) {
  const order = [current, ...EVENT_TRIGGERS.filter((t) => t !== current)]
  return (
    <div className="space-y-1.5">
      <p>What makes this state's commands start.</p>
      {order.map((t) => (
        <p key={t} className={t === current ? 'text-foreground' : 'text-muted-foreground'}>
          <strong>{TRIGGER_LABELS[t]}</strong>: {TRIGGER_HELP[t]}
        </p>
      ))}
    </div>
  )
}

const WHEN_OPTIONS = TRIGGER_GROUPS.flatMap((g) => g.triggers.map((t) => ({ value: t, label: TRIGGER_LABELS[t], group: g.label })))

/** The "When" picker and the settings of the chosen start kind: range, facing, line of sight, interval, blocking, priority. */
function WhenFields({ state, onChange }: { state: EventState; onChange: (patch: Partial<EventState>) => void }) {
  const t = state.trigger
  return (
    <>
      <FieldRow label="When" help={<TriggerHelp current={t} />}>
        {(id) => <Select id={id} value={t} options={WHEN_OPTIONS} onChange={(v) => onChange({ trigger: v as EventTrigger, blocks: defaultBlocks(v as EventTrigger) })} />}
      </FieldRow>
      {(t === 'interact' || t === 'playerNear') && (
        <FieldRow
          label={t === 'interact' ? 'Reach (tiles)' : 'Distance (tiles)'}
          help={t === 'interact' ? 'How far away the player can be, straight ahead, and still use it. 1 = right next to it.' : 'How many tiles from the entity the player must come. It counts a square around the entity.'}
        >
          {(id) => <DraftNumber id={id} min={1} max={MAX_TRIGGER_RANGE} step={1} value={stateRange(state)} onCommit={(v) => onChange({ range: normalizeRange(v, stateRange(state)) })} />}
        </FieldRow>
      )}
      {t === 'interact' && (
        <CheckRow
          checked={state.mustFace === true}
          onChange={(mustFace) => onChange({ mustFace })}
          label="Only when facing it"
          help="Off: the player can also use it from a side tile without facing it. On: only from the tile in front of the player."
        />
      )}
      {t === 'playerNear' && (
        <CheckRow
          checked={state.lineOfSight === true}
          onChange={(lineOfSight) => onChange({ lineOfSight })}
          label="Needs a line of sight"
          help="Solid things (walls, other characters) between the player and this entity hide the player from it."
        />
      )}
      {t === 'timer' && (
        <FieldRow label="Every (seconds)" help="Time between two runs. A run that is still going when the time is up makes the next one wait.">
          {(id) => <DraftNumber id={id} min={0.1} step={0.5} value={stateInterval(state)} onCommit={(v) => onChange({ interval: Math.max(0.1, v) })} />}
        </FieldRow>
      )}
      {t !== 'mapLeave' && (
        <CheckRow
          checked={state.blocks}
          onChange={(blocks) => onChange({ blocks })}
          label="Blocks the player"
          help="On: the player cannot move while it runs, and only one blocking event runs at a time (a cutscene). Off: it runs in the background and the player keeps playing."
        />
      )}
      {state.repeat === true && (
        <CheckRow
          checked
          onChange={(on) => onChange({ repeat: on ? true : undefined })}
          label="Starts again when finished"
          help="Carried over from an old Autorun or Parallel state: it restarts for as long as the state is active. Untick it and loop in the graph instead (wire the last node back), or end it with a switch."
        />
      )}
      <FieldRow label="Priority" help="When several events could start from the same press or step, the highest number goes first; the nearest comes next, then the order of the entities. Leave at 0 unless two events clash.">
        {(id) => <DraftNumber id={id} step={1} value={statePriority(state)} onCommit={(v) => onChange({ priority: Math.round(v) === 0 ? undefined : Math.round(v) })} />}
      </FieldRow>
    </>
  )
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
      <OverrideRow label="Visibility" active={ap.visible !== undefined} onToggle={(on) => set('visible', on ? true : undefined)}>
        <Select aria-label="Visibility while active" value={ap.visible === false ? 'hidden' : 'visible'} options={[{ value: 'visible', label: 'Visible' }, { value: 'hidden', label: 'Hidden' }]} onChange={(v) => set('visible', v === 'visible')} />
      </OverrideRow>
      <OverrideRow label="Sprite" active={ap.asset !== undefined} onToggle={(on) => set('asset', on ? '' : undefined)}>
        <SpritePicker value={ap.asset ?? ''} onChange={(asset) => set('asset', asset)} facing={ap.facing} frame={ap.frame} animation={ap.animation} />
      </OverrideRow>
      <OverrideRow label="Animation" active={ap.animation !== undefined} onToggle={(on) => set('animation', on ? '' : undefined)}>
        {animations.length > 0 ? (
          <Select aria-label="Animation" value={ap.animation ?? ''} options={[{ value: '', label: '(static frame)' }, ...animations.map((a) => ({ value: a }))]} onChange={(v) => set('animation', v)} />
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
      <Group title="When it starts">
        <FieldRow label="State name">{(id) => <DraftText id={id} value={state.name} placeholder="e.g. After the quest" onCommit={(name) => onChange({ name })} />}</FieldRow>
        <WhenFields state={state} onChange={onChange} />
      </Group>

      <Group title="Behaviour">
        <CheckRow
          checked={state.faceOnInteract}
          onChange={(faceOnInteract) => onChange({ faceOnInteract })}
          label="Face player when triggered"
          help="The entity turns towards the player before its commands run, when the player presses Action on it."
        />
        <FieldRow label="Solid" help="Solid entities block the player. “Inherit” keeps the Collider’s setting.">
          {(id) => (
            <Select id={id} value={state.solid === null ? 'inherit' : state.solid ? 'solid' : 'nonsolid'} options={[{ value: 'inherit', label: 'Inherit from Collider' }, { value: 'solid', label: 'Solid (blocks movement)' }, { value: 'nonsolid', label: 'Not solid (walk through)' }]} onChange={(v) => onChange({ solid: v === 'inherit' ? null : v === 'solid' })} />
          )}
        </FieldRow>
        <div className="border-t border-border/50 pt-1.5">
          <div className="flex items-center gap-1">
          <button
            type="button"
            aria-expanded={appearanceOpen}
            onClick={() => setAppearanceOpen((o) => !o)}
            className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {appearanceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Appearance override{overrides > 0 && <span className="rounded bg-primary/20 px-1 text-primary">{overrides}</span>}
          </button>
          <InfoTip label="How appearance overrides work">While this state is active, these replace the entity’s own Sprite settings. Anything not overridden stays as it is.</InfoTip>
          </div>
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
