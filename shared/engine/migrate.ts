// Converts schemaVersion 1 entities/maps (SpriteView, GridMovement, Interactable ...) to the six
// canonical components. Pure and idempotent; inputs are never mutated; when nothing changes the very
// same object is returned. Generated ids are deterministic so repeated migrations agree.
//
// Rules (also documented in docs/engine-design.md):
//   SpriteView + CharacterAnimation -> Sprite
//     asset  : CharacterAnimation.characterKey -> `characters/<key>`; else SpriteView.texture
//              `<key>-walk` / `<key>-run` -> `characters/<key>`; any other texture -> `objects/<texture>`
//     facing : CharacterAnimation.direction (else Grid/FreeMovement.direction, else down)
//     frame, flipX, visible kept; alpha -> opacity; numeric tint -> '#rrggbb' (white = none);
//     originX/originY and movementType are dropped (the asset defines the pivot, movement drives walk/run)
//   GridMovement / FreeMovement / PlayerControl / AIWander -> Movement
//     controller: PlayerControl -> player; else AIWander -> wander; else none
//     speed: AIWander.speed for wander, else Grid/FreeMovement.speed; wanderRadius/Interval from AIWander
//   Interactable -> Event with ONE page
//     type on_step -> trigger playerTouch, anything else -> action
//     commands (in this order, only the ones that are set): message -> showText,
//     targetMap -> warp (targetX/targetY are TILE coordinates; a trailing ".json" is removed from the map),
//     eventKey -> emit
//   Transform is kept (created from entity.x/y when missing); Transform x/y win over entity.x/y.
//   Collider, Tag and unknown components are kept untouched. Maps get schemaVersion 2.

import type { Command, EngineEntity, EventPage, LegacyComponentType } from './types.ts';
import { SCHEMA_VERSION } from './types.ts';
import { createCommand } from './commands.ts';
import { normalizeProps } from './components.ts';
import { isFacing } from './constants.ts';
import { deterministicId } from './ids.ts';
import { deepEqual, isRecord } from './util.ts';

export const LEGACY_COMPONENT_TYPES = [
  'SpriteView',
  'CharacterAnimation',
  'GridMovement',
  'FreeMovement',
  'PlayerControl',
  'AIWander',
  'Interactable',
] as const satisfies readonly LegacyComponentType[];

export interface MigrateResult<T> {
  value: T;
  changed: boolean;
}

/** Anything shaped like an entity (legacy or canonical). */
export interface EntityLike {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  visible?: boolean;
  folder?: string | null;
  components?: object;
}

const CANONICAL_ORDER = ['Transform', 'Sprite', 'Collider', 'Movement', 'Event', 'Tag'];

export function isLegacyComponentType(type: string): type is LegacyComponentType {
  return (LEGACY_COMPONENT_TYPES as readonly string[]).includes(type);
}

