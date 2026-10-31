import { STRUCTURAL_TYPES, filesBySheetKey, spriteMetaToCharacter, type EventState, type GraphNode, type SpriteAssetMeta, type SpriteManifestEntry } from "@shared/engine/index.ts";
import { SpriteRegistry, type CharacterEntry } from "@/data/spriteRegistry";

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

/** An entry of the v1 `sprites.json` manifest (what `assets:sync` still writes). */
export function legacyManifestEntry(id: string, meta: SpriteAssetMeta): SpriteManifestEntry {
  const files: Record<string, string> = {};
  const sheets = meta.kind === "character" ? Object.values(meta.character?.sheets ?? {}) : [meta.sheet ?? "sheet.png"];
  for (const f of sheets) files[f] = `graphics/sprites/${id}/${f}`;
  return { id, meta, files };
}

/** The same asset as a loaded character (v2 definition, URLs by sheet key). */
export function manifestEntry(id: string, meta: SpriteAssetMeta): CharacterEntry {
  return { id, def: spriteMetaToCharacter(id, meta), files: filesBySheetKey(meta, legacyManifestEntry(id, meta).files) };
}

/** A registry with `characters/player`, `characters/npc` (no run sheet), `objects/chest` and `objects/sign`. */
export function testSprites(): SpriteRegistry {
  const registry = new SpriteRegistry();
  registry.load({
    version: 1,
    sprites: [
      legacyManifestEntry("characters/player", characterMeta()),
      legacyManifestEntry("characters/npc", characterMeta({ character: { sheets: { walk: "walk.png" }, framesPerDirection: 4, idleFrame: 1, walkFps: 8, runFps: 12 } })),
      legacyManifestEntry("objects/chest", objectMeta()),
      legacyManifestEntry("objects/sign", objectMeta({ animations: {} })),
    ],
  });
  return registry;
}

/** The command nodes of a state in authoring order (start / end / junction nodes left out). */
export function commandNodes(state: Pick<EventState, "graph">): GraphNode[] {
  return state.graph.nodes.filter((n) => !STRUCTURAL_TYPES.includes(n.type));
}

export const commandTypes = (state: Pick<EventState, "graph">): string[] => commandNodes(state).map((n) => n.type);
export const firstCommand = (state: Pick<EventState, "graph">): GraphNode => commandNodes(state)[0];
