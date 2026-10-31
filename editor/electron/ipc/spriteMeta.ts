/**
 * Pure (fs-free) validation and normalisation of `project/sprites/<id>/sprite.json`.
 *
 * The types mirror `SpriteAssetMeta` in shared/engine/types.ts. They are re-declared here because the
 * Electron main process is compiled with `rootDir: electron` and cannot import from `shared/`.
 * `scripts/assets-parity.test.mjs` checks this validator against the shared one.
 */

export type SpriteKind = 'character' | 'object' | 'animated';

export interface SpriteAnimationDef {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SpriteAssetMeta {
  version: 1;
  name: string;
  kind: SpriteKind;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
  pivotX: number;
  pivotY: number;
  character?: {
    sheets: { walk: string; run?: string };
    framesPerDirection: number;
    idleFrame: number;
    walkFps: number;
    runFps: number;
  };
  sheet?: string;
  animations?: Record<string, SpriteAnimationDef>;
}

export interface SheetSize {
  width: number;
  height: number;
}

export const SPRITE_KINDS: readonly SpriteKind[] = ['character', 'object', 'animated'];
export const SPRITE_META_FILE = 'sprite.json';
/** Rows of a character sheet: down, left, right, up. */
export const CHARACTER_ROWS = 4;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A sheet reference is a plain `*.png` file name living next to sprite.json. */
export function isSafeSheetName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > '.png'.length &&
    name.length <= 255 &&
    name.endsWith('.png') &&
    !name.startsWith('.') &&
    !/[\\/\0]/.test(name) &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(name)
  );
}

/** Sprite ids are directory paths: `/`-separated segments of letters, digits, `_` and `-`. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export function isValidSpriteId(id: unknown): id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 200) return false;
  return id.split('/').every((segment) => SEGMENT.test(segment));
}

/** `Fire Ball!` -> `fire_ball`. Never empty. */
export function slugifySpriteName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'sprite';
}

/** Sheet file names a meta refers to, in a stable order. */
export function sheetNamesOf(meta: SpriteAssetMeta): string[] {
  if (meta.kind === 'character') {
    const sheets = meta.character?.sheets;
    return sheets ? [sheets.walk, ...(sheets.run ? [sheets.run] : [])] : [];
  }
  return meta.sheet ? [meta.sheet] : [];
}

/** Number of columns/rows of whole frames in a sheet, or null when the frame size does not tile it exactly. */
export function sheetGrid(meta: SpriteAssetMeta, size: SheetSize): { cols: number; rows: number } | null {
  const { frameWidth: fw, frameHeight: fh, margin, spacing } = meta;
  const usableW = size.width - 2 * margin + spacing;
  const usableH = size.height - 2 * margin + spacing;
  if (usableW <= 0 || usableH <= 0) return null;
  if (usableW % (fw + spacing) !== 0 || usableH % (fh + spacing) !== 0) return null;
  const cols = usableW / (fw + spacing);
  const rows = usableH / (fh + spacing);
  return cols >= 1 && rows >= 1 ? { cols, rows } : null;
}

export interface MetaValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a sprite meta. `sheetSizes` (file name -> PNG size) enables the checks that need the images:
 * every referenced sheet exists, the frame size tiles it exactly, and frame indices are in range.
 */
