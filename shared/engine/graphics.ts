// Graphics library + character manifest (docs/database-and-characters-spec.md §4 and §12).
// A Graphic is an image under project/graphics, identified by its path with the extension
// ("sprites/characters/player/walk.png"). A Character references Graphics by id; the game loads them from
// `graphics/<id>` (the sync copies only the ones some character uses).

import type { SpriteAssetMeta } from './types.ts';
import { validateCharacter, type CharacterDef, type CharacterIssue } from './characters.ts';
import { cloneJson } from './util.ts';

/** URL root (relative to the game's web root) graphics are copied to. */
export const GRAPHICS_URL_ROOT = 'graphics';

const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const FILE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.png$/i;

/** "/"-separated path of letters, digits, "_" and "-" ending in a .png file name. */
export function isValidGraphicId(id: unknown): id is string {
  if (typeof id !== 'string' || id === '') return false;
  const parts = id.split('/');
  const file = parts.pop() as string;
  return FILE.test(file) && parts.every((p) => SEGMENT.test(p));
}

/** Character ids are folders + a name, like sprite ids always were. */
export function isValidCharacterId(id: unknown): id is string {
  return typeof id === 'string' && id !== '' && id.split('/').every((p) => SEGMENT.test(p));
}

export function graphicUrl(graphicId: string): string {
  return `${GRAPHICS_URL_ROOT}/${graphicId}`;
}

/** Distinct graphic ids a character uses, in sheet order. */
export function characterGraphics(def: Pick<CharacterDef, 'sheets'>): string[] {
  return [...new Set(Object.values(def.sheets).map((s) => s.image))];
}

// ── manifest (game/public/data/characters.json) ─────────────────────────────────────────────────

export interface CharacterManifestEntry {
  id: string;
  def: CharacterDef;
  /** Sheet key -> URL relative to the game's web root. */
  files: Record<string, string>;
}

export interface CharacterManifest {
  version: 2;
  characters: CharacterManifestEntry[];
}

/** Deterministic manifest: sorted by id, `files` derived from the sheets. */
export function buildCharacterManifest(characters: readonly { id: string; def: CharacterDef }[]): CharacterManifest {
  const entries = characters
    .map(({ id, def }) => ({
      id,
      def: cloneJson(def),
      files: Object.fromEntries(Object.entries(def.sheets).map(([key, sheet]) => [key, graphicUrl(sheet.image)])),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 2, characters: entries };
}

export interface CharacterSetIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Problems of a set of characters: malformed ids, duplicate ids, invalid definitions (with the known
 * graphics and their sizes). `graphics` maps a graphic id to its pixel size.
 */
export function validateCharacterSet(
  characters: readonly { id: string; def: unknown }[],
  graphics: Record<string, { width: number; height: number }>,
): CharacterSetIssue[] {
  const issues: CharacterSetIssue[] = [];
  const seen = new Set<string>();
  const known = new Set(Object.keys(graphics));
  for (const { id, def } of characters) {
    if (!isValidCharacterId(id)) issues.push({ id, severity: 'error', message: 'id must be a slash-separated path of letters, digits, - and _' });
    if (seen.has(id)) issues.push({ id, severity: 'error', message: 'duplicate character id' });
    seen.add(id);
    const check = validateCharacter(def, { graphics: known, imageSizes: graphics });
    for (const i of check.issues as CharacterIssue[]) issues.push({ id, severity: i.severity, message: i.message });
    const sheets = (def as { sheets?: Record<string, { image?: unknown }> } | null)?.sheets;
    if (sheets && typeof sheets === 'object') {
      for (const [key, sheet] of Object.entries(sheets)) {
        if (sheet && typeof sheet.image === 'string' && !isValidGraphicId(sheet.image)) {
          issues.push({ id, severity: 'error', message: `sheet "${key}": "${sheet.image}" is not a valid graphic id (path of letters, digits, - and _ ending in .png)` });
        }
      }
    }
  }
  return issues;
}

// ── legacy view (the pre-Database editor screens still think in sprite kinds) ───────────────────

const baseName = (graphicId: string): string => graphicId.slice(graphicId.lastIndexOf('/') + 1);

/**
 * A v1-shaped description of a character for the screens that predate characters (map canvas, pickers).
 * Exact for migrated characters; others get the closest picture: a four-facing character with idle/walk
 * clips is a `character`, one with clips an `animated` asset (non-directional frames, or the facing-down
 * frames), one without a `static` `object`. Sheet "files" are the graphics' file names.
 */
export function characterToSpriteMeta(def: CharacterDef): SpriteAssetMeta {
  const sheetKey = Object.keys(def.sheets)[0];
  const firstSheet = def.sheets[def.clips.walk?.sheet ?? def.still?.sheet ?? sheetKey] ?? def.sheets[sheetKey];
  const cut = firstSheet
    ? { frameWidth: firstSheet.frameWidth, frameHeight: firstSheet.frameHeight, margin: firstSheet.margin, spacing: firstSheet.spacing }
    : { frameWidth: 32, frameHeight: 32, margin: 0, spacing: 0 };
  const base = { version: 1 as const, name: def.name, margin: cut.margin, spacing: cut.spacing, frameWidth: cut.frameWidth, frameHeight: cut.frameHeight, pivotX: def.pivot.x, pivotY: def.pivot.y };

  const walk = def.clips.walk;
  if (def.facing === 'four' && walk?.directional && def.sheets[walk.sheet]) {
    const down = walk.byFacing?.down ?? [0];
    const idle = def.clips.idle?.byFacing?.down?.[0] ?? 0;
    const run = def.clips.run && def.sheets[def.clips.run.sheet];
    return {
      ...base,
      kind: 'character',
      character: {
        sheets: { walk: baseName(def.sheets[walk.sheet].image), ...(run ? { run: baseName(run.image) } : {}) },
        framesPerDirection: Math.max(1, down.length),
        idleFrame: Math.max(0, Math.min(idle, Math.max(1, down.length) - 1)),
        walkFps: walk.fps,
        runFps: def.clips.run?.fps ?? walk.fps,
      },
    };
  }

  const animations: Record<string, { frames: number[]; fps: number; loop: boolean }> = {};
  for (const [name, clip] of Object.entries(def.clips)) {
    const frames = clip.directional ? clip.byFacing?.down ?? Object.values(clip.byFacing ?? {})[0] : clip.frames;
    if (frames && frames.length > 0) animations[name] = { frames: [...frames], fps: clip.fps, loop: clip.loop };
  }
  const file = firstSheet ? baseName(firstSheet.image) : 'sheet.png';
  return {
    ...base,
    kind: Object.keys(animations).length > 0 ? 'animated' : 'object',
    sheet: file,
    animations,
  };
}

// ── editor view types ───────────────────────────────────────────────────────────────────────────

/** What the editor knows about one character: its definition and the pictures its sheets use. */
export interface CharacterInfo {
  id: string;
  def: CharacterDef;
  /** data: URLs of the graphics the sheets use, by graphic id. */
  images: Record<string, string>;
}

export interface GraphicInfo {
  id: string;
  width: number;
  height: number;
  bytes: number;
  mtimeMs: number;
}

/** `SpriteAssetInfo`-shaped view (pickers, canvas) of a character. */
export function characterToAssetInfo(info: CharacterInfo): { id: string; meta: SpriteAssetMeta; sheets: Record<string, string> } {
  const sheets: Record<string, string> = {};
  for (const [graphicId, url] of Object.entries(info.images)) sheets[baseName(graphicId)] = url;
  return { id: info.id, meta: characterToSpriteMeta(info.def), sheets };
}
