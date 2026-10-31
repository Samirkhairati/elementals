import {
  validateSpriteMeta,
  type SpriteAssetMeta,
  type SpriteManifestEntry,
} from "@shared/engine/index.ts";

export interface SpriteRegistryLoadResult {
  loaded: string[];
  /** Entries that were skipped, with the reason. */
  skipped: { id: string; reason: string }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Runtime lookup of the sprite assets listed in `data/sprites.json` (written by `npm run assets:sync`).
 * Pure data, no Phaser: the Preloader fills it, ECS expansion / state selection / `changeSprite` read it.
 */
export class SpriteRegistry {
  private entries = new Map<string, SpriteManifestEntry>();

  /** Replaces the content with a parsed `sprites.json`. Invalid entries are skipped, never thrown on. */
  load(manifest: unknown): SpriteRegistryLoadResult {
    this.entries.clear();
    const result: SpriteRegistryLoadResult = { loaded: [], skipped: [] };
    const list = isRecord(manifest) && Array.isArray(manifest.sprites) ? manifest.sprites : [];
    for (const raw of list) {
      if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") {
        result.skipped.push({ id: String(isRecord(raw) ? raw.id : raw), reason: "entry has no id" });
        continue;
      }
      const check = validateSpriteMeta(raw.meta);
      if (!check.ok) {
        result.skipped.push({ id: raw.id, reason: check.errors.join("; ") });
        continue;
      }
      const files = isRecord(raw.files) ? (raw.files as Record<string, string>) : {};
      this.entries.set(raw.id, { id: raw.id, meta: raw.meta as SpriteAssetMeta, files });
      result.loaded.push(raw.id);
    }
    return result;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): SpriteManifestEntry | undefined {
    return this.entries.get(id);
  }

  meta(id: string): SpriteAssetMeta | undefined {
    return this.entries.get(id)?.meta;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  all(): SpriteManifestEntry[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }
}

/** The one registry the game uses. */
export const spriteRegistry = new SpriteRegistry();
