import fs from 'fs';
import path from 'path';
import { pathExists } from './folderOps.js';
import { resolveStrictlyInside } from './pathSafety.js';
import {
  createCharacterFolder,
  deleteCharacterFolder,
  isValidGraphicId,
  moveCharacterFolder,
  renameCharacterFolder,
  type ImageCache,
} from './characterStore.js';

/**
 * Electron-free storage for the graphics library (project/graphics): moving, renaming and deleting images and
 * managing folders. A graphic id is its path below the root, so every rename here changes ids; rewriting what
 * refers to them (character sheets, image layers) is the caller's job (editor/src/lib/assetOps.ts).
 */

function graphicFile(graphicsDir: string, id: string): string {
  if (!isValidGraphicId(id)) throw new Error('Graphic id must be a "/"-separated path of letters, digits, "_" and "-" ending in .png');
  return resolveStrictlyInside(graphicsDir, [id]);
}

/** Renames and/or moves an image to a new id (missing folders are created). Refuses to overwrite. */
export function renameGraphic(graphicsDir: string, cache: ImageCache, id: string, newId: string): { id: string } {
  const from = graphicFile(graphicsDir, id);
  const to = graphicFile(graphicsDir, newId);
  if (!pathExists(from)) throw new Error(`Graphic "${id}" does not exist.`);
  if (newId === id) return { id };
  if (pathExists(to)) throw new Error(`A graphic with id "${newId}" already exists`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  cache.invalidate(from);
  cache.invalidate(to);
  return { id: newId };
}

export function deleteGraphic(graphicsDir: string, cache: ImageCache, id: string): void {
  const file = graphicFile(graphicsDir, id);
  if (!pathExists(file)) throw new Error(`Graphic "${id}" does not exist.`);
  fs.rmSync(file);
  cache.invalidate(file);
}

export function createGraphicFolder(graphicsDir: string, parentId: string | null, name: string): { folderId: string } {
  return createCharacterFolder(graphicsDir, parentId, name);
}

export function renameGraphicFolder(graphicsDir: string, cache: ImageCache, folderId: string, newName: string): { folderId: string } {
  const result = renameCharacterFolder(graphicsDir, folderId, newName);
  cache.invalidateTree(resolveStrictlyInside(graphicsDir, [folderId]));
  return result;
}

export function moveGraphicFolder(graphicsDir: string, cache: ImageCache, folderId: string, newParentId: string | null): { folderId: string } {
  const result = moveCharacterFolder(graphicsDir, folderId, newParentId);
  cache.invalidateTree(resolveStrictlyInside(graphicsDir, [folderId]));
  return result;
}

export function deleteGraphicFolder(graphicsDir: string, cache: ImageCache, folderId: string): void {
  const dir = resolveStrictlyInside(graphicsDir, [folderId]);
  deleteCharacterFolder(graphicsDir, folderId);
  cache.invalidateTree(dir);
}
