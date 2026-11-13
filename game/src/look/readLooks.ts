// Reading looks out of an exported map (the `look` Tiled property of the map, its tile / image layers and its
// pictures: a JSON string, see shared/mapExport.ts) and the looks file (data/looks.json). Pure, tested without Phaser.

import { cleanLookSet, cleanLooksFile } from "@shared/look/schema.ts";
import type { LookSet, LooksFile } from "@shared/look/types.ts";
import { isRecord, rawLayers, tiledProps } from "@/world/tiledRaw";

/** A `look` property value: a JSON string (as exported) or an object; anything unusable is none. */
export function parseLookProp(value: unknown): LookSet | undefined {
  if (typeof value === "string") {
    try {
      return cleanLookSet(JSON.parse(value));
    } catch {
      console.warn("[Looks] a look property is not valid JSON; it is ignored");
      return undefined;
    }
  }
  return cleanLookSet(value);
}

/** The whole map's look. */
export const mapLook = (raw: unknown): LookSet | undefined => (isRecord(raw) ? parseLookProp(tiledProps(raw).look) : undefined);

/** Each tile layer's look, by the layer's name (the name Phaser's tilemap layers carry). */
export function tileLayerLooks(raw: unknown): Map<string, LookSet> {
  const out = new Map<string, LookSet>();
  for (const layer of rawLayers(raw)) {
    if (!isRecord(layer) || layer.type !== "tilelayer" || typeof layer.name !== "string") continue;
    const look = parseLookProp(tiledProps(layer).look);
    if (look) out.set(layer.name, look);
  }
  return out;
}

/** data/looks.json (profiles, the start profile); a missing or damaged file gives the default profiles. */
export const readLooksFile = (raw: unknown): LooksFile => cleanLooksFile(raw);

/** The profile the game starts in: `?look=`, else the file's start, else the first profile (none = default looks). */
export function startProfile(file: LooksFile, requested?: string | null): string | null {
  if (requested && file.profiles.some((p) => p.id === requested)) return requested;
  if (requested) console.warn(`[Looks] ?look=${requested}: no such profile`);
  return file.start ?? file.profiles[0]?.id ?? null;
}

/** Every user shader a map's looks use. */
export function shaderIdsOf(sets: readonly (LookSet | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const set of sets) {
    if (!set) continue;
    for (const look of [set.default, ...Object.values(set.profiles ?? {})]) for (const s of look?.shaders ?? []) ids.add(s.shader);
  }
  return [...ids].sort();
}