/** Names of legacy components on an entity (empty for canonical or malformed entities). */
export function listLegacyComponents(entity: unknown): LegacyComponentType[] {
  if (!isRecord(entity) || !isRecord(entity.components)) return [];
  return Object.keys(entity.components).filter(isLegacyComponentType);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function rec(v: unknown): Record<string, unknown> | undefined {
  return isRecord(v) ? v : undefined;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v !== '';
}

function toTint(v: unknown): string {
  if (typeof v === 'string') return /^#[0-9a-fA-F]{6}$/.test(v) && v.toLowerCase() !== '#ffffff' ? v.toLowerCase() : '';
  if (!finite(v)) return '';
  const rgb = Math.trunc(v) & 0xffffff;
  return rgb === 0xffffff ? '' : `#${rgb.toString(16).padStart(6, '0')}`;
}

function migrateSprite(sv: Record<string, unknown> | undefined, ca: Record<string, unknown> | undefined, movementDirection: unknown) {
  let asset = '';
  if (ca && nonEmptyString(ca.characterKey)) {
    asset = `characters/${ca.characterKey}`;
  } else if (sv && nonEmptyString(sv.texture)) {
    const m = /^(.+)-(walk|run)$/.exec(sv.texture);
    asset = m ? `characters/${m[1]}` : `objects/${sv.texture}`;
  }
  const facing = isFacing(ca?.direction) ? ca.direction : isFacing(movementDirection) ? movementDirection : 'down';

  let frame = 0;
  if (sv) {
    const raw = typeof sv.frame === 'string' && sv.frame.trim() !== '' ? Number(sv.frame) : sv.frame;
    if (finite(raw)) frame = Math.max(0, Math.round(raw));
  }

  return normalizeProps('Sprite', {
    asset,
    facing,
    animation: '',
    frame,
    flipX: sv?.flipX === true,
    tint: toTint(sv?.tint),
    opacity: finite(sv?.alpha) ? sv.alpha : 1,
    visible: sv?.visible !== false,
  });
}

function migrateMovement(
  grid: Record<string, unknown> | undefined,
  free: Record<string, unknown> | undefined,
  player: Record<string, unknown> | undefined,
  wander: Record<string, unknown> | undefined,
) {
  const controller = player ? 'player' : wander ? 'wander' : 'none';
  const baseSpeed = finite(grid?.speed) ? grid.speed : finite(free?.speed) ? free.speed : undefined;
  const speed = controller === 'wander' && finite(wander?.speed) ? wander.speed : baseSpeed;
  return normalizeProps('Movement', {
    controller,
    ...(speed !== undefined ? { speed } : {}),
    ...(finite(wander?.radius) ? { wanderRadius: wander.radius } : {}),
    ...(finite(wander?.interval) ? { wanderInterval: wander.interval } : {}),
  });
}

function migrateInteractable(entityId: string, inter: Record<string, unknown>) {
  const seed = (name: string) => () => deterministicId(`${entityId}/Event/${name}`);
  const commands: Command[] = [];

  if (nonEmptyString(inter.message)) {
    commands.push(createCommand('showText', { speaker: '', text: inter.message }, seed('showText')));
  }
  if (nonEmptyString(inter.targetMap)) {
    commands.push(
      createCommand(
        'warp',
        {
          map: inter.targetMap.replace(/\.json$/i, ''),
          x: finite(inter.targetX) ? inter.targetX : 0,
          y: finite(inter.targetY) ? inter.targetY : 0,
          facing: '',
          fade: true,
        },
        seed('warp'),
      ),
    );
  }
  if (nonEmptyString(inter.eventKey)) {
    commands.push(createCommand('emit', { event: inter.eventKey, payload: '' }, seed('emit')));
  }

  const page: EventPage = {
    id: deterministicId(`${entityId}/Event/page-1`),
    name: 'Page 1',
    conditions: [],
    trigger: inter.type === 'on_step' ? 'playerTouch' : 'action',
    commands,
    faceOnInteract: true,
    solid: null,
    appearance: {},
  };
  return { pages: [page] };
}

/** Converts one entity to the canonical components. Returns the same object when nothing changed. */
export function migrateEntity(entity: EntityLike): MigrateResult<EngineEntity> {
  const unchanged = { value: entity as EngineEntity, changed: false };
  if (!isRecord(entity) || !isRecord(entity.components)) return unchanged;

  const src = entity.components;
  const entityId = typeof entity.id === 'string' ? entity.id : '';
  const out: Record<string, unknown> = {};

  // Transform: always present afterwards; its position wins over entity.x/y.
  const oldTransform = rec(src.Transform);
  const x = finite(oldTransform?.x) ? oldTransform.x : finite(entity.x) ? entity.x : 0;
  const y = finite(oldTransform?.y) ? oldTransform.y : finite(entity.y) ? entity.y : 0;
  out.Transform = oldTransform ? { ...oldTransform, x, y } : { x, y, depth: 10 };

  const grid = rec(src.GridMovement);
  const free = rec(src.FreeMovement);

  if (src.Sprite !== undefined) out.Sprite = src.Sprite;
  else if (src.SpriteView !== undefined || src.CharacterAnimation !== undefined) {
    out.Sprite = migrateSprite(rec(src.SpriteView), rec(src.CharacterAnimation), grid?.direction ?? free?.direction);
  }

  if (src.Collider !== undefined) out.Collider = src.Collider;

  if (src.Movement !== undefined) out.Movement = src.Movement;
  else if (grid || free || src.PlayerControl !== undefined || src.AIWander !== undefined) {
    out.Movement = migrateMovement(grid, free, rec(src.PlayerControl) ?? (src.PlayerControl !== undefined ? {} : undefined), rec(src.AIWander) ?? (src.AIWander !== undefined ? {} : undefined));
  }

  if (src.Event !== undefined) out.Event = src.Event;
  else if (src.Interactable !== undefined) out.Event = migrateInteractable(entityId, rec(src.Interactable) ?? {});

  if (src.Tag !== undefined) out.Tag = src.Tag;

  for (const [key, value] of Object.entries(src)) {
    if (CANONICAL_ORDER.includes(key) || isLegacyComponentType(key)) continue;
    out[key] = value;
  }

  const result = { ...entity, x, y, components: out } as unknown as EngineEntity;
  return deepEqual(entity, result) ? unchanged : { value: result, changed: true };
}

/**
 * Migrates every entity and stamps `schemaVersion: 2` (maps already at a newer version keep theirs).
 * Returns the same object when nothing changed.
 */
export function migrateMap<T extends object>(map: T): MigrateResult<T> {
  if (!isRecord(map)) return { value: map, changed: false };
  const out: Record<string, unknown> = { ...map };
  let changed = false;

  if (Array.isArray(map.entities)) {
    let entitiesChanged = false;
    const entities = map.entities.map((e: unknown) => {
      if (!isRecord(e)) return e;
      const r = migrateEntity(e as EntityLike);
      if (r.changed) entitiesChanged = true;
      return r.value;
    });
    if (entitiesChanged) {
      out.entities = entities;
      changed = true;
    }
  }

  if (typeof map.schemaVersion !== 'number' || map.schemaVersion < SCHEMA_VERSION) {
    out.schemaVersion = SCHEMA_VERSION;
    changed = true;
  }

  return changed ? { value: out as T, changed: true } : { value: map, changed: false };
}
