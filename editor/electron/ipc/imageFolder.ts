import fs from 'fs';
import path from 'path';

export interface FolderImage {
  sourcePath: string;
  /** Folder the file sits in, relative to the folder's parent and starting with the folder's own name (`Trees/oak`). */
  dir: string;
  /** File name without its extension. */
  defaultName: string;
  /** Which kind of picture it is. */
  ext: 'png' | 'gif';
}

export interface FolderScan {
  files: FolderImage[];
  /** Files that were left out because they are not PNG or GIF images. */
  skipped: number;
  /** Stopped early because the folder held more than `maxFiles` pictures or went deeper than `maxDepth`. */
  truncated: boolean;
}

export const MAX_FOLDER_IMAGES = 5000;
export const MAX_FOLDER_DEPTH = 12;

/**
 * Every PNG and GIF below `root`, nested folders included, in a stable order (by name).
 * Hidden entries and symbolic links are ignored, so a scan can neither leave the folder nor loop.
 */
export function scanImageFolder(root: string, maxFiles = MAX_FOLDER_IMAGES, maxDepth = MAX_FOLDER_DEPTH): FolderScan {
  const result: FolderScan = { files: [], skipped: 0, truncated: false };
  const top = path.basename(root);
  const walk = (dir: string, relative: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth >= maxDepth) result.truncated = true;
        else walk(full, `${relative}/${entry.name}`, depth + 1);
      } else if (entry.isFile()) {
        if (!/\.(png|gif)$/i.test(entry.name)) result.skipped++;
        else if (result.files.length >= maxFiles) result.truncated = true;
        else result.files.push({ sourcePath: full, dir: relative, defaultName: path.parse(entry.name).name, ext: entry.name.toLowerCase().endsWith('.gif') ? 'gif' : 'png' });
      }
    }
  };
  walk(root, top, 0);
  return result;
}
