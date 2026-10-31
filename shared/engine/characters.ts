// Characters v2: sheets + clips + animation bindings (docs/database-and-characters-spec.md).
// Pure data and maths shared by the game and the editor: the types, clip resolution (§5.4), dynamic
// speed (§5.5), frame helpers, the animation-registration plan and validation (§5.7). No React, no Phaser.
//
// Naming contract (kept for migrated v1 data, §6):
//   texture              sprite:<id>:<sheetKey>
//   directional clip     sprite:<id>:<clip>-<facing>      (one per facing that has its own frames)
//   non-directional clip sprite:<id>:<clip>
// A mirrored facing plays the source facing's animation with flipX.

import type { Facing } from './types.ts';
import { FACINGS, isFacing } from './constants.ts';
import { sheetGrid, spriteTextureKey, type AnimationRegistration, type FrameRect } from './sprites.ts';
import { unmetProfileRequirements } from './profiles.ts';
import { isRecord } from './util.ts';

// ── types ───────────────────────────────────────────────────────────────────────────────────────

export type FacingMode = 'none' | 'four';

/** 0..1 inside a frame; (0.5, 1) = bottom-centre. */
export interface PivotDef {
  x: number;
  y: number;
}

export interface SheetDef {
  /** Graphic id: path under project/graphics, e.g. "sprites/player/walk.png". */
  image: string;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
  /** Overrides CharacterDef.pivot for clips on this sheet. */
  pivot?: PivotDef;
}

export type PlaybackMode = 'forward' | 'reverse' | 'pingpong';

export interface ClipDef {
  /** Key in CharacterDef.sheets. */
  sheet: string;
  /** Authored base speed, > 0. */
  fps: number;
  loop: boolean;
  mode?: PlaybackMode;
  /** false: `frames` serves every facing. true: `byFacing` does (requires CharacterDef.facing === 'four'). */
  directional: boolean;
  frames?: number[];
  byFacing?: Partial<Record<Facing, number[]>>;
  /** A facing that reuses another facing's frames drawn flipped: { left: 'right' }. */
  mirror?: Partial<Record<Facing, Facing>>;
  /** effective fps = fps × clamp(speed / reference, 0.25, 4); null/absent = fixed fps. */
  followSpeed?: { reference: number } | null;
}

export interface CharacterDef {
  version: 2;
  name: string;
  tags: string[];
  profile?: string;
  facing: FacingMode;
  pivot: PivotDef;
  sheets: Record<string, SheetDef>;
  clips: Record<string, ClipDef>;
  /** "idle" | "walk" | "run" | "<mode>.<activity>" -> clip name. */
  bindings: Record<string, string>;
  /** Static frame shown when no clip plays. */
  still?: { sheet: string; frame: number };
}

export type Activity = 'idle' | 'walk' | 'run';
export const ACTIVITIES: readonly Activity[] = ['idle', 'walk', 'run'];
export const DEFAULT_MODE = 'normal';

/** Bounds of the `followSpeed` factor. */
export const FOLLOW_SPEED_MIN = 0.25;
export const FOLLOW_SPEED_MAX = 4;

export const FACING_MODES: readonly FacingMode[] = ['none', 'four'];
export const PLAYBACK_MODES: readonly PlaybackMode[] = ['forward', 'reverse', 'pingpong'];

export function isActivity(v: unknown): v is Activity {
  return v === 'idle' || v === 'walk' || v === 'run';
}

const own = <T>(record: Record<string, T> | undefined, key: string): T | undefined =>
  record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;

// ── clip resolution (§5.4) ──────────────────────────────────────────────────────────────────────

/** Binding keys tried for `activity`, best first. `mode` 'normal' adds no mode-qualified keys. */
export function bindingCandidates(mode: string, activity: Activity): string[] {
  const m = mode && mode !== DEFAULT_MODE ? `${mode}.` : '';
  const order: Record<Activity, Activity[]> = { run: ['run', 'walk', 'idle'], walk: ['walk', 'idle'], idle: ['idle'] };
  const plain = order[activity];
  return m ? [...plain.map((a) => `${m}${a}`), ...plain] : [...plain];
}

