// Where is a character / graphic / tileset used? A pure reference index over maps, characters and prefabs, plus the
// pure rewrites behind safe rename (docs/database-and-characters-spec.md §11). No React, no IPC: tests and Node
// scripts can use it. The flag (switch / variable / stage) usage scanner stays in the editor and is composed with this
// index there (editor/src/lib/referenceIndex.ts), so there is one index, not two.

import type { CharacterDef } from './characters.ts';
import { isRecord } from './util.ts';

export type RefTarget =
  | { table: 'character'; id: string; clip?: string }
  | { table: 'graphic'; id: string }
  | { table: 'tileset'; id: string };

export type RefSource =
  | { table: 'map'; mapFile: string; mapName: string; entityId: string; entityName: string; stateIndex?: number; stateName?: string; nodeId?: string; nodeType?: string; layer?: string }
  | { table: 'character'; id: string; sheet?: string; binding?: string }
  | { table: 'prefab'; id: string };

export type RefWhere = 'sprite' | 'state-appearance' | 'node' | 'condition' | 'sheet' | 'binding' | 'tileset-layer';

export interface Reference {
  target: RefTarget;
  source: RefSource;
  where: RefWhere;
  /** "Town › Old man › State 2 › Change Sprite node" */
  label: string;
}

/** The slice of a map the index reads (an editor `MapData` fits). */
export interface RefMap {
  fileName: string;
  name: string;
  layers?: { name: string; data?: Record<number, { tilesetId: string }> }[];
  entities?: { id: string; name: string; components?: Record<string, unknown> }[];
}

export interface RefPrefab {
  id: string;
  /** Anything shaped like an entity (a prefab's `components` fit). */
  entity: { components?: object };
}

export interface ReferenceInput {
  maps: readonly RefMap[];
  characters: readonly { id: string; def: CharacterDef }[];
  prefabs?: readonly RefPrefab[];
}

export interface ReferenceIndex {
  all: readonly Reference[];
  /** References to `target`; a character target without `clip` includes its clip-level references. */
  of(target: RefTarget): Reference[];
  /** Number of references per id of a table (clip-level ones count for the character too). */
  counts(table: RefTarget['table']): Record<string, number>;
  /** Number of references per clip of a character. */
  clipCounts(characterId: string): Record<string, number>;
}

const COMMAND_LABELS: Record<string, string> = { changeSprite: 'Change Sprite', playAnimation: 'Play Animation' };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const states = (entity: { components?: object }): Record<string, unknown>[] => {
  const event = (entity.components as Record<string, unknown> | undefined)?.Event;
  return isRecord(event) && Array.isArray(event.states) ? (event.states as unknown[]).filter(isRecord) : [];
};
const nodesOf = (state: Record<string, unknown>): Record<string, unknown>[] => (isRecord(state.graph) && Array.isArray(state.graph.nodes) ? (state.graph.nodes as unknown[]).filter(isRecord) : []);
const spriteOf = (entity: { components?: object }): Record<string, unknown> | null => {
  const sprite = (entity.components as Record<string, unknown> | undefined)?.Sprite;
  return isRecord(sprite) ? sprite : null;
};

/** Character a node's `target` refers to on this map (self = the entity itself, {entity} = another one; the player is unknown). */
function targetCharacter(target: unknown, self: { components?: object }, byId: Map<string, { components?: object }>): string {
  if (target === undefined || target === 'self') return str(spriteOf(self)?.asset);
  if (isRecord(target) && typeof target.entity === 'string') {
    const e = byId.get(target.entity);
    return e ? str(spriteOf(e)?.asset) : '';
  }
  return '';
}

