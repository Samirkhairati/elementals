// Runtime constants that mirror the unions in types.ts, plus geometry helpers.

import type { ComparisonOp, Controller, EventTrigger, Facing, RouteStepType, SelfSwitchKey } from './types.ts';

/** Tile edge in pixels. */
export const TILE_SIZE = 32;

/** Sheet row order of character sprites: down, left, right, up. */
export const FACINGS: readonly Facing[] = ['down', 'left', 'right', 'up'];
export const CONTROLLERS: readonly Controller[] = ['none', 'player', 'wander'];
export const EVENT_TRIGGERS: readonly EventTrigger[] = ['action', 'playerTouch', 'eventTouch', 'autorun', 'parallel'];
export const COMPARISON_OPS: readonly ComparisonOp[] = ['==', '!=', '>', '>=', '<', '<='];
export const SELF_SWITCH_KEYS: readonly SelfSwitchKey[] = ['A', 'B', 'C', 'D'];
export const ROUTE_STEP_TYPES: readonly RouteStepType[] = [
  'up',
  'down',
  'left',
  'right',
  'forward',
  'back',
  'turn',
  'wait',
  'speed',
];

export const TRIGGER_LABELS: Record<EventTrigger, string> = {
  action: 'Action button',
  playerTouch: 'Player touch',
  eventTouch: 'Event touch',
  autorun: 'Autorun',
  parallel: 'Parallel',
};

const FACING_LABELS: Record<Facing, string> = { down: 'Down', left: 'Left', right: 'Right', up: 'Up' };

export function isFacing(v: unknown): v is Facing {
  return typeof v === 'string' && (FACINGS as readonly string[]).includes(v);
}

export function facingOptions(): { label: string; value: string }[] {
  return FACINGS.map((f) => ({ label: FACING_LABELS[f], value: f }));
}

/** Anchor (bottom-centre of the tile) in pixels for a tile position. */
export function tileToAnchor(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: (row + 1) * TILE_SIZE };
}

/** Tile that contains an anchor point (the anchor sits on the tile's bottom edge, so y-1 is used). */
export function anchorToTile(x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x / TILE_SIZE), row: Math.floor((y - 1) / TILE_SIZE) };
}

/** Snaps any pixel position to the anchor of the tile it falls in. */
export function snapToAnchor(x: number, y: number): { x: number; y: number } {
  const { col, row } = anchorToTile(x, y);
  return tileToAnchor(col, row);
}
