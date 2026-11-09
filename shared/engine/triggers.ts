// What starts an event state: defaults per start kind and the upgrade of the schemaVersion 4 trigger names.
// Pure; used by the editor, the game and the migration.

import type { EventState, EventTrigger, LegacyEventTrigger } from './types.ts';
import { DEFAULT_INTERACT_RANGE, DEFAULT_NEAR_RANGE, DEFAULT_TIMER_SECONDS, EVENT_TRIGGERS, MAX_TRIGGER_RANGE, TRIGGER_BLOCKS_BY_DEFAULT } from './constants.ts';
import { isRecord } from './util.ts';

export function isEventTrigger(v: unknown): v is EventTrigger {
  return (EVENT_TRIGGERS as readonly unknown[]).includes(v);
}

/** What each old trigger becomes. `autorun` / `parallel` keep restarting (`repeat`), the old behaviour. */
const LEGACY: Record<LegacyEventTrigger, { trigger: EventTrigger; blocks: boolean; repeat?: true }> = {
  action: { trigger: 'interact', blocks: true },
  playerTouch: { trigger: 'playerEnter', blocks: true },
  eventTouch: { trigger: 'eventEnter', blocks: true },
  autorun: { trigger: 'onActive', blocks: true, repeat: true },
  parallel: { trigger: 'onActive', blocks: false, repeat: true },
};

export function isLegacyTrigger(v: unknown): v is LegacyEventTrigger {
  return typeof v === 'string' && Object.hasOwn(LEGACY, v);
}

/**
 * schemaVersion 4 -> 5 for one state: an old `trigger` name becomes a start kind plus `blocks` (and `repeat`
 * for autorun / parallel, so they behave as before). Returns the same object when the state is already
 * current, so it is idempotent; a `blocks` / `repeat` the state already carries is kept.
 */
export function upgradeLegacyTrigger<T>(state: T): T {
  if (!isRecord(state) || !isLegacyTrigger(state.trigger)) return state;
  const l = LEGACY[state.trigger];
  const out: Record<string, unknown> = { ...state, trigger: l.trigger };
  if (typeof out.blocks !== 'boolean') out.blocks = l.blocks;
  if (l.repeat && out.repeat === undefined) out.repeat = true;
  return out as T;
}

export function defaultBlocks(trigger: EventTrigger): boolean {
  return TRIGGER_BLOCKS_BY_DEFAULT[trigger];
}

/** A whole number of tiles between 1 and `MAX_TRIGGER_RANGE`; `fallback` for anything that is not a number. */
export function normalizeRange(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_TRIGGER_RANGE, Math.max(1, Math.round(v))) : fallback;
}

/** Tiles reached by `interact` (default 1) or `playerNear` (default 4). */
export function stateRange(state: Pick<EventState, 'trigger' | 'range'>): number {
  return normalizeRange(state.range, state.trigger === 'playerNear' ? DEFAULT_NEAR_RANGE : DEFAULT_INTERACT_RANGE);
}

export function stateInterval(state: Pick<EventState, 'interval'>): number {
  const v = state.interval;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_TIMER_SECONDS;
}

export function statePriority(state: Pick<EventState, 'priority'>): number {
  return typeof state.priority === 'number' && Number.isFinite(state.priority) ? state.priority : 0;
}
