/** How long a `changeSprite` lasts. `state` needs no store: the next state change resets the appearance. */
export type AppearancePersist = "state" | "map" | "forever";

export interface AppearanceOverride {
  /** Character id. */
  asset: string;
  /** Clip played with it ('' = automatic). */
  animation: string;
  persist: "map" | "forever";
}

export interface AppearanceOverridesSnapshot {
  version: 1;
  overrides: Record<string, AppearanceOverride>;
}

/** The key under which an override of the player (any map) is stored. */
export const ANY_MAP = "*";

const keyOf = (mapId: string, entityId: string): string => `${mapId}/${entityId}`;

/**
 * Runtime appearance overrides made by `changeSprite` with `persist: map | forever`
 * (docs/database-and-characters-spec.md §10.2). A pure store, kept apart from GameFlags (which stays a
 * flag store): keyed `mapId/entityId`, restored on entity spawn, saved next to the GameFlags snapshot.
 *
 * A "forever" override of the player is stored for ANY map, so the outfit follows them through warps.
 */
export class AppearanceOverrides {
  private readonly map = new Map<string, AppearanceOverride>();

  /** `anyMap` stores the override for every map (used for the player). */
  public set(mapId: string, entityId: string, override: AppearanceOverride, anyMap = false): void {
    this.map.set(keyOf(anyMap ? ANY_MAP : mapId, entityId), { ...override });
  }

  /** The override of an entity on a map: its own, else one stored for any map. */
  public get(mapId: string, entityId: string): AppearanceOverride | undefined {
    return this.map.get(keyOf(mapId, entityId)) ?? this.map.get(keyOf(ANY_MAP, entityId));
  }

  public delete(mapId: string, entityId: string): void {
    this.map.delete(keyOf(mapId, entityId));
    this.map.delete(keyOf(ANY_MAP, entityId));
  }

  /** The player left the map: `map` overrides end (`forever` ones stay). */
  public onMapChanged(): void {
    for (const [key, o] of this.map) if (o.persist === "map") this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public get size(): number {
    return this.map.size;
  }

  /** Only `forever` overrides are saved. */
  public snapshot(): AppearanceOverridesSnapshot {
    const overrides: Record<string, AppearanceOverride> = {};
    for (const [key, o] of [...this.map].sort(([a], [b]) => (a < b ? -1 : 1))) if (o.persist === "forever") overrides[key] = { ...o };
    return { version: 1, overrides };
  }

  /** Replaces the store with a snapshot; malformed entries are dropped. */
  public restore(snapshot: unknown): void {
    this.map.clear();
    const raw = snapshot && typeof snapshot === "object" ? (snapshot as { overrides?: unknown }).overrides : undefined;
    if (!raw || typeof raw !== "object") return;
    for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
      const o = v as Partial<AppearanceOverride> | null;
      if (o && typeof o === "object" && typeof o.asset === "string" && o.asset !== "") {
        this.map.set(key, { asset: o.asset, animation: typeof o.animation === "string" ? o.animation : "", persist: "forever" });
      }
    }
  }
}