export function buildReferenceIndex(input: ReferenceInput): ReferenceIndex {
  const all: Reference[] = [];
  const addCharacter = (id: string, clip: string, source: RefSource, where: RefWhere, label: string) => {
    if (!id) return;
    all.push({ target: { table: 'character', id }, source, where, label });
    if (clip) all.push({ target: { table: 'character', id, clip }, source, where, label });
  };

  for (const map of input.maps) {
    const mapName = map.name || map.fileName;
    const byId = new Map((map.entities ?? []).map((e) => [e.id, e]));
    for (const layer of map.layers ?? []) {
      const used = new Set(Object.values(layer.data ?? {}).map((t) => t.tilesetId));
      for (const id of used) {
        all.push({ target: { table: 'tileset', id }, source: { table: 'map', mapFile: map.fileName, mapName, entityId: '', entityName: '', layer: layer.name }, where: 'tileset-layer', label: `${mapName} › layer ${layer.name}` });
      }
    }
    for (const entity of map.entities ?? []) {
      const entityName = entity.name || entity.id;
      const base = { table: 'map' as const, mapFile: map.fileName, mapName, entityId: entity.id, entityName };
      const sprite = spriteOf(entity);
      if (sprite) addCharacter(str(sprite.asset), str(sprite.animation), base, 'sprite', `${mapName} › ${entityName} › Sprite`);
      states(entity).forEach((state, stateIndex) => {
        const stateName = str(state.name) || `State ${stateIndex + 1}`;
        const where = { ...base, stateIndex, stateName };
        const appearance = isRecord(state.appearance) ? state.appearance : {};
        const appAsset = str(appearance.asset);
        if (appAsset || str(appearance.animation)) {
          addCharacter(appAsset || str(sprite?.asset), str(appearance.animation), where, 'state-appearance', `${mapName} › ${entityName} › ${stateName} › appearance`);
        }
        for (const node of nodesOf(state)) {
          const type = str(node.type);
          if (type !== 'changeSprite' && type !== 'playAnimation') continue;
          const params = isRecord(node.params) ? node.params : {};
          const label = `${mapName} › ${entityName} › ${stateName} › ${COMMAND_LABELS[type]} node`;
          const source = { ...where, nodeId: str(node.id), nodeType: type };
          const character = type === 'changeSprite' ? str(params.asset) : targetCharacter(params.target, entity, byId);
          addCharacter(character, str(params.animation), source, 'node', label);
        }
      });
    }
  }

  for (const c of input.characters) {
    for (const [sheet, s] of Object.entries(c.def.sheets ?? {})) {
      all.push({ target: { table: 'graphic', id: s.image }, source: { table: 'character', id: c.id, sheet }, where: 'sheet', label: `${c.def.name || c.id} › sheet ${sheet}` });
    }
    for (const [binding, clip] of Object.entries(c.def.bindings ?? {})) {
      all.push({ target: { table: 'character', id: c.id, clip }, source: { table: 'character', id: c.id, binding }, where: 'binding', label: `${c.def.name || c.id} › binding ${binding}` });
    }
  }

  for (const p of input.prefabs ?? []) {
    const sprite = spriteOf(p.entity);
    if (sprite) addCharacter(str(sprite.asset), str(sprite.animation), { table: 'prefab', id: p.id }, 'sprite', `Prefab ${p.id} › Sprite`);
    for (const state of states(p.entity)) {
      const appearance = isRecord(state.appearance) ? state.appearance : {};
      addCharacter(str(appearance.asset), str(appearance.animation), { table: 'prefab', id: p.id }, 'state-appearance', `Prefab ${p.id} › appearance`);
      for (const node of nodesOf(state)) {
        if (str(node.type) !== 'changeSprite') continue;
        const params = isRecord(node.params) ? node.params : {};
        addCharacter(str(params.asset), str(params.animation), { table: 'prefab', id: p.id }, 'node', `Prefab ${p.id} › Change Sprite node`);
      }
    }
  }

  const matches = (r: Reference, t: RefTarget): boolean => {
    if (r.target.table !== t.table || r.target.id !== t.id) return false;
    if (t.table !== 'character') return true;
    const clip = (r.target as { clip?: string }).clip;
    return t.clip === undefined ? clip === undefined : clip === t.clip;
  };
  return {
    all,
    of: (target) => all.filter((r) => matches(r, target)),
    counts(table) {
      const out: Record<string, number> = {};
      for (const r of all) if (r.target.table === table && !(r.target.table === 'character' && r.target.clip !== undefined)) out[r.target.id] = (out[r.target.id] ?? 0) + 1;
      return out;
    },
    clipCounts(characterId) {
      const out: Record<string, number> = {};
      for (const r of all) if (r.target.table === 'character' && r.target.id === characterId && r.target.clip !== undefined) out[r.target.clip] = (out[r.target.clip] ?? 0) + 1;
      return out;
    },
  };
}

// ── rewrites (safe rename) ──────────────────────────────────────────────────────────────────────

