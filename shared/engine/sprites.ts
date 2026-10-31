// Sprite asset maths and the naming contract shared by the editor preview and the game.
//
// Naming contract (the game registers exactly these keys; tests rely on them):
//   texture   sprite:<assetId>:<sheetRole>        role = walk | run (character) or sheet (object / animated)
//   character animation  sprite:<assetId>:<phase>-<facing>   phase = idle | walk | run
//   object animation     sprite:<assetId>:<animationName>
// `assetId` is the directory path under project/sprites (e.g. `characters/player`).
//
// Character sheet layout: rows are down, left, right, up (FACINGS order); each row has
// `framesPerDirection` frames, so a frame index is `row * framesPerDirection + column`. Character
// sheets must be exactly `framesPerDirection` frames wide (checkSheetDimensions warns otherwise).

import type { Facing, SpriteAssetMeta, SpriteKind, SpriteProps, SpriteAnimationDef } from './types.ts';
import { FACINGS } from './constants.ts';
import { cloneJson, isRecord } from './util.ts';

export type CharacterPhase = 'idle' | 'walk' | 'run';
export type SpriteSheetRole = 'walk' | 'run' | 'sheet';

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── naming ──────────────────────────────────────────────────────────────────────────────────────

export function spriteTextureKey(assetId: string, sheetName: string): string {
  return `sprite:${assetId}:${sheetName}`;
}

export function characterAnimKey(assetId: string, phase: CharacterPhase, facing: Facing): string {
  return `sprite:${assetId}:${phase}-${facing}`;
}

export function objectAnimKey(assetId: string, name: string): string {
  return `sprite:${assetId}:${name}`;
}

/** URL root (relative to the game's web root) that scripts/sync-assets.mjs copies sheets to. */
export const SPRITE_URL_ROOT = 'graphics/sprites';

export function spriteFileUrl(assetId: string, file: string): string {
  return `${SPRITE_URL_ROOT}/${assetId}/${file}`;
}

/** The sheets an asset uses: role (texture-key suffix) and PNG file name. */
export function spriteSheetRoles(meta: SpriteAssetMeta): { role: SpriteSheetRole; file: string }[] {
  const out: { role: SpriteSheetRole; file: string }[] = [];
  if (meta.kind === 'character') {
    const sheets = meta.character?.sheets;
    if (sheets?.walk) out.push({ role: 'walk', file: sheets.walk });
    if (sheets?.run) out.push({ role: 'run', file: sheets.run });
  } else if (meta.sheet) {
    out.push({ role: 'sheet', file: meta.sheet });
  }
  return out;
}

// ── validation & defaults ───────────────────────────────────────────────────────────────────────

