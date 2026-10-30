import fs from 'fs';
import path from 'path';

interface CacheEntry {
  mtimeMs: number;
  size: number;
  dataUrl: string;
}

/**
 * In-memory cache of tileset PNGs encoded as data URLs, keyed by absolute path and
 * validated against the file's mtime and size so unchanged files are never re-read.
 */
export class TilesetCache {
  private readonly entries = new Map<string, CacheEntry>();
  /** Number of lookups served from the cache (for diagnostics / tests). */
  hits = 0;
  /** Number of lookups that had to read and encode the file. */
  misses = 0;

  get size(): number {
    return this.entries.size;
  }

  getDataUrl(absPath: string): string {
    const stat = fs.statSync(absPath);
    const cached = this.entries.get(absPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      this.hits++;
      return cached.dataUrl;
    }

    this.misses++;
    const dataUrl = `data:image/png;base64,${fs.readFileSync(absPath, 'base64')}`;
    this.entries.set(absPath, { mtimeMs: stat.mtimeMs, size: stat.size, dataUrl });
    return dataUrl;
  }

  /** Forget a single file. */
  invalidate(absPath: string): void {
    this.entries.delete(absPath);
  }

  /** Forget a file and everything below it (for folder rename / delete). */
  invalidateTree(absPath: string): void {
    const prefix = absPath.endsWith(path.sep) ? absPath : absPath + path.sep;
    for (const key of this.entries.keys()) {
      if (key === absPath || key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  /** Drop every entry that is not in `livePaths` (keeps memory bounded after external deletions). */
  retainOnly(livePaths: ReadonlySet<string>): void {
    for (const key of this.entries.keys()) {
      if (!livePaths.has(key)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
