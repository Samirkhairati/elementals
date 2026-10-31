import type { World } from "./World";
import type { Entity } from "./Entity";
import { migrateEntity, tileToAnchor, type EngineEntity, type Facing } from "@shared/engine/index.ts";
import { PlayerPrefab } from "./prefabs/PlayerPrefab";
import { expandEntity, defaultExpandContext, type ExpandContext } from "./expand";

/** A map entity definition as written by the editor (`entities[]` in map JSON). Treated as untrusted. */
export interface EntityDef {
  id?: string;
  name?: string;
  components?: Record<string, unknown>;
}

export interface SpawnProblem {
  /** Index of the offending entry in the `entities` array (-1 when the array itself is malformed). */
  index: number;
  /** Editor id / name of the entity when known. */
  entity?: string;
  message: string;
}

export interface HydrateResult {
  /** Ids of the entities that were created and kept. */
  entities: Entity[];
  problems: SpawnProblem[];
}

export interface PlayerSpawn {
  entity: Entity;
  x: number;
  y: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Old maps used to show the entity's name when an `Interactable` had nothing to say. The migrated Event
 * would be empty, so the name becomes the message before migration (same dialogue as before).
 */
function withNameFallback(def: Record<string, unknown>, label: string | undefined): Record<string, unknown> {
  const components = def.components;
  if (!label || !isRecord(components) || !isRecord(components.Interactable)) return def;
  const inter = components.Interactable;
  const hasContent = (typeof inter.message === "string" && inter.message !== "") ||
    (typeof inter.targetMap === "string" && inter.targetMap !== "") ||
    (typeof inter.eventKey === "string" && inter.eventKey !== "");
  if (hasContent) return def;
  return { ...def, components: { ...components, Interactable: { ...inter, message: label } } };
}

/**
 * Creates one ECS entity per editor-placed entity definition.
 *
 * Every definition is run through `migrateEntity` first (defensive: the exporter already writes canonical
 * entities, legacy ones are converted here), then expanded into runtime components by `expandEntity`.
 *
 * Never throws: a malformed entity is skipped (and any partially-built entity destroyed) with a
 * warning, and recorded in `problems`. Unknown component types are skipped and recorded, but the
 * rest of the entity is still created. A missing sprite asset leaves the entity without a graphic.
 */
export function hydrateMapEntities(world: World, defs: unknown, expandContext?: ExpandContext): HydrateResult {
  const entities: Entity[] = [];
  const problems: SpawnProblem[] = [];

  const report = (problem: SpawnProblem) => {
    problems.push(problem);
    const who = problem.entity ? ` "${problem.entity}"` : "";
    console.warn(`[Spawner] entity #${problem.index}${who}: ${problem.message}`);
  };

  if (defs === undefined || defs === null) return { entities, problems };
  if (!Array.isArray(defs)) {
    report({ index: -1, message: "map `entities` is not an array; ignored" });
    return { entities, problems };
  }

  defs.forEach((def: unknown, index) => {
    if (!isRecord(def)) {
      report({ index, message: "entity definition is not an object; skipped" });
      return;
    }
    const label = typeof def.name === "string" ? def.name : typeof def.id === "string" ? def.id : undefined;

    const components = def.components ?? {};
    if (!isRecord(components)) {
      report({ index, entity: label, message: "`components` is not an object; skipped" });
      return;
    }

    const entity = world.createEntity();
    try {
      const migrated = migrateEntity(withNameFallback(def, label) as Partial<EngineEntity>).value;
      const ctx = expandContext ?? defaultExpandContext();
      const runtimeComponents = expandEntity(migrated, {
        ...ctx,
        warn: (message) => report({ index, entity: label, message }),
      });
      for (const component of runtimeComponents) world.addComponent(entity, component);
      entities.push(entity);
    } catch (err) {
      world.destroyEntity(entity);
      report({ index, entity: label, message: err instanceof Error ? err.message : String(err) });
    }
  });

  return { entities, problems };
}

/**
 * Spawns the player. Without `at` it stands at the centre of the map (the original behaviour); `at`
 * places it on a tile (warps, `?map=` starts) with an optional facing.
 * @param mapSize map dimensions in tiles
 * @param tileSize logical tile size in pixels
 */
export function spawnPlayer(
  world: World,
  mapSize: { width: number; height: number },
  tileSize: number,
  at?: { col: number; row: number; facing?: Facing },
): PlayerSpawn {
  const centred = at === undefined;
  let x = Math.floor(mapSize.width / 2) * tileSize + tileSize / 2;
  let y = (Math.floor(mapSize.height / 2) + 1) * tileSize;
  if (at) {
    const col = Math.min(Math.max(0, Math.trunc(at.col)), Math.max(0, mapSize.width - 1));
    const row = Math.min(Math.max(0, Math.trunc(at.row)), Math.max(0, mapSize.height - 1));
    ({ x, y } = tileToAnchor(col, row));
  }
  const entity = world.spawnPrefab(PlayerPrefab, { x, y, facing: centred ? undefined : at.facing });
  return { entity, x, y };
}
