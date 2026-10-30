import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDirTracker } from '../__testutils__/helpers';
import {
  PathSafetyError,
  assertSafeFileName,
  assertSafeFolderName,
  resolveInside,
  resolveStrictlyInside,
} from './pathSafety';

const tmp = makeTempDirTracker();
let base: string;

beforeEach(() => {
  base = path.join(tmp.create(), 'maps');
  fs.mkdirSync(base);
});
afterEach(() => tmp.cleanup());

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error: unknown) {
    if (error instanceof PathSafetyError) return error.code;
    throw error;
  }
  return undefined;
};

describe('resolveInside', () => {
  it('joins plain and nested segments', () => {
    expect(resolveInside(base, ['town', 'a.json'])).toBe(path.join(base, 'town', 'a.json'));
    expect(resolveInside(base, ['a/b/c'])).toBe(path.join(base, 'a', 'b', 'c'));
  });

  it('ignores null, undefined and empty segments and allows the base itself', () => {
    expect(resolveInside(base, [null, undefined, '', 'x'])).toBe(path.join(base, 'x'));
    expect(resolveInside(base, [null])).toBe(base);
    expect(resolveInside(base, [])).toBe(base);
  });

  it.each([
    ['../x', 'traversal'],
    ['..', 'traversal'],
    ['a/../../x', 'traversal'],
    ['a/..', 'traversal'],
    ['a\\..\\..\\x', 'traversal'],
    ['/etc/passwd', 'absolute-path'],
    ['\\windows\\system32', 'absolute-path'],
    ['C:\\Windows', 'absolute-path'],
    ['C:evil', 'absolute-path'],
    ['a\0b', 'nul-byte'],
  ])('rejects %j (%s)', (segment, code) => {
    expect(codeOf(() => resolveInside(base, [segment]))).toBe(code);
  });

  it('rejects non-string segments', () => {
    expect(codeOf(() => resolveInside(base, [42 as unknown as string]))).toBe('invalid-type');
    expect(codeOf(() => resolveInside(base, [{} as unknown as string]))).toBe('invalid-type');
  });

  it('rejects an absolute segment even when it points inside the base', () => {
    expect(codeOf(() => resolveInside(base, [path.join(base, 'ok')]))).toBe('absolute-path');
  });

  it('allows names that merely contain dots', () => {
    expect(resolveInside(base, ['..foo', 'a..b'])).toBe(path.join(base, '..foo', 'a..b'));
  });

  it('refuses symlinks that escape the base directory', () => {
    const outside = tmp.create();
    fs.writeFileSync(path.join(outside, 'secret.json'), '{}');
    fs.symlinkSync(outside, path.join(base, 'link'));

    expect(codeOf(() => resolveInside(base, ['link']))).toBe('escapes-base');
    expect(codeOf(() => resolveInside(base, ['link', 'secret.json']))).toBe('escapes-base');
    // also for a not-yet-existing file below the symlink
    expect(codeOf(() => resolveInside(base, ['link', 'new.json']))).toBe('escapes-base');
  });

  it('refuses a symlinked file pointing outside', () => {
    const outside = tmp.create();
    const target = path.join(outside, 'secret.json');
    fs.writeFileSync(target, '{}');
    fs.symlinkSync(target, path.join(base, 'secret.json'));
    expect(codeOf(() => resolveInside(base, ['secret.json']))).toBe('escapes-base');
  });

  it('allows symlinks that stay inside the base', () => {
    fs.mkdirSync(path.join(base, 'real'));
    fs.symlinkSync(path.join(base, 'real'), path.join(base, 'alias'));
    expect(resolveInside(base, ['alias', 'a.json'])).toBe(path.join(base, 'alias', 'a.json'));
  });

  it('can skip the symlink check when asked to', () => {
    const outside = tmp.create();
    fs.symlinkSync(outside, path.join(base, 'link'));
    expect(resolveInside(base, ['link'], { followSymlinks: false })).toBe(path.join(base, 'link'));
  });

  it('works when the base directory does not exist yet', () => {
    const missing = path.join(tmp.create(), 'not-created');
    expect(resolveInside(missing, ['a', 'b.json'])).toBe(path.join(missing, 'a', 'b.json'));
  });
});

describe('resolveStrictlyInside', () => {
  it.each([[''], ['.'], ['./'], ['a/..'], [null]])('refuses the root itself for %j', (segment) => {
    // "a/.." is rejected as traversal before it is recognised as the root; both are refusals.
    expect(() => resolveStrictlyInside(base, [segment as string | null])).toThrow(PathSafetyError);
  });

  it('reports is-base for root-equivalent input', () => {
    expect(codeOf(() => resolveStrictlyInside(base, ['']))).toBe('is-base');
    expect(codeOf(() => resolveStrictlyInside(base, ['.']))).toBe('is-base');
    expect(codeOf(() => resolveStrictlyInside(base, [null, undefined]))).toBe('is-base');
  });

  it('accepts real children', () => {
    expect(resolveStrictlyInside(base, ['town'])).toBe(path.join(base, 'town'));
  });
});

describe('assertSafeFileName', () => {
  it('accepts normal names', () => {
    expect(assertSafeFileName('town.json', '.json')).toBe('town.json');
    expect(assertSafeFileName('my map_1.json', '.json')).toBe('my map_1.json');
    expect(assertSafeFileName('tiles.png', '.png')).toBe('tiles.png');
  });

  it.each([
    ['../x.json'],
    ['a/b.json'],
    ['a\\b.json'],
    ['/abs.json'],
    ['.hidden.json'],
    ['..json'],
    ['.json'],
    [''],
    ['town.png'],
    ['town.json.exe'],
    ['town\0.json'],
    ['bad\nname.json'],
    ['a'.repeat(300) + '.json'],
  ])('rejects %j', (name) => {
    expect(() => assertSafeFileName(name, '.json')).toThrow(PathSafetyError);
  });

  it('rejects non-strings', () => {
    expect(() => assertSafeFileName(undefined, '.json')).toThrow(PathSafetyError);
    expect(() => assertSafeFileName(5, '.json')).toThrow(PathSafetyError);
  });
});

describe('assertSafeFolderName', () => {
  it('accepts normal names', () => {
    expect(assertSafeFolderName('Town')).toBe('Town');
    expect(assertSafeFolderName('cave level 2')).toBe('cave level 2');
  });

  it.each([[''], ['.'], ['..'], ['a/b'], ['a\\b'], ['../x'], ['.git'], ['   '], ['a\0'], ['a\tb']])(
    'rejects %j',
    (name) => {
      expect(() => assertSafeFolderName(name)).toThrow(PathSafetyError);
    }
  );

  it('rejects non-strings', () => {
    expect(() => assertSafeFolderName(null)).toThrow(PathSafetyError);
    expect(() => assertSafeFolderName(['a'])).toThrow(PathSafetyError);
  });
});
