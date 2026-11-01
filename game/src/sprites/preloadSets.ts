import { characterIdsOfMap } from "@shared/engine/index.ts";
import { PLAYER_ASSET_ID } from "@/ecs/prefabs/PlayerPrefab";

/**
 * Characters a map needs before it is shown: the player, every entity sprite, event-state appearance and Change Sprite
 * target on the map (extra ids, e.g. saved appearance overrides, can be added). Others load when first swapped to.
 */
export function charactersForMap(rawMapData: unknown, extra: Iterable<string> = []): string[] {
  const entities = (rawMapData as { entities?: unknown } | null | undefined)?.entities;
  const ids = new Set<string>([PLAYER_ASSET_ID, ...extra]);
  if (Array.isArray(entities)) for (const id of characterIdsOfMap({ fileName: "", name: "", entities: entities as never })) ids.add(id);
  return [...ids].sort();
}
