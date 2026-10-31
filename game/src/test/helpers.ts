import type { SpriteAssetMeta, SpriteManifestEntry } from "@shared/engine/index.ts";
import { SpriteRegistry } from "@/data/spriteRegistry";

export function characterMeta(overrides: Partial<SpriteAssetMeta> = {}): SpriteAssetMeta {
  return {
    version: 1,
    name: "Test character",
    kind: "character",
    frameWidth: 32,
    frameHeight: 48,
    margin: 0,
    spacing: 0,
    pivotX: 0.5,
    pivotY: 1,
    character: { sheets: { walk: "walk.png", run: "run.png" }, framesPerDirection: 4, idleFrame: 0, walkFps: 10, runFps: 15 },
    ...overrides,
  };
}

export function objectMeta(overrides: Partial<SpriteAssetMeta> = {}): SpriteAssetMeta {
  return {
    version: 1,
    name: "Test object",
    kind: "object",
    frameWidth: 32,
    frameHeight: 32,
    margin: 0,
    spacing: 0,
    pivotX: 0.5,
    pivotY: 1,
    sheet: "sheet.png",
    animations: { open: { frames: [1, 2, 3], fps: 8, loop: false }, shine: { frames: [0, 1], fps: 4, loop: true } },
    ...overrides,
  };
}

export function manifestEntry(id: string, meta: SpriteAssetMeta): SpriteManifestEntry {
  const files: Record<string, string> = {};
  const sheets = meta.kind === "character" ? Object.values(meta.character?.sheets ?? {}) : [meta.sheet ?? "sheet.png"];
  for (const f of sheets) files[f] = `graphics/sprites/${id}/${f}`;
  return { id, meta, files };
}

/** A registry with `characters/player`, `characters/npc` (no run sheet), `objects/chest` and `objects/sign`. */
export function testSprites(): SpriteRegistry {
  const registry = new SpriteRegistry();
  registry.load({
    version: 1,
    sprites: [
      manifestEntry("characters/player", characterMeta()),
      manifestEntry("characters/npc", characterMeta({ character: { sheets: { walk: "walk.png" }, framesPerDirection: 4, idleFrame: 1, walkFps: 8, runFps: 12 } })),
      manifestEntry("objects/chest", objectMeta()),
      manifestEntry("objects/sign", objectMeta({ animations: {} })),
    ],
  });
  return registry;
}