/**
 * The clip that plays for a mode + activity: the first candidate (see `bindingCandidates`) whose binding
 * exists and points at an existing clip; null when nothing resolves (the character shows its `still`).
 */
export function resolveClip(def: Pick<CharacterDef, 'bindings' | 'clips'>, mode: string, activity: Activity): string | null {
  for (const key of bindingCandidates(mode, activity)) {
    const clip = own(def.bindings, key);
    if (clip !== undefined && Object.hasOwn(def.clips, clip)) return clip;
  }
  return null;
}

// ── dynamic speed (§5.5) ────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Frames per second a clip really plays at: authored fps × the follow-speed factor (movement speed
 * against the clip's reference) × `animSpeed`. The game and the editor preview both use this.
 */
export function effectiveFps(clip: Pick<ClipDef, 'fps' | 'followSpeed'>, entitySpeed: number, animSpeed: number): number {
  const follow = clip.followSpeed
    ? clamp(Number.isFinite(entitySpeed) ? entitySpeed / clip.followSpeed.reference : 1, FOLLOW_SPEED_MIN, FOLLOW_SPEED_MAX)
    : 1;
  const speed = Number.isFinite(animSpeed) ? Math.max(0, animSpeed) : 1;
  return clip.fps * follow * speed;
}

/** `effectiveFps / authored fps`: what the render bridge sets as `anims.timeScale`. */
export function clipTimeScale(clip: Pick<ClipDef, 'fps' | 'followSpeed'>, entitySpeed: number, animSpeed: number): number {
  return clip.fps > 0 ? effectiveFps(clip, entitySpeed, animSpeed) / clip.fps : 1;
}

// ── frames of a clip ────────────────────────────────────────────────────────────────────────────

export interface ClipFrames {
  frames: number[];
  /** The facing's frames are the source facing's, drawn flipped. */
  flipX: boolean;
  /** Facing whose own frames are used (the requested one unless mirrored; null for non-directional clips). */
  source: Facing | null;
}

/**
 * Frames a clip shows when the character faces `facing`, following `mirror` (an odd number of hops flips).
 * null when the clip has nothing for that facing (invalid data) or the mirrors loop.
 */
export function clipFrames(clip: ClipDef, facing: Facing): ClipFrames | null {
  if (!clip.directional) {
    return clip.frames && clip.frames.length > 0 ? { frames: [...clip.frames], flipX: false, source: null } : null;
  }
  let at: Facing = facing;
  let flipX = false;
  const seen = new Set<Facing>();
  while (clip.mirror?.[at] && !seen.has(at)) {
    seen.add(at);
    at = clip.mirror[at] as Facing;
    flipX = !flipX;
  }
  const frames = clip.byFacing?.[at];
  if (seen.has(at) || !frames || frames.length === 0) return null;
  return { frames: [...frames], flipX, source: at };
}

/** Facings that get an animation registered of their own (not mirrored, with frames). [null] = non-directional. */
export function clipOwnFacings(clip: ClipDef): (Facing | null)[] {
  if (!clip.directional) return [null];
  return FACINGS.filter((f) => !clip.mirror?.[f] && (clip.byFacing?.[f]?.length ?? 0) > 0);
}

export function clipAnimKey(characterId: string, clip: string, facing: Facing | null): string {
  return facing === null ? `sprite:${characterId}:${clip}` : `sprite:${characterId}:${clip}-${facing}`;
}

export interface ClipPlayback {
  /** Phaser animation key to play. */
  key: string;
  flipX: boolean;
  clip: ClipDef;
}

/** Which animation key (and flip) shows `clipName` for `facing`; null when the clip cannot show it. */
export function clipPlayback(characterId: string, def: Pick<CharacterDef, 'clips'>, clipName: string, facing: Facing): ClipPlayback | null {
  const clip = own(def.clips, clipName);
  if (!clip) return null;
  const f = clipFrames(clip, facing);
  if (!f) return null;
  return { key: clipAnimKey(characterId, clipName, f.source), flipX: f.flipX, clip };
}