export function validateSpriteMeta(meta: unknown, sheetSizes?: Record<string, SheetSize | undefined>): MetaValidation {
  const errors: string[] = [];
  const err = (message: string) => errors.push(message);

  if (!isObject(meta)) return { ok: false, errors: ['sprite meta must be a JSON object'] };
  if (meta.version !== 1) err(`version must be 1 (got ${JSON.stringify(meta.version)})`);
  if (typeof meta.name !== 'string' || meta.name.trim() === '') err('name must be a non-empty string');
  if (!SPRITE_KINDS.includes(meta.kind as SpriteKind)) {
    err(`kind must be one of ${SPRITE_KINDS.join(', ')} (got ${JSON.stringify(meta.kind)})`);
  }
  if (!isInt(meta.frameWidth, 1)) err('frameWidth must be a positive integer');
  if (!isInt(meta.frameHeight, 1)) err('frameHeight must be a positive integer');
  if (!isInt(meta.margin, 0)) err('margin must be an integer >= 0');
  if (!isInt(meta.spacing, 0)) err('spacing must be an integer >= 0');
  for (const key of ['pivotX', 'pivotY'] as const) {
    const v = meta[key];
    if (!isFiniteNum(v) || v < 0 || v > 1) err(`${key} must be a number between 0 and 1`);
  }

  const sheets: string[] = [];
  let framesPerDirection = 0;
  if (meta.kind === 'character') {
    if (meta.sheet !== undefined) err('character assets use "character.sheets", not "sheet"');
    if (meta.animations !== undefined) err('character assets cannot define "animations"');
    const c = meta.character;
    if (!isObject(c)) {
      err('character assets need a "character" object');
    } else {
      const s = c.sheets;
      if (!isObject(s) || !isSafeSheetName(s.walk)) {
        err('character.sheets.walk must be a .png file name');
      } else {
        sheets.push(s.walk);
        if (s.run !== undefined) {
          if (!isSafeSheetName(s.run)) err('character.sheets.run must be a .png file name');
          else sheets.push(s.run);
        }
      }
      if (!isInt(c.framesPerDirection, 1)) err('character.framesPerDirection must be a positive integer');
      else framesPerDirection = c.framesPerDirection;
      if (!isInt(c.idleFrame, 0) || (framesPerDirection > 0 && c.idleFrame >= framesPerDirection)) {
        err('character.idleFrame must be an integer within 0..framesPerDirection-1');
      }
      if (!isFiniteNum(c.walkFps) || c.walkFps <= 0) err('character.walkFps must be > 0');
      if (!isFiniteNum(c.runFps) || c.runFps <= 0) err('character.runFps must be > 0');
    }
  } else if (meta.kind === 'object' || meta.kind === 'animated') {
    if (meta.character !== undefined) err(`${meta.kind} assets cannot define "character"`);
    if (!isSafeSheetName(meta.sheet)) err('sheet must be a .png file name');
    else sheets.push(meta.sheet);
  }

  if (meta.animations !== undefined) {
    if (meta.kind === 'character') {
      // already reported above
    } else if (!isObject(meta.animations)) {
      err('animations must be an object');
    } else {
      for (const [animName, anim] of Object.entries(meta.animations)) {
        if (animName.trim() === '') err('animation names must not be empty');
        if (!isObject(anim)) {
          err(`animation "${animName}" must be an object`);
          continue;
        }
        if (!Array.isArray(anim.frames) || anim.frames.length === 0 || !anim.frames.every((f) => isInt(f, 0))) {
          err(`animation "${animName}": frames must be a non-empty array of integers >= 0`);
        }
        if (!isFiniteNum(anim.fps) || anim.fps <= 0) err(`animation "${animName}": fps must be > 0`);
        if (typeof anim.loop !== 'boolean') err(`animation "${animName}": loop must be a boolean`);
      }
    }
  }

  if (sheetSizes && errors.length === 0) {
    const m = meta as unknown as SpriteAssetMeta;
    let frameCount = Infinity;
    for (const file of sheets) {
      const size = sheetSizes[file];
      if (!size) {
        err(`sheet "${file}" does not exist`);
        continue;
      }
      const grid = sheetGrid(m, size);
      if (!grid) {
        err(
          `frame size ${m.frameWidth}x${m.frameHeight} (margin ${m.margin}, spacing ${m.spacing}) does not tile ` +
            `sheet "${file}" (${size.width}x${size.height}) exactly`
        );
        continue;
      }
      if (m.kind === 'character') {
        if (grid.rows < CHARACTER_ROWS) err(`sheet "${file}" has ${grid.rows} row(s), a character needs ${CHARACTER_ROWS} (down, left, right, up)`);
        if (grid.cols < framesPerDirection) err(`sheet "${file}" has ${grid.cols} column(s) but framesPerDirection is ${framesPerDirection}`);
      } else {
        frameCount = Math.min(frameCount, grid.cols * grid.rows);
      }
    }
    if (m.kind !== 'character' && m.animations && Number.isFinite(frameCount)) {
      for (const [animName, anim] of Object.entries(m.animations)) {
        if (anim.frames.some((f) => f >= frameCount)) err(`animation "${animName}" uses a frame outside the sheet (${frameCount} frames)`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Assert validity (throws one readable error) and return a copy with a canonical key order and no unknown keys. */
export function normalizeSpriteMeta(meta: unknown, sheetSizes?: Record<string, SheetSize | undefined>): SpriteAssetMeta {
  const result = validateSpriteMeta(meta, sheetSizes);
  if (!result.ok) throw new Error(`Invalid sprite: ${result.errors.join('; ')}`);
  const m = meta as SpriteAssetMeta;
  const out: SpriteAssetMeta = {
    version: 1,
    name: m.name.trim(),
    kind: m.kind,
    frameWidth: m.frameWidth,
    frameHeight: m.frameHeight,
    margin: m.margin,
    spacing: m.spacing,
    pivotX: m.pivotX,
    pivotY: m.pivotY,
  };
  if (m.kind === 'character' && m.character) {
    const c = m.character;
    out.character = {
      sheets: { walk: c.sheets.walk, ...(c.sheets.run ? { run: c.sheets.run } : {}) },
      framesPerDirection: c.framesPerDirection,
      idleFrame: c.idleFrame,
      walkFps: c.walkFps,
      runFps: c.runFps,
    };
  } else {
    out.sheet = m.sheet;
    if (m.animations) {
      out.animations = {};
      for (const [animName, a] of Object.entries(m.animations)) {
        out.animations[animName] = { frames: [...a.frames], fps: a.fps, loop: a.loop };
      }
    }
  }
  return out;
}
