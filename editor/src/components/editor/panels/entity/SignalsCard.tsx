// The Signals card of the Properties panel, like Godot's Node › Signals tab: the signals an entity sends (body_entered /
// body_exited when it has an Area with a shape, plus the names its own Emit Signal nodes send), the event states of
// the map that start on each, and Connect, which adds a "Signal is received" state to the entity chosen to react.

import React from 'react'
import { ArrowRight, Plus, RadioTower } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EntityData, PropBag } from '@/types/editor'
import type { EventState } from '../../../../../../shared/engine/types'
import { createDefaultEventState } from '../../../../../../shared/engine/components'
import { BUILT_IN_SIGNALS, SIGNAL_FROM_SELF, connectionsTo, eventStatesOf, hasSignalArea, signalsEmittedBy } from '../../../../../../shared/engine/signals'
import { openEventEditor } from '@/lib/openEventEditor'
import { Card, EdButton } from '../../ui/controls'

const statesOf = (e: EntityData): EventState[] => eventStatesOf(e)

/** The signals `entity` sends: the Area's built-in ones (when it has an Area), then its own Emit Signal names. */
export function signalsSentBy(entity: EntityData): string[] {
  const own = signalsEmittedBy(statesOf(entity))
  const builtIn = hasSignalArea(entity.components) ? BUILT_IN_SIGNALS.map((s) => s.name) : []
  return [...builtIn, ...own.filter((n) => !builtIn.includes(n))]
}

/** A new state of `receiver` that starts on `signal` sent by `sender`. */
export function connectState(receiver: EntityData, sender: EntityData, signal: string): EventState {
  const n = statesOf(receiver).length
  return {
    ...createDefaultEventState(`On ${signal}${receiver.id === sender.id ? '' : ` (${sender.name || 'entity'})`}`.slice(0, 48) || `State ${n + 1}`),
    trigger: 'signal',
    signal,
    signalFrom: receiver.id === sender.id ? SIGNAL_FROM_SELF : sender.id,
    blocks: true,
  }
}

interface SignalsCardProps {
  entity: EntityData
  entities: EntityData[]
  disabled?: boolean
  updateComponentProps: (entityId: string, type: 'Event', props: PropBag) => void
}

export function SignalsCard({ entity, entities, disabled, updateComponentProps }: SignalsCardProps) {
  const names = signalsSentBy(entity)
  const nameOf = (id: string) => entities.find((e) => e.id === id)?.name || id
  const connect = (signal: string, receiver: EntityData) => {
    updateComponentProps(receiver.id, 'Event', { states: [...statesOf(receiver), connectState(receiver, entity, signal)] })
    openEventEditor(receiver.id, 60)
  }
  // This entity first, then the others of the map.
  const receivers = [entity, ...entities.filter((e) => e.id !== entity.id)]

  return (
    <Card
      caps
      title="Signals"
      info="What this node sends when something happens to it. body_entered / body_exited: a character steps into or out of its Area (add an Area with a CollisionShape). Other names: sent by an Emit Signal node in its event. Connect adds a state that starts on the signal to the entity that should react."
      data-testid="signals-card"
    >
      {names.length === 0 ? (
        <div className="text-ed-label text-muted-foreground">Sends no signals. Add an Area with a CollisionShape, or an Emit Signal node to its event.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {names.map((signal) => {
            const builtIn = BUILT_IN_SIGNALS.find((s) => s.name === signal)
            const links = connectionsTo(entities, entity.id, [signal])
            return (
              <li key={signal} className="flex flex-col gap-1" data-testid={`signal-${signal}`}>
                <div className="flex items-center gap-1.5">
                  <RadioTower className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-ed-body" title={builtIn?.help ?? 'Sent by an Emit Signal node of this entity'}>
                    {signal}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <EdButton size="sm" disabled={disabled} aria-label={`Connect ${signal}`} title="Add a state that starts on this signal to the entity that should react">
                        <Plus />
                        Connect
                      </EdButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72">
                      <DropdownMenuLabel>Who reacts to {signal}?</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {receivers.map((r) => (
                        <DropdownMenuItem key={r.id} onSelect={() => connect(signal, r)}>
                          {r.id === entity.id ? `This entity (${r.name || 'unnamed'})` : r.name || r.id}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {links.length > 0 && (
                  <ul className="ml-5 flex flex-col gap-0.5">
                    {links.map((l) => (
                      <li key={`${l.entityId}/${l.stateId}`}>
                        <button
                          type="button"
                          className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-ed-label text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Open this event"
                          onClick={() => openEventEditor(l.entityId, 0)}
                        >
                          <ArrowRight className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">
                            {l.entityId === entity.id ? 'This entity' : nameOf(l.entityId)} › {l.stateName}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
