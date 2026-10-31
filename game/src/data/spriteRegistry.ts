import {
  filesBySheetKey,
  spriteMetaToCharacter,
  validateCharacter,
  validateSpriteMeta,
  type CharacterDef,
  type SpriteAssetMeta,
} from "@shared/engine/index.ts";

/** A loaded character: its v2 definition and the URL of each sheet (by sheet key). */
export interface CharacterEntry {
  id: string;
  def: CharacterDef;
  files: Record<string, string>;
}

export interface SpriteRegistryLoadResult {
  loaded: string[];
  /** Entries that were skipped, with the reason. */
  skipped: { id: string; reason: string }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Runtime lookup of the characters listed in `data/sprites.json` (written by `npm run assets:sync`).
 * Pure data, no Phaser: the Preloader fills it, ECS expansion / state selection / `changeSprite` read it.
 *
 * The manifest may still hold v1 sprite assets (`{ id, meta, files: { "walk.png": url } }`); they are migrated
 * on load (spec §6), so the rest of the game only ever sees v2 characters. v2 entries
 * (`{ id, def, files: { <sheetKey>: url } }`, in `sprites` or `characters`) are used as they are.
 */
export class SpriteRegistry {
  private entries = new Map<string, CharacterEntry>();

  /** Replaces the content with a parsed manifest. Invalid entries are skipped, never thrown on. */
  load(manifest: unknown): SpriteRegistryLoadResult {
    this.entries.clear();
    const result: SpriteRegistryLoadResult = { loaded: [], skipped: [] };
    const list: unknown[] = [];
    if (isRecord(manifest)) {
      for (const key of ["sprites", "characters"]) if (Array.isArray(manifest[key])) list.push(...(manifest[key] as unknown[]));
    }
    for (const raw of list) {
      if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") {
        result.skipped.push({ id: String(isRecord(raw) ? raw.id : raw), reason: "entry has no id" });
        continue;
      }
      const files = isRecord(raw.files) ? (raw.files as Record<string, string>) : {};
      if (raw.def !== undefined) {
        const check = validateCharacter(raw.def);
        if (!check.ok) {
          result.skipped.push({ id: raw.id, reason: check.errors.join("; ") });
          continue;
        }
        this.entries.set(raw.id, { id: raw.id, def: raw.def as CharacterDef, files });
      } else {
        const check = validateSpriteMeta(raw.meta);
        if (!check.ok) {
          result.skipped.push({ id: raw.id, reason: check.errors.join("; ") });
          continue;
        }
        const meta = raw.meta as SpriteAssetMeta;
        this.entries.set(raw.id, { id: raw.id, def: spriteMetaToCharacter(raw.id, meta), files: filesBySheetKey(meta, files) });
      }
      result.loaded.push(raw.id);
    }
    return result;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): CharacterEntry | undefined {
    return this.entries.get(id);
  }

  /** The character definition of an id, undefined for an unknown one. */
  character(id: string): CharacterDef | undefined {
    return this.entries.get(id)?.def;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  all(): CharacterEntry[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }
}

/** The one registry the game uses. */
export const spriteRegistry = new SpriteRegistry();
