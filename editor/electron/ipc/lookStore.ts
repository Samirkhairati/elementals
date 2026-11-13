import fs from 'fs';
import path from 'path';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { pathExists } from './folderOps.js';
import { resolveInside } from './pathSafety.js';

/**
 * Electron-free storage for looks (docs/looks.md): `project/looks.json` (profiles, the start profile, the author's
 * presets) and the user shaders `project/shaders/<id>.frag`. The meaning of the data lives in shared/look, which the
 * main process cannot import; this only keeps the files well-formed and inside the project.
 */

export const LOOKS_FILE = 'looks.json';
export const SHADERS_DIR = 'shaders';
const EXT = '.frag';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Problems with a looks file (empty list = storable). */
export function validateLooks(looks: unknown): string[] {
  if (!isObject(looks)) return ['looks must be a JSON object'];
  if (!Array.isArray(looks.profiles)) return ['profiles must be a list'];
  const errors: string[] = [];
  const ids = new Set<string>();
  looks.profiles.forEach((p, i) => {
    if (!isObject(p) || typeof p.id !== 'string' || p.id === '') errors.push(`profiles[${i}] needs an id`);
    else if (ids.has(p.id)) errors.push(`profile id "${p.id}" is used twice`);
    else ids.add(p.id);
  });
  if (looks.presets !== undefined && !Array.isArray(looks.presets)) errors.push('presets must be a list');
  return errors;
}

/** The stored looks file, or null when the project has none (the default profiles apply; nothing is written). */
export function getLooks(projectDir: string): { looks: unknown | null } {
  const file = resolveInside(projectDir, [LOOKS_FILE]);
  if (!pathExists(file)) return { looks: null };
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { looks: isObject(parsed) ? parsed : null };
}

export function saveLooks(projectDir: string, looks: unknown): { looks: unknown } {
  const errors = validateLooks(looks);
  if (errors.length > 0) throw new Error(`Invalid looks: ${errors.join('; ')}`);
  fs.mkdirSync(projectDir, { recursive: true });
  atomicWriteJsonSync(resolveInside(projectDir, [LOOKS_FILE]), looks);
  return { looks };
}

// ── user shaders ──

const ID = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/** A shader id: lower-case path segments of letters, digits, `-` and `_` (`fx/water-ripple`). */
export function isValidShaderId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 120 && ID.test(id);
}

function shaderFile(projectDir: string, id: string): string {
  if (!isValidShaderId(id)) throw new Error(`Invalid shader id "${String(id)}" (lower-case letters, digits, - and _, folders with /)`);
  return resolveInside(projectDir, [SHADERS_DIR, ...`${id}${EXT}`.split('/')]);
}

export interface ShaderFile {
  id: string;
  source: string;
}

/** Every shader of the project, sorted by id. */
export function listShaders(projectDir: string): { shaders: ShaderFile[] } {
  const root = resolveInside(projectDir, [SHADERS_DIR]);
  const out: ShaderFile[] = [];
  const walk = (dir: string) => {
    if (!pathExists(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(EXT)) {
        const id = path.relative(root, full).split(path.sep).join('/').slice(0, -EXT.length);
        if (isValidShaderId(id)) out.push({ id, source: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { shaders: out };
}

export function saveShader(projectDir: string, id: string, source: string): { shader: ShaderFile } {
  if (typeof source !== 'string') throw new Error('shader source must be text');
  const file = shaderFile(projectDir, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, source, 'utf8');
  fs.renameSync(tmp, file);
  return { shader: { id, source } };
}

export function deleteShader(projectDir: string, id: string): { id: string } {
  const file = shaderFile(projectDir, id);
  if (pathExists(file)) fs.rmSync(file);
  return { id };
}

export function renameShader(projectDir: string, id: string, newId: string): { id: string } {
  const from = shaderFile(projectDir, id);
  const to = shaderFile(projectDir, newId);
  if (!pathExists(from)) throw new Error(`Shader "${id}" does not exist`);
  if (pathExists(to)) throw new Error(`Shader "${newId}" already exists`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return { id: newId };
}