/** Deep-maps the entities of a map through `fn`; returns the same map object when nothing changed. */
function rewriteEntities<M extends RefMap>(map: M, fn: (entity: NonNullable<M['entities']>[number], self: Map<string, NonNullable<M['entities']>[number]>) => NonNullable<M['entities']>[number]): { map: M; changed: boolean } {
  if (!map.entities) return { map, changed: false };
  const byId = new Map(map.entities.map((e) => [e.id, e]));
  let changed = false;
  const entities = map.entities.map((e) => {
    const next = fn(e, byId);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? { map: { ...map, entities }, changed } : { map, changed };
}

function mapStates(entity: { components?: Record<string, unknown> }, fn: (state: Record<string, unknown>) => Record<string, unknown>): { components?: Record<string, unknown> } {
  const event = (entity.components as Record<string, unknown> | undefined)?.Event;
  if (!isRecord(event) || !Array.isArray(event.states)) return entity;
  let changed = false;
  const next = (event.states as unknown[]).map((s) => {
    if (!isRecord(s)) return s;
    const out = fn(s);
    if (out !== s) changed = true;
    return out;
  });
  return changed ? { ...entity, components: { ...entity.components, Event: { ...event, states: next } } } : entity;
}

function mapNodes(state: Record<string, unknown>, fn: (node: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(state.graph) || !Array.isArray(state.graph.nodes)) return state;
  let changed = false;
  const nodes = (state.graph.nodes as unknown[]).map((n) => {
    if (!isRecord(n)) return n;
    const out = fn(n);
    if (out !== n) changed = true;
    return out;
  });
  return changed ? { ...state, graph: { ...state.graph, nodes } } : state;
}

/** Renames a character id everywhere a map stores it (Sprite.asset, state appearance, Change Sprite nodes). */
export function rewriteCharacterId<M extends RefMap>(map: M, from: string, to: string): { map: M; changed: boolean } {
  return rewriteEntities(map, (entity) => {
    let e: typeof entity = entity;
    const sprite = spriteOf(entity);
    if (sprite && sprite.asset === from) e = { ...e, components: { ...e.components, Sprite: { ...sprite, asset: to } } };
    return mapStates(e, (state) => {
      let s = state;
      const appearance = isRecord(s.appearance) ? s.appearance : null;
      if (appearance && appearance.asset === from) s = { ...s, appearance: { ...appearance, asset: to } };
      return mapNodes(s, (node) => {
        const params = isRecord(node.params) ? node.params : {};
        return node.type === 'changeSprite' && params.asset === from ? { ...node, params: { ...params, asset: to } } : node;
      });
    }) as typeof entity;
  });
}

/** Renames an animation of `characterId` everywhere a map names it. */
export function rewriteClipName<M extends RefMap>(map: M, characterId: string, from: string, to: string): { map: M; changed: boolean } {
  return rewriteEntities(map, (entity, byId) => {
    let e: typeof entity = entity;
    const sprite = spriteOf(entity);
    if (sprite && sprite.asset === characterId && sprite.animation === from) e = { ...e, components: { ...e.components, Sprite: { ...sprite, animation: to } } };
    return mapStates(e, (state) => {
      let s = state;
      const appearance = isRecord(s.appearance) ? s.appearance : null;
      if (appearance && appearance.animation === from && (str(appearance.asset) || str(sprite?.asset)) === characterId) s = { ...s, appearance: { ...appearance, animation: to } };
      return mapNodes(s, (node) => {
        const params = isRecord(node.params) ? node.params : {};
        if (params.animation !== from) return node;
        const character = node.type === 'changeSprite' ? str(params.asset) : node.type === 'playAnimation' ? targetCharacter(params.target, entity, byId) : '';
        return character === characterId ? { ...node, params: { ...params, animation: to } } : node;
      });
    }) as typeof entity;
  });
}

/** Points a character's sheets at another graphic id. */
export function rewriteGraphicId(def: CharacterDef, from: string, to: string): { def: CharacterDef; changed: boolean } {
  let changed = false;
  const sheets = Object.fromEntries(Object.entries(def.sheets).map(([k, s]) => {
    if (s.image !== from) return [k, s];
    changed = true;
    return [k, { ...s, image: to }];
  }));
  return changed ? { def: { ...def, sheets }, changed } : { def, changed };
}

// ── preload sets ────────────────────────────────────────────────────────────────────────────────

/**
 * Characters a map needs on screen or can swap to: entity sprites, event-state appearances and Change Sprite nodes
 * (the same scan as where-used), sorted and without duplicates. The game loads these before the map is shown and
 * loads any other character lazily the first time something swaps to it.
 */
export function characterIdsOfMap(map: RefMap): string[] {
  const ids = new Set<string>();
  for (const r of buildReferenceIndex({ maps: [map], characters: [] }).all) {
    if (r.target.table === 'character' && r.target.clip === undefined) ids.add(r.target.id);
  }
  return [...ids].sort();
}