/** Frame index (into the clip's sheet) after `tick` ms at `fps`; honours loop and playback mode. */
export function clipFrameAt(clip: Pick<ClipDef, 'fps' | 'loop' | 'mode'>, frames: readonly number[], tick: number, fps: number = clip.fps): number {
  if (frames.length === 0) return 0;
  const step = Math.floor((Math.max(0, tick) * Math.max(0, fps)) / 1000);
  const n = frames.length;
  const mode = clip.mode ?? 'forward';
  let i: number;
  if (mode === 'pingpong' && n > 1) {
    const period = 2 * (n - 1);
    const p = clip.loop ? step % period : Math.min(step, period);
    i = p < n ? p : period - p;
  } else {
    const s = clip.loop ? step % n : Math.min(step, n - 1);
    i = mode === 'reverse' ? n - 1 - s : s;
  }
  return frames[i];
}

// ── sheets ──────────────────────────────────────────────────────────────────────────────────────

/** Frames a sheet holds in an image of the given size. */
export function sheetFrameGrid(sheet: SheetDef, imageW: number, imageH: number): { columns: number; rows: number; count: number } {
  return sheetGrid(sheet, imageW, imageH);
}

/** Pixel rectangle of a frame inside the sheet's image (frames are numbered left→right, top→bottom). */
export function sheetFrameRect(sheet: SheetDef, frameIndex: number, imageW: number): FrameRect {
  const columns = Math.max(1, sheetGrid(sheet, imageW, sheet.frameHeight).columns);
  const index = Math.max(0, Math.trunc(frameIndex));
  return {
    x: sheet.margin + (index % columns) * (sheet.frameWidth + sheet.spacing),
    y: sheet.margin + Math.floor(index / columns) * (sheet.frameHeight + sheet.spacing),
    w: sheet.frameWidth,
    h: sheet.frameHeight,
  };
}

/** Pivot that applies to a sheet: its own override, else the character's. */
export function sheetPivot(def: Pick<CharacterDef, 'pivot' | 'sheets'>, sheetKey: string): PivotDef {
  return own(def.sheets, sheetKey)?.pivot ?? def.pivot;
}

/**
 * Sheet a character shows when no clip plays: `still`, else the first clip's sheet, else the first sheet.
 * undefined only for a character without sheets.
 */
export function staticSheetKey(def: Pick<CharacterDef, 'still' | 'clips' | 'sheets'>): string | undefined {
  if (def.still && Object.hasOwn(def.sheets, def.still.sheet)) return def.still.sheet;
  for (const clip of Object.values(def.clips)) if (Object.hasOwn(def.sheets, clip.sheet)) return clip.sheet;
  return Object.keys(def.sheets)[0];
}

export function characterTextureKey(characterId: string, sheetKey: string): string {
  return spriteTextureKey(characterId, sheetKey);
}

// ── animation registration (what the game creates) ──────────────────────────────────────────────

/** Frames as registered: `reverse` clips are stored reversed (ping-pong is `yoyo`). */
function registeredFrames(clip: ClipDef, frames: number[]): number[] {
  return clip.mode === 'reverse' ? [...frames].reverse() : frames;
}

/**
 * Every Phaser animation the game must register for a character: one per facing that has frames of its
 * own for a directional clip (mirrored facings reuse the source's), one for a non-directional clip.
 * Registered once at the AUTHORED fps; speed changes go through `anims.timeScale`.
 */
export function buildClipRegistrations(characterId: string, def: Pick<CharacterDef, 'clips' | 'sheets'>): AnimationRegistration[] {
  const out: AnimationRegistration[] = [];
  for (const [name, clip] of Object.entries(def.clips)) {
    if (!Object.hasOwn(def.sheets, clip.sheet)) continue;
    for (const facing of clipOwnFacings(clip)) {
      const frames = facing === null ? clip.frames : clip.byFacing?.[facing];
      if (!frames || frames.length === 0) continue;
      const reg: AnimationRegistration = {
        key: clipAnimKey(characterId, name, facing),
        textureKey: spriteTextureKey(characterId, clip.sheet),
        frames: registeredFrames(clip, [...frames]),
        fps: clip.fps,
        loop: clip.loop,
      };
      if (clip.mode === 'pingpong') reg.yoyo = true;
      out.push(reg);
    }
  }
  return out;
}

