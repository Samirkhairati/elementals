import type { World } from "./World";
import type { Entity } from "./Entity";
import { PlayerPrefab } from "./prefabs/PlayerPrefab";
import { createComponentFromData } from "./componentFactory";
import { InteractableComponent } from "./components/InteractableComponent";

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
 * Creates one ECS entity per editor-placed entity definition.
 *
 * Never throws: a malformed entity is skipped (and any partially-built entity destroyed) with a
 * warning, and recorded in `problems`. Unknown component types are skipped and recorded, but the
 * rest of the entity is still created.
 */
export function hydrateMapEntities(world: World, defs: unknown): HydrateResult {
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
      for (const [type, props] of Object.entries(components)) {
        const component = createComponentFromData(type, props, (message) =>
          report({ index, entity: label, message }),
        );
        if (component) world.addComponent(entity, component);
      }
      // Dialogue falls back to the editor entity's name when no message was authored.
      const interactable = world.getComponent(entity, InteractableComponent);
      if (interactable && !interactable.message && label) interactable.message = label;
      entities.push(entity);
    } catch (err) {
      world.destroyEntity(entity);
      report({ index, entity: label, message: err instanceof Error ? err.message : String(err) });
    }
  });

  return { entities, problems };
}

/**
 * Spawns the player at the centre of the map.
 * @param mapSize map dimensions in tiles
 * @param tileSize logical tile size in pixels
 */
export function spawnPlayer(
  world: World,
  mapSize: { width: number; height: number },
  tileSize: number,
): PlayerSpawn {
  const x = Math.floor(mapSize.width / 2) * tileSize + tileSize / 2;
  const y = (Math.floor(mapSize.height / 2) + 1) * tileSize;
  const entity = world.spawnPrefab(PlayerPrefab, { x, y });
  return { entity, x, y };
}
