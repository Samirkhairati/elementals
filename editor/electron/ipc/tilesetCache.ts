import fs from 'fs';
import path from 'path';
import { deflateSync } from 'zlib';
import { gifSheetFile, type GifSheetFile } from './gifSheet.js';

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

  /** The sheets of GIF files (frames laid out in a grid, see gifSheet.ts), by path, with the same freshness check. */
  private readonly gifs = new Map<string, { mtimeMs: number; size: number; sheet: GifSheetFile }>();

  /**
   * What the file looks like as a picture: a PNG as it is; a GIF as the PNG sheet of its frames (so the editor cuts it
   * like any other sheet). Throws for a GIF that cannot be decoded.
   */
  getDataUrl(absPath: string): string {
    const stat = fs.statSync(absPath);
    const cached = this.entries.get(absPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      this.hits++;
      return cached.dataUrl;
    }

    this.misses++;
    const bytes = /\.gif$/i.test(absPath) ? Buffer.from(this.getGifSheet(absPath).png) : fs.readFileSync(absPath);
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    this.entries.set(absPath, { mtimeMs: stat.mtimeMs, size: stat.size, dataUrl });
    return dataUrl;
  }

  /** Decodes a GIF file once per change. */
  getGifSheet(absPath: string): GifSheetFile {
    const stat = fs.statSync(absPath);
    const cached = this.gifs.get(absPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.sheet;
    const sheet = gifSheetFile(fs.readFileSync(absPath), (data) => deflateSync(data));
    this.gifs.set(absPath, { mtimeMs: stat.mtimeMs, size: stat.size, sheet });
    return sheet;
  }

  /** Forget a single file. */
  invalidate(absPath: string): void {
    this.entries.delete(absPath);
    this.gifs.delete(absPath);
  }

  /** Forget a file and everything below it (for folder rename / delete). */
  invalidateTree(absPath: string): void {
    const prefix = absPath.endsWith(path.sep) ? absPath : absPath + path.sep;
    for (const key of this.entries.keys()) {
      if (key === absPath || key.startsWith(prefix)) this.entries.delete(key);
    }
    for (const key of this.gifs.keys()) {
      if (key === absPath || key.startsWith(prefix)) this.gifs.delete(key);
    }
  }

  /** Drop every entry that is not in `livePaths` (keeps memory bounded after external deletions). */
  retainOnly(livePaths: ReadonlySet<string>): void {
    for (const key of this.entries.keys()) {
      if (!livePaths.has(key)) this.entries.delete(key);
    }
    for (const key of this.gifs.keys()) {
      if (!livePaths.has(key)) this.gifs.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.gifs.clear();
  }
}
