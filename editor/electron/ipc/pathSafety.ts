import fs from 'fs';
import path from 'path';

/**
 * Pure helpers that make sure renderer-supplied path fragments can never
 * escape the directory a handler is meant to operate in.
 */

export type PathSafetyCode =
  | 'invalid-type'
  | 'nul-byte'
  | 'absolute-path'
  | 'traversal'
  | 'escapes-base'
  | 'is-base'
  | 'invalid-name';

export class PathSafetyError extends Error {
  readonly code: PathSafetyCode;

  constructor(code: PathSafetyCode, message: string) {
    super(message);
    this.name = 'PathSafetyError';
    this.code = code;
  }
}

const SEPARATORS = /[\\/]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_NAME_LENGTH = 255;

function checkSegment(segment: string): void {
  if (segment.includes('\0')) {
    throw new PathSafetyError('nul-byte', 'Path contains a NUL byte');
  }
  if (
    path.isAbsolute(segment) ||
    path.win32.isAbsolute(segment) ||
    path.posix.isAbsolute(segment) ||
    /^[a-zA-Z]:/.test(segment)
  ) {
    throw new PathSafetyError('absolute-path', 'Absolute paths are not allowed');
  }
  if (segment.split(SEPARATORS).includes('..')) {
    throw new PathSafetyError('traversal', 'Path must not contain ".." segments');
  }
}

/** True when `target` is `base` itself or lives below it (purely lexical). */
export function isWithin(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** realpath of the deepest ancestor of `target` that exists, re-joined with the missing tail. */
function realpathOfDeepestExisting(target: string): string {
  let current = target;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      const parent = path.dirname(current);
      if (parent === current) return target;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

export interface ResolveOptions {
  /** Allow the result to be `baseDir` itself (default true). */
  allowBase?: boolean;
  /** Follow symlinks and make sure the real location is still inside the real baseDir (default true). */
  followSymlinks?: boolean;
}

/**
 * Join `segments` onto `baseDir` and guarantee the result stays inside it.
 * `null`, `undefined` and empty segments are ignored. Absolute segments, NUL bytes
 * and `..` components are rejected, and symlinks that point outside of `baseDir` are refused.
 */
export function resolveInside(
  baseDir: string,
  segments: ReadonlyArray<string | null | undefined>,
  options: ResolveOptions = {}
): string {
  const { allowBase = true, followSymlinks = true } = options;
  const clean: string[] = [];
  for (const segment of segments) {
    if (segment === null || segment === undefined || segment === '') continue;
    if (typeof segment !== 'string') {
      throw new PathSafetyError('invalid-type', 'Path segments must be strings');
    }
    checkSegment(segment);
    clean.push(segment);
  }

  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, ...clean);

  if (!isWithin(base, resolved)) {
    throw new PathSafetyError('escapes-base', 'Path escapes the allowed directory');
  }
  if (!allowBase && resolved === base) {
    throw new PathSafetyError('is-base', 'Operation on the root directory is not allowed');
  }

  if (followSymlinks) {
    let realBase: string;
    try {
      realBase = fs.realpathSync(base);
    } catch {
      // Base does not exist yet: nothing inside it can be a symlink.
      return resolved;
    }
    const realTarget = realpathOfDeepestExisting(resolved);
    if (!isWithin(realBase, realTarget)) {
      throw new PathSafetyError('escapes-base', 'Path escapes the allowed directory via a symlink');
    }
  }

  return resolved;
}

/** Like {@link resolveInside} but refuses `baseDir` itself (use for delete / rename / move). */
export function resolveStrictlyInside(
  baseDir: string,
  segments: ReadonlyArray<string | null | undefined>,
  options: Omit<ResolveOptions, 'allowBase'> = {}
): string {
  return resolveInside(baseDir, segments, { ...options, allowBase: false });
}

function assertBasicName(name: unknown, what: string): string {
  if (typeof name !== 'string') {
    throw new PathSafetyError('invalid-type', `${what} must be a string`);
  }
  if (name.includes('\0')) throw new PathSafetyError('nul-byte', `${what} contains a NUL byte`);
  if (name.length === 0) throw new PathSafetyError('invalid-name', `${what} must not be empty`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new PathSafetyError('invalid-name', `${what} is too long`);
  }
  if (SEPARATORS.test(name)) {
    throw new PathSafetyError('invalid-name', `${what} must not contain path separators`);
  }
  if (CONTROL_CHARS.test(name)) {
    throw new PathSafetyError('invalid-name', `${what} contains control characters`);
  }
  if (name.startsWith('.')) {
    throw new PathSafetyError('invalid-name', `${what} must not start with a dot`);
  }
  return name;
}

/** Validate a single file name (no directories) that must end with `ext` (e.g. ".json"). */
export function assertSafeFileName(name: unknown, ext: string): string {
  const safe = assertBasicName(name, 'File name');
  if (!safe.endsWith(ext) || safe.length === ext.length) {
    throw new PathSafetyError('invalid-name', `File name must end with "${ext}"`);
  }
  return safe;
}

/** Validate a single folder name (no directories). */
export function assertSafeFolderName(name: unknown): string {
  const safe = assertBasicName(name, 'Folder name');
  if (safe.trim().length === 0) {
    throw new PathSafetyError('invalid-name', 'Folder name must not be blank');
  }
  return safe;
}
