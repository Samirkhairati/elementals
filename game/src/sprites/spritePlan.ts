import { buildClipRegistrations, spriteTextureKey, type AnimationRegistration } from "@shared/engine/index.ts";
import type { CharacterEntry } from "@/data/spriteRegistry";

/** One spritesheet texture to load. */
export interface SheetLoad {
  textureKey: string;
  /** URL relative to the web root. */
  url: string;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
}

export interface SpriteLoadPlan {
  sheets: SheetLoad[];
  animations: AnimationRegistration[];
  /** Characters whose sheet has no URL in the manifest (skipped, reported). */
  problems: string[];
}

/**
 * Pure planning step of manifest-driven sprite loading: which textures to load (one per sheet of every
 * character, each with its own frame size; key = `sprite:<id>:<sheetKey>`) and which animations to create
 * afterwards (one per clip, and per facing for directional clips). Animations whose texture could not be
 * planned are left out.
 */
export function planSpriteLoads(entries: readonly CharacterEntry[]): SpriteLoadPlan {
  const sheets: SheetLoad[] = [];
  const animations: AnimationRegistration[] = [];
  const problems: string[] = [];

  for (const entry of entries) {
    const { id, def, files } = entry;
    const available = new Set<string>();
    for (const [key, sheet] of Object.entries(def.sheets)) {
      const url = files[key];
      if (!url) {
        problems.push(`sprite "${id}": no URL for sheet "${key}" (${sheet.image})`);
        continue;
      }
      const textureKey = spriteTextureKey(id, key);
      available.add(textureKey);
      sheets.push({
        textureKey,
        url,
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        margin: sheet.margin,
        spacing: sheet.spacing,
      });
    }
    for (const anim of buildClipRegistrations(id, def)) {
      if (available.has(anim.textureKey)) animations.push(anim);
    }
  }

  return { sheets, animations, problems };
}

/** The minimal Phaser animation manager surface used when creating animations (lets tests fake it). */
export interface AnimationFactory {
  exists(key: string): boolean;
  create(config: {
    key: string;
    frames: { key: string; frame: number }[];
    frameRate: number;
    repeat: number;
    yoyo?: boolean;
  }): unknown;
}

/** Creates every planned animation that does not exist yet. Returns the keys that were created. */
export function createPlannedAnimations(anims: AnimationFactory, planned: readonly AnimationRegistration[]): string[] {
  const created: string[] = [];
  for (const a of planned) {
    if (anims.exists(a.key)) continue;
    anims.create({
      key: a.key,
      frames: a.frames.map((frame) => ({ key: a.textureKey, frame })),
      frameRate: a.fps,
      repeat: a.loop ? -1 : 0,
      ...(a.yoyo ? { yoyo: true } : {}),
    });
    created.push(a.key);
  }
  return created;
}