// ── validation (§5.7) ───────────────────────────────────────────────────────────────────────────

export type CharacterIssueSeverity = 'error' | 'warning' | 'info';

export interface CharacterIssue {
  severity: CharacterIssueSeverity;
  code: string;
  /** `<what> — <why it matters> — <how to fix>` (spec Appendix C). */
  message: string;
  /** Where: "sheets.walk", "clips.walk.byFacing.left", "bindings.run", … (for focus links). */
  path: string;
}

export interface CharacterCheck {
  ok: boolean;
  issues: CharacterIssue[];
  errors: string[];
  warnings: string[];
}

export interface CharacterValidationContext {
  /** Known Graphic ids. When given, a sheet whose image is not in it is an error. */
  graphics?: ReadonlySet<string> | ((id: string) => boolean);
  /** Pixel size of Graphics by id; enables the "does not divide" and "beyond the sheet" warnings. */
  imageSizes?: Record<string, { width: number; height: number }>;
  /** Clip names used elsewhere (entities, events). When given, clips used nowhere get an info note. */
  referencedClips?: ReadonlySet<string>;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isFrameList = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every((f) => isInt(f) && f >= 0);
const BINDING_KEY = /^([a-z0-9_-]+\.)?(idle|walk|run)$/i;
const KEY_SHAPE = /^[a-zA-Z0-9_-]+$/;

/** Checks a parsed character record. Never throws; accepts untrusted input. */
export function validateCharacter(input: unknown, ctx: CharacterValidationContext = {}): CharacterCheck {
  const issues: CharacterIssue[] = [];
  const add = (severity: CharacterIssueSeverity, code: string, path: string, message: string): void => {
    issues.push({ severity, code, path, message });
  };
  const done = (): CharacterCheck => ({
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    errors: issues.filter((i) => i.severity === 'error').map((i) => i.message),
    warnings: issues.filter((i) => i.severity === 'warning').map((i) => i.message),
  });

  if (!isRecord(input)) {
    add('error', 'bad-character', '', 'The character file must be an object — it cannot be read — recreate it from the Database page');
    return done();
  }
  const c = input;

  if (c.version !== 2) add('error', 'bad-version', 'version', `Character version must be 2 (got ${JSON.stringify(c.version)}) — the game would skip it — migrate it first`);
  if (typeof c.name !== 'string' || c.name.trim() === '') add('error', 'empty-name', 'name', 'The character has no name — lists and pickers would show nothing — give it a name');
  if (!Array.isArray(c.tags) || c.tags.some((t) => typeof t !== 'string')) add('error', 'bad-tags', 'tags', 'Tags must be a list of text labels — the editor could not filter by them — fix or clear the tags');
  const facingOk = c.facing === 'none' || c.facing === 'four';
  if (!facingOk) add('error', 'bad-facing', 'facing', `Facing must be "none" or "four" (got ${JSON.stringify(c.facing)}) — directional animations need to know — choose one of the two`);

  const pivotOk = (p: unknown): boolean => isRecord(p) && isNum(p.x) && isNum(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  if (!pivotOk(c.pivot)) add('error', 'bad-pivot', 'pivot', 'Pivot x and y must be numbers from 0 to 1 — the graphic would stand on the wrong spot — use e.g. 0.5, 1 for bottom-centre');

  // sheets
  const sheets = isRecord(c.sheets) ? c.sheets : {};
  if (!isRecord(c.sheets)) add('error', 'bad-sheets', 'sheets', 'Sheets must be an object — there are no pictures to cut frames from — add a sheet');
  const sheetCounts = new Map<string, number>(); // sheet key -> frame count when the image size is known
  for (const [key, raw] of Object.entries(sheets)) {
    const path = `sheets.${key}`;
    if (!KEY_SHAPE.test(key)) add('warning', 'odd-key', path, `Sheet name "${key}" has unusual characters — it becomes part of a texture key — use letters, digits, dashes and underscores`);
    if (!isRecord(raw)) {
      add('error', 'bad-sheet', path, `Sheet "${key}" must be an object — it cannot be cut into frames — recreate the sheet`);
      continue;
    }
    if (typeof raw.image !== 'string' || raw.image === '') {
      add('error', 'missing-image', `${path}.image`, `Sheet "${key}" has no image — nothing could be drawn — pick a graphic for it`);
    } else if (ctx.graphics && !(typeof ctx.graphics === 'function' ? ctx.graphics(raw.image) : ctx.graphics.has(raw.image))) {
      add('error', 'unknown-graphic', `${path}.image`, `Sheet "${key}" uses "${raw.image}", which is not in the graphics library — it would draw nothing — pick an existing graphic or import it`);
    }
    for (const k of ['frameWidth', 'frameHeight'] as const) {
      if (!isInt(raw[k]) || (raw[k] as number) < 1) add('error', 'bad-frame-size', `${path}.${k}`, `Sheet "${key}": ${k} must be a whole number of at least 1 — frames cannot be cut — fix the size`);
    }
    for (const k of ['margin', 'spacing'] as const) {
      if (!isInt(raw[k]) || (raw[k] as number) < 0) add('error', 'bad-frame-gap', `${path}.${k}`, `Sheet "${key}": ${k} must be a whole number, 0 or more — frames would be cut at the wrong place — fix the value`);
    }
    if (raw.pivot !== undefined && !pivotOk(raw.pivot)) add('error', 'bad-pivot', `${path}.pivot`, `Sheet "${key}": pivot x and y must be numbers from 0 to 1 — fix the override or remove it`);

    const size = typeof raw.image === 'string' ? ctx.imageSizes?.[raw.image] : undefined;
    if (size && isInt(raw.frameWidth) && isInt(raw.frameHeight) && isInt(raw.margin) && isInt(raw.spacing) && raw.frameWidth >= 1 && raw.frameHeight >= 1 && raw.margin >= 0 && raw.spacing >= 0) {
      const sheet = raw as unknown as SheetDef;
      const grid = sheetGrid(sheet, size.width, size.height);
      sheetCounts.set(key, grid.count);
      const fits = (total: number, frame: number): boolean => (total - 2 * sheet.margin + sheet.spacing) % (frame + sheet.spacing) === 0;
      if (!fits(size.width, sheet.frameWidth)) add('warning', 'width-not-divisible', path, `"${raw.image}" is ${size.width}px wide, which does not divide into ${grid.columns} columns of ${sheet.frameWidth}px — the last pixels are ignored — check the frame width`);
      if (!fits(size.height, sheet.frameHeight)) add('warning', 'height-not-divisible', path, `"${raw.image}" is ${size.height}px high, which does not divide into ${grid.rows} rows of ${sheet.frameHeight}px — the last pixels are ignored — check the frame height`);
    }
  }

  // clips
  const clips = isRecord(c.clips) ? c.clips : {};
  if (!isRecord(c.clips)) add('error', 'bad-clips', 'clips', 'Clips must be an object — the character has no animations — add one or use {}');
  const directionalOk = c.facing === 'four';
  for (const [name, raw] of Object.entries(clips)) {
    const path = `clips.${name}`;
    if (!KEY_SHAPE.test(name)) add('warning', 'odd-key', path, `Animation name "${name}" has unusual characters — events refer to it by name — use letters, digits, dashes and underscores`);
    if (!isRecord(raw)) {
      add('error', 'bad-clip', path, `Animation "${name}" must be an object — it cannot play — recreate it`);
      continue;
    }
    if (typeof raw.sheet !== 'string' || !Object.hasOwn(sheets, raw.sheet)) {
      add('error', 'missing-sheet', `${path}.sheet`, `Animation "${name}" uses sheet ${JSON.stringify(raw.sheet)}, which does not exist — it has no frames to show — pick one of the character's sheets`);
    }
    if (!isNum(raw.fps) || raw.fps <= 0) add('error', 'bad-fps', `${path}.fps`, `Animation "${name}": fps must be greater than 0 — it would never advance — set e.g. 8`);
    if (typeof raw.loop !== 'boolean') add('error', 'bad-loop', `${path}.loop`, `Animation "${name}": loop must be on or off — the game cannot tell if it repeats — choose one`);
    if (raw.mode !== undefined && !PLAYBACK_MODES.includes(raw.mode as PlaybackMode)) add('error', 'bad-mode', `${path}.mode`, `Animation "${name}": playback must be forward, reverse or pingpong — fix the value`);
    if (raw.followSpeed !== undefined && raw.followSpeed !== null && (!isRecord(raw.followSpeed) || !isNum(raw.followSpeed.reference) || raw.followSpeed.reference <= 0)) {
      add('error', 'bad-follow-speed', `${path}.followSpeed`, `Animation "${name}": the reference speed must be greater than 0 — speed changes could not scale it — set a speed in px/s or turn follow speed off`);
    }
    if (typeof raw.directional !== 'boolean') {
      add('error', 'bad-directional', `${path}.directional`, `Animation "${name}": directional must be on or off — the game cannot choose frames — choose one`);
      continue;
    }

    const count = typeof raw.sheet === 'string' ? sheetCounts.get(raw.sheet) : undefined;
    const checkFrames = (frames: unknown, where: string, label: string): void => {
      if (!isFrameList(frames)) {
        add('error', 'bad-frames', where, `Animation "${name}" has ${label} that are empty or not whole numbers from 0 — it would show nothing — pick at least one frame`);
        return;
      }
      if (count !== undefined) {
        const bad = Math.max(...frames);
        if (bad >= count) add('warning', 'frame-beyond-sheet', where, `Animation "${name}" uses frame ${bad} but "${String(raw.sheet)}" has ${count} frames — that frame draws blank — pick a frame inside the sheet or fix the columns and rows`);
      }
    };

    const clip = raw as unknown as ClipDef;
    if (!raw.directional) {
      checkFrames(raw.frames, `${path}.frames`, 'frames');
    } else {
      if (!directionalOk) {
        add('error', 'directional-without-facing', `${path}.directional`, `Animation "${name}" is directional but the character has no facing — there is no direction to pick frames by — set Facing to Four directions or turn Directional off`);
      }
      const byFacing = isRecord(raw.byFacing) ? raw.byFacing : {};
      const mirror = isRecord(raw.mirror) ? raw.mirror : {};
      for (const k of Object.keys(byFacing)) if (!isFacing(k)) add('error', 'bad-facing-key', `${path}.byFacing.${k}`, `Animation "${name}" has frames for "${k}", which is not a direction — they are never used — remove them`);
      for (const [k, v] of Object.entries(mirror)) {
        if (!isFacing(k) || !isFacing(v)) add('error', 'bad-mirror', `${path}.mirror.${k}`, `Animation "${name}": mirror must map a direction to a direction — fix or remove it`);
      }
      for (const f of FACINGS) {
        const hasFrames = byFacing[f] !== undefined;
        const mirrored = isFacing(mirror[f]);
        if (!hasFrames && !mirrored) {
          add('error', 'missing-facing', `${path}.byFacing.${f}`, `Animation "${name}" has no frames for → ${f}. It would show nothing when facing ${f} — pick frames, or set it to mirror another direction`);
        } else if (hasFrames && mirrored) {
          add('warning', 'frames-and-mirror', `${path}.byFacing.${f}`, `Animation "${name}" has frames for ${f} and also mirrors it — the mirror wins and the frames are ignored — remove one of them`);
        }
        if (hasFrames) checkFrames(byFacing[f], `${path}.byFacing.${f}`, `${f} frames`);
        if (mirrored) {
          const resolved = clipFrames(clip, f);
          if (!resolved) add('error', 'bad-mirror', `${path}.mirror.${f}`, `Animation "${name}": ${f} mirrors ${String(mirror[f])}, which has no frames or loops back — it would show nothing — mirror a direction that has frames`);
        }
      }
    }
  }

  // two clips that would register the same Phaser animation (e.g. directional "idle" down vs a clip "idle-down")
  const seenKeys = new Map<string, string>();
  for (const [name, raw] of Object.entries(clips)) {
    if (!isRecord(raw) || typeof raw.directional !== 'boolean') continue;
    const facings = !raw.directional ? [null] : FACINGS.filter((f) => isRecord(raw.byFacing) && raw.byFacing[f] !== undefined && !(isRecord(raw.mirror) && isFacing(raw.mirror[f])));
    for (const f of facings) {
      const key = clipAnimKey('', name, f);
      const other = seenKeys.get(key);
      if (other !== undefined && other !== name) add('error', 'duplicate-key', `clips.${name}`, `Animations "${other}" and "${name}" would both be registered as "${key}" — one would replace the other — rename one of them`);
      else seenKeys.set(key, name);
    }
  }

  // bindings
  const bindings = isRecord(c.bindings) ? c.bindings : {};
  if (!isRecord(c.bindings)) add('error', 'bad-bindings', 'bindings', 'Bindings must be an object — the game cannot choose animations — use {} for none');
  for (const [key, clip] of Object.entries(bindings)) {
    const path = `bindings.${key}`;
    if (typeof clip !== 'string' || !Object.hasOwn(clips, clip)) {
      add('error', 'binding-missing-clip', path, `Binding "${key}" points at animation ${JSON.stringify(clip)}, which does not exist — nothing would play for it — pick an existing animation or remove the binding`);
    }
    if (!BINDING_KEY.test(key)) add('warning', 'odd-binding', path, `Binding "${key}" is not idle, walk, run or <mode>.<activity> — it is never used — rename or remove it`);
  }
  if (typeof bindings.walk === 'string' && bindings.idle === undefined) {
    add('warning', 'walk-without-idle', 'bindings.walk', 'Walk is bound but Idle is not — a standing character would play its walk cycle — bind an idle animation');
  }

  // still
  if (c.still !== undefined) {
    const s = c.still;
    if (!isRecord(s) || typeof s.sheet !== 'string' || !Object.hasOwn(sheets, s.sheet)) {
      add('error', 'bad-still', 'still', 'The still frame uses a sheet that does not exist — nothing would show when no animation plays — pick one of the sheets');
    } else if (!isInt(s.frame) || s.frame < 0) {
      add('error', 'bad-still', 'still.frame', 'The still frame must be a whole number, 0 or more — it would draw nothing — fix the frame');
    } else {
      const count = sheetCounts.get(s.sheet);
      if (count !== undefined && s.frame >= count) add('warning', 'frame-beyond-sheet', 'still.frame', `The still frame ${s.frame} is beyond the ${count} frames of "${s.sheet}" — it draws blank — pick a frame inside the sheet`);
    }
  }

  // profile
  if (c.profile !== undefined) {
    if (typeof c.profile !== 'string') add('error', 'bad-profile', 'profile', 'Profile must be text — fix or remove it');
    else if (!issues.some((i) => i.severity === 'error')) {
      const unmet = unmetProfileRequirements(c as unknown as CharacterDef, c.profile);
      if (unmet.length > 0) add('warning', 'profile-unmet', 'profile', `The character claims profile "${c.profile}" but ${unmet.join('; ')} — it cannot be swapped in safely — fix these or set the profile to Custom`);
    }
  }

  // unused clips (informational, needs outside knowledge)
  if (ctx.referencedClips) {
    const bound = new Set(Object.values(bindings).filter((v): v is string => typeof v === 'string'));
    for (const name of Object.keys(clips)) {
      if (!bound.has(name) && !ctx.referencedClips.has(name)) add('info', 'unused-clip', `clips.${name}`, `Animation "${name}" is not used anywhere — it can be removed — or play it from an event`);
    }
  }

  return done();
}
