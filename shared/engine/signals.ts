// Signals (Godot-style): something happens to an entity and it sends a named signal; events of any entity on the map can
// start on it ("Signal is received", optionally only from one sender). Built-in signals come from an entity's Area; an
// event sends its own with the Emit Signal command. Pure; used by the editor (pickers, the Signals card) and the game.

import type { EventState } from './types.ts';

/** Anything with an id and a bag of components (an editor entity or an engine one). */
export interface SignalEntity {
  id: string;
  components: { Event?: unknown };
}

export interface BuiltInSignal {
  name: string;
  label: string;
  help: string;
}

/** Signals the game sends by itself, from an entity with an Area (the body is the player or another character). */
export const BUILT_IN_SIGNALS: readonly BuiltInSignal[] = [
  { name: 'body_entered', label: 'Body entered', help: 'A character (the player or an NPC) stepped into this Area.' },
  { name: 'body_exited', label: 'Body exited', help: 'A character (the player or an NPC) stepped out of this Area.' },
];

/** Who may send a signal a state listens to: 'self', an entity id, or '' for anyone. */
export const SIGNAL_FROM_ANY = '';
export const SIGNAL_FROM_SELF = 'self';

/**
 * Whether an entity's components give it an Area its built-in signals come from: an Area, or a Collider that is not
 * solid (an Area node without a StaticBody exports as one, see shared/sceneEntity.ts).
 */
export function hasSignalArea(components: { Area?: unknown; Collider?: unknown }): boolean {
  if (components.Area) return true;
  const c = components.Collider as { isSolid?: unknown } | undefined;
  return !!c && c.isSolid === false;
}

export function isBuiltInSignal(name: string): boolean {
  return BUILT_IN_SIGNALS.some((s) => s.name === name);
}

/** A signal name as it is stored: trimmed, inner spaces turned into underscores (`door opened` -> `door_opened`). */
export function cleanSignalName(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

/** The signals sent by a list of states' Emit Signal nodes, in the order met (no repeats). */
export function signalsEmittedBy(states: readonly EventState[]): string[] {
  const out = new Set<string>();
  for (const s of states) {
    for (const n of s.graph?.nodes ?? []) {
      if (n.type === 'emitSignal' && typeof n.params.name === 'string' && n.params.name.trim()) out.add(cleanSignalName(n.params.name));
    }
  }
  return [...out];
}

/** Whether a state starts on `name` sent by the entity `senderId`, given the listener's own id. */
export function stateHearsSignal(state: Pick<EventState, 'trigger' | 'signal' | 'signalFrom'>, name: string, senderId: string, listenerId: string): boolean {
  if (state.trigger !== 'signal' || !state.signal || state.signal !== name) return false;
  const from = state.signalFrom ?? SIGNAL_FROM_ANY;
  if (from === SIGNAL_FROM_ANY) return true;
  return from === SIGNAL_FROM_SELF ? senderId === listenerId : from === senderId;
}

/** The event states of an entity (none without an Event). */
export const eventStatesOf = (e: Pick<SignalEntity, 'components'>): EventState[] => {
  const states = (e.components.Event as { states?: unknown } | undefined)?.states;
  return Array.isArray(states) ? (states as EventState[]) : [];
};

/** Every signal name known on a map: the built-in ones, then those sent or listened to by its entities' events. */
export function knownSignals(entities: readonly Pick<SignalEntity, 'components'>[]): string[] {
  const out = new Set<string>(BUILT_IN_SIGNALS.map((s) => s.name));
  for (const e of entities) {
    const states = eventStatesOf(e);
    for (const name of signalsEmittedBy(states)) out.add(name);
    for (const s of states) if (s.trigger === 'signal' && s.signal) out.add(s.signal);
  }
  return [...out];
}

export interface SignalConnection {
  /** The listening entity and its state. */
  entityId: string;
  stateId: string;
  stateName: string;
  signal: string;
}

/**
 * The states (of any entity of the map) that start on signals `senderId` sends: each listens to one of `names`, from
 * this sender or from anyone. The Signals card of the Properties panel lists them, like Godot's Node › Signals tab.
 */
export function connectionsTo(entities: readonly SignalEntity[], senderId: string, names: readonly string[]): SignalConnection[] {
  const out: SignalConnection[] = [];
  for (const e of entities) {
    for (const s of eventStatesOf(e)) {
      if (s.trigger !== 'signal' || !s.signal || !names.includes(s.signal)) continue;
      if (stateHearsSignal(s, s.signal, senderId, e.id)) out.push({ entityId: e.id, stateId: s.id, stateName: s.name, signal: s.signal });
    }
  }
  return out;
}
