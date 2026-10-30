import fs from 'fs';
import path from 'path';
import { errorMessage } from './result.js';
import { assertSafeFolderName, isWithin, resolveInside, resolveStrictlyInside } from './pathSafety.js';

/** Non-fatal problem found while listing a directory tree. `file` is relative to the base dir. */
export interface ListWarning {
  file: string;
  error: string;
}

export interface WalkedFile {
  /** Entry name, e.g. `town.json`. */
  name: string;
  fullPath: string;
  /** Folder relative to the base dir, or null for the root. */
  folderPath: string | null;
}

/**
 * Recursively walk `baseDir`. Reports every sub folder (relative path) and invokes
 * `onFile` for each regular file. Hidden entries (leading dot), special files, broken
 * symlinks, symlinks pointing outside `baseDir` and symlink cycles are skipped (with a
 * warning where that is surprising). Errors thrown by `onFile` become warnings.
 */
export function walkTree(
  baseDir: string,
  onFile: (file: WalkedFile) => void,
  warnings: ListWarning[]
): string[] {
  const folders: string[] = [];

  let realBase: string;
  try {
    realBase = fs.realpathSync(baseDir);
  } catch {
    return folders; // missing base dir: nothing to list
  }

  const visited = new Set<string>([realBase]);

  const walk = (dirPath: string, relativePath: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error: unknown) {
      warnings.push({ file: relativePath || '.', error: errorMessage(error) });
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      let realPath = fullPath;

      if (entry.isSymbolicLink()) {
        try {
          realPath = fs.realpathSync(fullPath);
          const stat = fs.statSync(realPath);
          isDir = stat.isDirectory();
          isFile = stat.isFile();
        } catch (error: unknown) {
          warnings.push({ file: relPath, error: `Skipped unreadable symlink: ${errorMessage(error)}` });
          continue;
        }
        if (!isWithin(realBase, realPath)) {
          warnings.push({ file: relPath, error: 'Skipped symlink pointing outside the directory' });
          continue;
        }
      }

      if (isDir) {
        if (entry.isSymbolicLink()) {
          if (visited.has(realPath)) continue; // symlink cycle / duplicate
          visited.add(realPath);
        }
        folders.push(relPath);
        walk(fullPath, relPath);
      } else if (isFile) {
        try {
          onFile({ name: entry.name, fullPath, folderPath: relativePath || null });
        } catch (error: unknown) {
          warnings.push({ file: relPath, error: errorMessage(error) });
        }
      }
    }
  };

  walk(baseDir, '');
  return folders;
}

export function pathExists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Create `<parent>/<name>` below `baseDir`. Fails if it already exists. */
export function createFolder(
  baseDir: string,
  parentPath: string | null,
  folderName: string
): { folderPath: string } {
  assertSafeFolderName(folderName);
  const target = resolveStrictlyInside(baseDir, [parentPath, folderName]);
  if (pathExists(target)) throw new Error('A folder with that name already exists');
  fs.mkdirSync(target, { recursive: true });
  return { folderPath: path.relative(path.resolve(baseDir), target) };
}

/** Recursively delete a folder below `baseDir` (never `baseDir` itself). Returns the absolute path removed. */
export function deleteFolder(baseDir: string, folderPath: string): { removed: string } {
  const target = resolveStrictlyInside(baseDir, [folderPath]);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(target);
  } catch {
    throw new Error('Folder does not exist.');
  }
  if (!stat.isDirectory()) throw new Error('Path is not a folder.');
  fs.rmSync(target, { recursive: true, force: true });
  return { removed: target };
}

/** Rename a folder in place. Fails if the destination exists. Returns old/new absolute paths. */
export function renameFolder(
  baseDir: string,
  oldFolderPath: string,
  newFolderName: string
): { newFolderPath: string; from: string; to: string } {
  assertSafeFolderName(newFolderName);
  const from = resolveStrictlyInside(baseDir, [oldFolderPath]);
  const to = resolveStrictlyInside(baseDir, [path.relative(path.resolve(baseDir), path.dirname(from)), newFolderName]);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(from);
  } catch {
    throw new Error('Folder does not exist.');
  }
  if (!stat.isDirectory()) throw new Error('Path is not a folder.');
  if (pathExists(to)) throw new Error('A folder with that name already exists');
  fs.renameSync(from, to);
  return { newFolderPath: path.relative(path.resolve(baseDir), to), from, to };
}

/** Resolve a (possibly null) folder path to an existing directory below `baseDir`. */
export function resolveExistingFolder(baseDir: string, folderPath: string | null): string {
  const dir = resolveInside(baseDir, [folderPath]);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dir);
  } catch {
    throw new Error('Folder does not exist.');
  }
  if (!stat.isDirectory()) throw new Error('Path is not a folder.');
  return dir;
}
