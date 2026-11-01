import { normalizeDatabase, parseCommonManifest, type CommonEvent, type GameDatabase } from "@shared/engine/index.ts";

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
  characters: "manifest:characters",
  database: "manifest:database",
  common: "manifest:common",
  tilesets: "manifest:tilesets",
} as const;

export const MANIFEST_URLS = {
  characters: "data/characters.json",
  database: "data/database.json",
  common: "data/common.json",
  tilesets: "data/tilesets.json",
} as const;

/** Data loaded from the manifests, shared by the whole game (filled by the Preloader). */
export const gameData: { database: GameDatabase; tilesets: TilesetEntry[]; common: Map<string, CommonEvent> } = {
  database: normalizeDatabase(null),
  tilesets: [],
  common: new Map(),
};

export function setGameDatabase(raw: unknown): GameDatabase {
  gameData.database = normalizeDatabase(raw);
  return gameData.database;
}

export function setGameTilesets(raw: unknown): TilesetEntry[] {
  gameData.tilesets = parseTilesetManifest(raw);
  return gameData.tilesets;
}

export function setGameCommonEvents(raw: unknown): Map<string, CommonEvent> {
  gameData.common = new Map(parseCommonManifest(raw).map((e) => [e.id, e]));
  return gameData.common;
}