export interface SpriteMetaCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Checks a parsed `sprite.json`. Never throws. */
export function validateSpriteMeta(meta: unknown): SpriteMetaCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(meta)) return { ok: false, errors: ['sprite.json must be an object'], warnings };

  if (meta.version !== 1) errors.push(`version must be 1 (got ${JSON.stringify(meta.version)})`);
  if (typeof meta.name !== 'string') errors.push('name must be a string');
  if (meta.kind !== 'character' && meta.kind !== 'object' && meta.kind !== 'animated') {
    errors.push(`kind must be character, object or animated (got ${JSON.stringify(meta.kind)})`);
  }
  for (const key of ['frameWidth', 'frameHeight'] as const) {
    if (!isInt(meta[key]) || (meta[key] as number) < 1) errors.push(`${key} must be a positive integer`);
  }
  for (const key of ['margin', 'spacing'] as const) {
    if (!isInt(meta[key]) || (meta[key] as number) < 0) errors.push(`${key} must be a non-negative integer`);
  }
  for (const key of ['pivotX', 'pivotY'] as const) {
    if (!isNum(meta[key]) || meta[key] < 0 || meta[key] > 1) errors.push(`${key} must be a number between 0 and 1`);
  }

  if (meta.kind === 'character') {
    const c = meta.character;
    if (!isRecord(c)) {
      errors.push('character assets need a "character" section');
    } else {
      const sheets = c.sheets;
      if (!isRecord(sheets) || typeof sheets.walk !== 'string' || sheets.walk === '') errors.push('character.sheets.walk must be a file name');
      else if (sheets.run !== undefined && (typeof sheets.run !== 'string' || sheets.run === '')) errors.push('character.sheets.run must be a file name');
      if (!isInt(c.framesPerDirection) || c.framesPerDirection < 1) errors.push('character.framesPerDirection must be a positive integer');
      else if (!isInt(c.idleFrame) || c.idleFrame < 0 || c.idleFrame >= c.framesPerDirection) {
        errors.push('character.idleFrame must be an integer from 0 to framesPerDirection-1');
      }
      for (const key of ['walkFps', 'runFps'] as const) {
        if (!isNum(c[key]) || c[key] <= 0) errors.push(`character.${key} must be a positive number`);
      }
    }
    if (meta.sheet !== undefined) warnings.push('"sheet" is ignored for character assets');
  } else if (meta.kind === 'object' || meta.kind === 'animated') {
    if (typeof meta.sheet !== 'string' || meta.sheet === '') errors.push(`${meta.kind} assets need "sheet" (a PNG file name)`);
    if (meta.animations !== undefined) {
      if (!isRecord(meta.animations)) {
        errors.push('animations must be an object');
      } else {
        for (const [name, a] of Object.entries(meta.animations)) {
          if (!isRecord(a)) {
            errors.push(`animation "${name}" must be an object`);
            continue;
          }
          if (!Array.isArray(a.frames) || a.frames.length === 0 || a.frames.some((f) => !isInt(f) || f < 0)) {
            errors.push(`animation "${name}": frames must be a non-empty list of non-negative integers`);
          }
          if (!isNum(a.fps) || a.fps <= 0) errors.push(`animation "${name}": fps must be a positive number`);
          if (typeof a.loop !== 'boolean') errors.push(`animation "${name}": loop must be true or false`);
          if (['up', 'down', 'left', 'right'].some((f) => name === `idle-${f}`)) warnings.push(`animation "${name}" looks like a character animation name`);
        }
      }
    }
    if (meta.kind === 'animated' && (!isRecord(meta.animations) || Object.keys(meta.animations).length === 0)) {
      warnings.push('animated assets should define at least one animation');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * A reasonable starting `sprite.json` for a freshly imported sheet.
 * character: 4x4 grid (frames = sheet/4), walk.png, 4 frames per direction. object: the whole sheet is
 * one frame. animated: square frames of the sheet height laid out in a row, one looping "idle" animation.
 */
export function defaultSpriteMeta(
  kind: SpriteKind,
  size: { sheetWidth: number; sheetHeight: number; name?: string },
): SpriteAssetMeta {
  const w = Math.max(1, Math.floor(size.sheetWidth) || 1);
  const h = Math.max(1, Math.floor(size.sheetHeight) || 1);
  const base = { version: 1 as const, name: size.name ?? '', kind, margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1 };

  if (kind === 'character') {
    return {
      ...base,
      frameWidth: Math.max(1, Math.floor(w / 4)),
      frameHeight: Math.max(1, Math.floor(h / 4)),
      character: { sheets: { walk: 'walk.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 8, runFps: 12 },
    };
  }
  if (kind === 'animated') {
    const frameWidth = Math.min(w, h);
    const count = Math.max(1, Math.floor(w / frameWidth));
    return {
      ...base,
      frameWidth,
      frameHeight: h,
      sheet: 'sheet.png',
      animations: { idle: { frames: Array.from({ length: count }, (_, i) => i), fps: 8, loop: true } },
    };
  }
  return { ...base, frameWidth: w, frameHeight: h, sheet: 'sheet.png', animations: {} };
}

// ── frame maths ─────────────────────────────────────────────────────────────────────────────────

/** Frames that fit in an image of the given size (margin on both sides, spacing between frames). */
export function sheetGrid(
  meta: Pick<SpriteAssetMeta, 'frameWidth' | 'frameHeight' | 'margin' | 'spacing'>,
  imageW: number,
  imageH: number,
): { columns: number; rows: number; count: number } {
  const columns = Math.max(0, Math.floor((imageW - 2 * meta.margin + meta.spacing) / (meta.frameWidth + meta.spacing)));
  const rows = Math.max(0, Math.floor((imageH - 2 * meta.margin + meta.spacing) / (meta.frameHeight + meta.spacing)));
  return { columns, rows, count: columns * rows };
}

/**
 * Pixel rectangle of a frame inside its sheet. Character sheets use `framesPerDirection` columns
 * (see the layout note above); other kinds derive the column count from `imageW`.
 */
export function frameRect(meta: SpriteAssetMeta, frameIndex: number, imageW: number): FrameRect {
  const columns =
    meta.kind === 'character' && meta.character
      ? meta.character.framesPerDirection
      : Math.max(1, sheetGrid(meta, imageW, meta.frameHeight).columns);
  const index = Math.max(0, Math.trunc(frameIndex));
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: meta.margin + col * (meta.frameWidth + meta.spacing),
    y: meta.margin + row * (meta.frameHeight + meta.spacing),
    w: meta.frameWidth,
    h: meta.frameHeight,
  };
}

/**
 * Frame index of a character sprite. `tick` is elapsed animation time in milliseconds; idle ignores it.
 * Idle shows `idleFrame` of the facing row; walk/run cycle the row at walkFps/runFps.
 */
export function characterFrameIndex(meta: SpriteAssetMeta, facing: Facing, phase: CharacterPhase, tick: number): number {
  const c = meta.character;
  if (!c) return 0;
  const per = Math.max(1, c.framesPerDirection);
  const row = Math.max(0, FACINGS.indexOf(facing));
  if (phase === 'idle') return row * per + Math.min(per - 1, Math.max(0, c.idleFrame));
  const fps = phase === 'run' ? c.runFps : c.walkFps;
  const step = Math.floor((Math.max(0, tick) * fps) / 1000) % per;
  return row * per + step;
}

/** Frame an animation shows after `tick` ms; non-looping animations hold their last frame. */
export function animationFrameAt(anim: SpriteAnimationDef, tick: number): number {
  if (anim.frames.length === 0) return 0;
  const step = Math.floor((Math.max(0, tick) * anim.fps) / 1000);
  const i = anim.loop ? step % anim.frames.length : Math.min(step, anim.frames.length - 1);
  return anim.frames[i];
}

export interface PreviewFrame {
  /** PNG file name inside the asset directory. */
  sheetFile: string;
  /** Texture-key suffix for `spriteTextureKey`. */
  sheetRole: SpriteSheetRole;
  frameIndex: number;
  /** null when it cannot be computed (non-character asset and no `imageW`). */
  rect: FrameRect | null;
}

/**
 * The frame the editor preview AND the game show for a Sprite at animation time `tick` (ms).
 *  - character: `animation` '' or 'idle' -> idle frame of `facing`; 'walk' / 'run' -> that cycle
 *    (the running game picks idle/walk/run itself from movement; a static preview uses idle).
 *  - object / animated: `animation` naming an animation of the asset plays it (looping per its
 *    definition); otherwise the static `frame` is shown.
 * `imageW` (sheet width in px) is only needed for the rect of non-character assets.
 */
export function previewFrame(
  meta: SpriteAssetMeta,
  sprite: Pick<SpriteProps, 'facing' | 'animation' | 'frame'>,
  tick: number,
  imageW?: number,
): PreviewFrame {
  if (meta.kind === 'character' && meta.character) {
    const phase: CharacterPhase = sprite.animation === 'walk' || sprite.animation === 'run' ? sprite.animation : 'idle';
    const useRun = phase === 'run' && !!meta.character.sheets.run;
    const frameIndex = characterFrameIndex(meta, sprite.facing, useRun ? 'run' : phase === 'run' ? 'walk' : phase, tick);
    return {
      sheetFile: useRun ? (meta.character.sheets.run as string) : meta.character.sheets.walk,
      sheetRole: useRun ? 'run' : 'walk',
      frameIndex,
      rect: frameRect(meta, frameIndex, imageW ?? 0),
    };
  }

  const anim = sprite.animation && meta.animations && Object.hasOwn(meta.animations, sprite.animation) ? meta.animations[sprite.animation] : undefined;
  const frameIndex = anim ? animationFrameAt(anim, tick) : Math.max(0, Math.round(Number.isFinite(sprite.frame) ? sprite.frame : 0));
  return {
    sheetFile: meta.sheet ?? '',
    sheetRole: 'sheet',
    frameIndex,
    rect: imageW !== undefined && imageW > 0 ? frameRect(meta, frameIndex, imageW) : null,
  };
}

/** Warnings about sheet images whose size does not match the metadata. `sizes` is keyed by file name. */
export function checkSheetDimensions(meta: SpriteAssetMeta, sizes: Record<string, { width: number; height: number }>): string[] {
  const warnings: string[] = [];
  for (const { role, file } of spriteSheetRoles(meta)) {
    const size = sizes[file];
    if (!size) {
      warnings.push(`sheet "${file}" (${role}) is missing`);
      continue;
    }
    const grid = sheetGrid(meta, size.width, size.height);
    if (meta.kind === 'character' && meta.character) {
      const per = meta.character.framesPerDirection;
      if (grid.columns !== per || grid.rows < 4) {
        warnings.push(`sheet "${file}" fits ${grid.columns}x${grid.rows} frames but a character needs ${per}x4`);
      }
    } else if (grid.count === 0) {
      warnings.push(`sheet "${file}" is smaller than one frame (${meta.frameWidth}x${meta.frameHeight})`);
    } else if (meta.animations) {
      for (const [name, a] of Object.entries(meta.animations)) {
        if (a.frames.some((f) => f >= grid.count)) warnings.push(`animation "${name}" uses a frame beyond the ${grid.count} frames of "${file}"`);
      }
    }
  }
  return warnings;
}

// ── animation registration (what the game creates) ─────────────────────────────────────────────

export interface AnimationRegistration {
  key: string;
  /** Texture key of the sheet the frames come from. */
  textureKey: string;
  /** Frame indexes into that texture. */
  frames: number[];
  fps: number;
  loop: boolean;
}

/**
 * Every animation the game must register for an asset, keyed per the naming contract.
 * character: idle-<facing> (single frame), walk-<facing>, and run-<facing> when a run sheet exists.
 * object / animated: one per named animation.
 */
export function buildAnimationRegistrations(assetId: string, meta: SpriteAssetMeta): AnimationRegistration[] {
  const out: AnimationRegistration[] = [];
  if (meta.kind === 'character' && meta.character) {
    const c = meta.character;
    const walkTexture = spriteTextureKey(assetId, 'walk');
    for (const facing of FACINGS) {
      out.push({
        key: characterAnimKey(assetId, 'idle', facing),
        textureKey: walkTexture,
        frames: [characterFrameIndex(meta, facing, 'idle', 0)],
        fps: 1,
        loop: false,
      });
      const cycle = Array.from({ length: c.framesPerDirection }, (_, i) => FACINGS.indexOf(facing) * c.framesPerDirection + i);
      out.push({ key: characterAnimKey(assetId, 'walk', facing), textureKey: walkTexture, frames: cycle, fps: c.walkFps, loop: true });
      if (c.sheets.run) {
        out.push({ key: characterAnimKey(assetId, 'run', facing), textureKey: spriteTextureKey(assetId, 'run'), frames: cycle, fps: c.runFps, loop: true });
      }
    }
    return out;
  }
  for (const [name, a] of Object.entries(meta.animations ?? {})) {
    out.push({ key: objectAnimKey(assetId, name), textureKey: spriteTextureKey(assetId, 'sheet'), frames: [...a.frames], fps: a.fps, loop: a.loop });
  }
  return out;
}

// ── manifest (game/public/data/sprites.json) ────────────────────────────────────────────────────

export interface SpriteManifestEntry {
  id: string;
  meta: SpriteAssetMeta;
  /** Sheet file name -> URL path relative to the game's web root (e.g. graphics/sprites/characters/player/walk.png). */
  files: Record<string, string>;
}

export interface SpriteManifest {
  version: 1;
  sprites: SpriteManifestEntry[];
}

/** Deterministic manifest: sorted by id, `files` derived from the sheets the metadata references. */
export function buildSpriteManifest(assets: { id: string; meta: SpriteAssetMeta }[]): SpriteManifest {
  const sprites = assets
    .map((a) => {
      const files: Record<string, string> = {};
      for (const { file } of spriteSheetRoles(a.meta)) files[file] = spriteFileUrl(a.id, file);
      return { id: a.id, meta: cloneJson(a.meta), files };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 1, sprites };
}

/** Problems that make a set of assets unusable (invalid metadata, duplicate or malformed ids). */
export function validateSpriteAssets(assets: { id: string; meta: unknown }[]): { id: string; message: string }[] {
  const issues: { id: string; message: string }[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    if (!/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i.test(a.id)) issues.push({ id: a.id, message: 'id must be a slash-separated path of letters, digits, - and _' });
    if (seen.has(a.id)) issues.push({ id: a.id, message: 'duplicate sprite id' });
    seen.add(a.id);
    for (const e of validateSpriteMeta(a.meta).errors) issues.push({ id: a.id, message: e });
  }
  return issues;
}
