import type { CharacterDef, ClipDef, Facing } from "@shared/engine/index.ts";
import { SpriteRegistry } from "@/data/spriteRegistry";

const FACINGS_ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };

/** Directional clip using row `row(facing) * perRow` … on the given sheet (like the player sheets). */
export function rowsClip(sheet: string, fps: number, perRow: number, extra: Partial<ClipDef> = {}): ClipDef {
  const byFacing: Partial<Record<Facing, number[]>> = {};
  for (const f of Object.keys(FACINGS_ROW) as Facing[]) byFacing[f] = Array.from({ length: perRow }, (_, i) => FACINGS_ROW[f] * perRow + i);
  return { sheet, fps, loop: true, directional: true, byFacing, ...extra };
}

/** A four-facing character with idle/walk/run (follow-speed), a swim set, a one-shot `attack` and a mirrored `wave`. */
export function heroDef(name = "Hero", over: Partial<CharacterDef> = {}): CharacterDef {
  const cut = { frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0 };
  return {
    version: 2,
    name,
    tags: [],
    facing: "four",
    pivot: { x: 0.5, y: 1 },
    sheets: {
      walk: { image: `sprites/${name}/walk.png`, ...cut },
      run: { image: `sprites/${name}/run.png`, ...cut },
      attack: { image: `sprites/${name}/attack.png`, ...cut, pivot: { x: 0.5, y: 0.75 } },
    },
    clips: {
      idle: rowsClip("walk", 1, 1, { loop: false, byFacing: { down: [0], left: [4], right: [8], up: [12] } }),
      walk: rowsClip("walk", 10, 4, { followSpeed: { reference: 100 } }),
      run: rowsClip("run", 15, 4, { followSpeed: { reference: 150 } }),
      swim_idle: rowsClip("walk", 2, 2),
      swim: rowsClip("walk", 6, 4),
      // one-shot: 4 frames at 8 fps = 500 ms; only right is drawn, left mirrors it
      attack: {
        sheet: "attack", fps: 8, loop: false, directional: true,
        byFacing: { down: [0, 1, 2, 3], right: [8, 9, 10, 11], up: [12, 13, 14, 15] },
        mirror: { left: "right" },
      },
      sway: { sheet: "walk", fps: 4, loop: true, directional: false, frames: [0, 1, 2, 1] },
    },
    bindings: { idle: "idle", walk: "walk", run: "run", "swim.idle": "swim_idle", "swim.walk": "swim" },
    ...over,
  };
}

/** A registry holding exactly these characters (URLs are made up, one per sheet). */
export function characterRegistry(characters: Record<string, CharacterDef>): SpriteRegistry {
  const registry = new SpriteRegistry();
  const skipped = registry.load({
    characters: Object.entries(characters).map(([id, def]) => ({
      id,
      def,
      files: Object.fromEntries(Object.keys(def.sheets).map((k) => [k, `graphics/${id}/${k}.png`])),
    })),
  }).skipped;
  if (skipped.length > 0) throw new Error(`test character rejected: ${JSON.stringify(skipped)}`);
  return registry;
}
