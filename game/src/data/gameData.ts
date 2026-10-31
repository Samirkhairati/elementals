import { normalizeDatabase, type GameDatabase } from "@shared/engine/index.ts";

export interface TilesetEntry {
  /** Tiled tileset name; also the Phaser texture key. */
  name: string;
  /** URL relative to the web root, e.g. `graphics/tilesets/grass.png`. */
  file: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parses `data/tilesets.json` defensively (unusable entries are dropped, duplicates keep the first). */
export function parseTilesetManifest(raw: unknown): TilesetEntry[] {
  const list = isRecord(raw) && Array.isArray(raw.tilesets) ? raw.tilesets : [];
  const seen = new Set<string>();
  const out: TilesetEntry[] = [];
  for (const t of list) {
    if (!isRecord(t) || typeof t.name !== "string" || typeof t.file !== "string" || !t.name || !t.file) continue;
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    out.push({ name: t.name, file: t.file });
  }
  return out;
}

/** Cache keys the Boot scene stores the manifests under. */
export const MANIFEST_KEYS = {
  sprites: "manifest:sprites",
  database: "manifest:database",
  tilesets: "manifest:tilesets",
} as const;

export const MANIFEST_URLS = {
  sprites: "data/sprites.json",
  database: "data/database.json",
  tilesets: "data/tilesets.json",
} as const;

/** Data loaded from the manifests, shared by the whole game (filled by the Preloader). */
export const gameData: { database: GameDatabase; tilesets: TilesetEntry[] } = {
  database: normalizeDatabase(null),
  tilesets: [],
};

export function setGameDatabase(raw: unknown): GameDatabase {
  gameData.database = normalizeDatabase(raw);
  return gameData.database;
}

export function setGameTilesets(raw: unknown): TilesetEntry[] {
  gameData.tilesets = parseTilesetManifest(raw);
  return gameData.tilesets;
}
