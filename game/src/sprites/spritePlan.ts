import {
  buildAnimationRegistrations,
  spriteSheetRoles,
  spriteTextureKey,
  type AnimationRegistration,
  type SpriteManifestEntry,
} from "@shared/engine/index.ts";

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
  /** Assets whose sheet file has no URL in the manifest (skipped, reported). */
  problems: string[];
}

/**
 * Pure planning step of manifest-driven sprite loading: which textures to load (key = `sprite:<id>:<role>`,
 * role `walk`/`run` for characters and `sheet` otherwise) and which animations to create afterwards.
 * Animations whose texture could not be planned are left out.
 */
export function planSpriteLoads(entries: readonly SpriteManifestEntry[]): SpriteLoadPlan {
  const sheets: SheetLoad[] = [];
  const animations: AnimationRegistration[] = [];
  const problems: string[] = [];

  for (const entry of entries) {
    const { id, meta, files } = entry;
    const available = new Set<string>();
    for (const { role, file } of spriteSheetRoles(meta)) {
      const url = files[file];
      if (!url) {
        problems.push(`sprite "${id}": no URL for sheet "${file}" (${role})`);
        continue;
      }
      const textureKey = spriteTextureKey(id, role);
      available.add(textureKey);
      sheets.push({
        textureKey,
        url,
        frameWidth: meta.frameWidth,
        frameHeight: meta.frameHeight,
        margin: meta.margin,
        spacing: meta.spacing,
      });
    }
    for (const anim of buildAnimationRegistrations(id, meta)) {
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
    });
    created.push(a.key);
  }
  return created;
}
