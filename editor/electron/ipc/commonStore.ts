import fs from 'fs';
import path from 'path';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { pathExists } from './folderOps.js';
import { assertSafeFileName, resolveInside } from './pathSafety.js';

/**
 * Electron-free storage for `project/common/<id>.json`, one file per common event.
 * Mirrors `CommonEvent` in shared/engine/common.ts (re-declared: the main process cannot import shared/).
 * The graph is stored as the editor sends it; the shared normaliser cleans it when it is read.
 */

export interface CommonEventFile {
  version: 1;
  id: string;
  name: string;
  folder?: string;
  graph: { nodes: unknown[]; frames: unknown[] };
}

export const COMMON_DIR = 'common';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Ids become file names, so they are restricted to a safe slug. */
export function isValidCommonId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) && id.length <= 64;
}

/** All problems with a common event value (empty list = valid). */
export function validateCommonEvent(ev: unknown): string[] {
  if (!isObject(ev)) return ['common event must be a JSON object'];
  const errors: string[] = [];
  if (!isValidCommonId(ev.id)) errors.push('id must be letters, digits, "_" or "-" (max 64 characters)');
  if (typeof ev.name !== 'string' || ev.name.trim() === '') errors.push('name must be a non-empty string');
  if (!isObject(ev.graph) || !Array.isArray(ev.graph.nodes)) errors.push('graph must have a list of nodes');
  else if (!Array.isArray(ev.graph.frames ?? [])) errors.push('graph.frames must be a list');
  return errors;
}

function cleanFolder(folder: unknown): { folder?: string } {
  if (typeof folder !== 'string') return {};
  const p = folder
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
  return p ? { folder: p } : {};
}

export function normalizeCommonEvent(ev: unknown): CommonEventFile {
  const errors = validateCommonEvent(ev);
  if (errors.length > 0) throw new Error(`Invalid common event: ${errors.join('; ')}`);
  const e = ev as CommonEventFile;
  return { version: 1, id: e.id, name: e.name.trim(), ...cleanFolder(e.folder), graph: { nodes: e.graph.nodes, frames: e.graph.frames ?? [] } };
}

function fileFor(projectDir: string, id: string): string {
  if (!isValidCommonId(id)) throw new Error(`Invalid common event id "${String(id)}"`);
  return resolveInside(projectDir, [COMMON_DIR, assertSafeFileName(`${id}.json`, '.json')]);
}

/** Every stored common event sorted by id; files that cannot be read are reported as warnings. */
export function listCommonEvents(projectDir: string): { events: CommonEventFile[]; warnings: { file: string; error: string }[] } {
  const dir = resolveInside(projectDir, [COMMON_DIR]);
  const events: CommonEventFile[] = [];
  const warnings: { file: string; error: string }[] = [];
  if (!pathExists(dir)) return { events, warnings };
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()) {
    try {
      const parsed = normalizeCommonEvent(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
      if (`${parsed.id}.json` !== name) throw new Error(`id "${parsed.id}" does not match the file name`);
      events.push(parsed);
    } catch (e) {
      warnings.push({ file: name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { events, warnings };
}

export function saveCommonEvent(projectDir: string, ev: unknown): { event: CommonEventFile } {
  const event = normalizeCommonEvent(ev);
  const file = fileFor(projectDir, event.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteJsonSync(file, event);
  return { event };
}

export function deleteCommonEvent(projectDir: string, id: string): Record<string, never> {
  const file = fileFor(projectDir, id);
  if (!pathExists(file)) throw new Error(`Common event "${id}" does not exist`);
  fs.rmSync(file);
  return {};
}
