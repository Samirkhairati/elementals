// v1 `sprite.json` -> Character v2 (docs/database-and-characters-spec.md §6). Pure, deterministic and
// idempotent: inputs are never mutated, a v2 record comes back as the very same object.
//
// The naming contract of migrated data is the old one, so the game, tests and saves keep working:
//   texture `sprite:<id>:<sheetKey>` with sheet keys walk / run / sheet; directional clip animation
//   `sprite:<id>:<clip>-<facing>`; non-directional clip `sprite:<id>:<clip>`.
//
// Until the graphics library exists (phase 3) sheets stay where they are: a sheet's `image` is the
// graphic id `sprites/<characterId>/<file>`, whose URL is `graphics/<image>` (= spriteFileUrl).

import type { SpriteAssetMeta } from './types.ts';
import { FACINGS } from './constants.ts';
import type { CharacterDef, ClipDef, SheetDef } from './characters.ts';
import { spriteSheetRoles, validateSpriteMeta, characterFrameIndex } from './sprites.ts';
import { cloneJson, isRecord } from './util.ts';

/** Graphic id of a sheet file of a v1 asset. */
export function legacyGraphicId(assetId: string, file: string): string {
  return `sprites/${assetId}/${file}`;
}

/** Converts a VALID v1 asset (see `validateSpriteMeta`) to a Character v2. Never mutates `meta`. */
export function spriteMetaToCharacter(assetId: string, meta: SpriteAssetMeta): CharacterDef {
  const cut = { frameWidth: meta.frameWidth, frameHeight: meta.frameHeight, margin: meta.margin, spacing: meta.spacing };
  const sheetOf = (file: string): SheetDef => ({ image: legacyGraphicId(assetId, file), ...cut });
  const base = { version: 2 as const, name: meta.name, tags: [] as string[], pivot: { x: meta.pivotX, y: meta.pivotY } };

  if (meta.kind === 'character' && meta.character) {
    const c = meta.character;
    const sheets: Record<string, SheetDef> = {};
    for (const { role, file } of spriteSheetRoles(meta)) sheets[role] = sheetOf(file);

    const cycle = (): Partial<Record<(typeof FACINGS)[number], number[]>> => {
      const byFacing: Partial<Record<(typeof FACINGS)[number], number[]>> = {};
      for (const f of FACINGS) {
        byFacing[f] = Array.from({ length: c.framesPerDirection }, (_, i) => FACINGS.indexOf(f) * c.framesPerDirection + i);
      }
      return byFacing;
    };
    const idle: Partial<Record<(typeof FACINGS)[number], number[]>> = {};
    for (const f of FACINGS) idle[f] = [characterFrameIndex(meta, f, 'idle', 0)];

    const clips: Record<string, ClipDef> = {
      idle: { sheet: 'walk', fps: 1, loop: false, directional: true, byFacing: idle },
      walk: { sheet: 'walk', fps: c.walkFps, loop: true, directional: true, byFacing: cycle() },
    };
    const bindings: Record<string, string> = { idle: 'idle', walk: 'walk' };
    if (sheets.run) {
      clips.run = { sheet: 'run', fps: c.runFps, loop: true, directional: true, byFacing: cycle() };
      bindings.run = 'run';
    }
    return { ...base, facing: 'four', sheets, clips, bindings };
  }

  // object / animated
  const clips: Record<string, ClipDef> = {};
  for (const [name, a] of Object.entries(meta.animations ?? {})) {
    clips[name] = { sheet: 'sheet', fps: a.fps, loop: a.loop, directional: false, frames: [...a.frames] };
  }
  const out: CharacterDef = {
    ...base,
    facing: 'none',
    sheets: { sheet: sheetOf(meta.sheet ?? 'sheet.png') },
    clips,
    bindings: {},
  };
  if (Object.keys(clips).length === 0) out.still = { sheet: 'sheet', frame: 0 };
  return out;
}

export type CharacterMigration =
  | { ok: true; value: CharacterDef; changed: boolean }
  | { ok: false; errors: string[] };

/**
 * Brings a parsed character file up to v2. A v2 record is returned untouched (`changed: false`, the same
 * object); a valid v1 `sprite.json` is converted; anything else reports why it cannot be.
 */
export function migrateCharacter(assetId: string, input: unknown): CharacterMigration {
  if (isRecord(input) && input.version === 2) return { ok: true, value: input as unknown as CharacterDef, changed: false };
  const check = validateSpriteMeta(input);
  if (!check.ok) return { ok: false, errors: check.errors };
  return { ok: true, value: spriteMetaToCharacter(assetId, cloneJson(input as SpriteAssetMeta)), changed: true };
}

/** v1 `files` (sheet file name -> URL) re-keyed by sheet key, the shape of the v2 manifest. */
export function filesBySheetKey(meta: SpriteAssetMeta, filesByName: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { role, file } of spriteSheetRoles(meta)) if (filesByName[file] !== undefined) out[role] = filesByName[file];
  return out;
}
