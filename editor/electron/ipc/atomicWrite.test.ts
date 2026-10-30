import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDir, makeTempDirTracker } from '../__testutils__/helpers';
import { atomicWriteFileSync, atomicWriteJsonSync } from './atomicWrite';

const tmp = makeTempDirTracker();
let dir: string;

beforeEach(() => {
  dir = tmp.create();
});
afterEach(() => {
  vi.restoreAllMocks();
  tmp.cleanup();
});

describe('atomicWriteFileSync', () => {
  it('creates a new file and leaves no temp files', () => {
    const file = path.join(dir, 'a.json');
    atomicWriteFileSync(file, 'hello');
    expect(fs.readFileSync(file, 'utf8')).toBe('hello');
    expect(listDir(dir)).toEqual(['a.json']);
  });

  it('replaces existing content', () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, 'old old old old');
    atomicWriteFileSync(file, 'new');
    expect(fs.readFileSync(file, 'utf8')).toBe('new');
    expect(listDir(dir)).toEqual(['a.json']);
  });

  it('writes binary data', () => {
    const file = path.join(dir, 'a.bin');
    atomicWriteFileSync(file, Uint8Array.from([0, 1, 2, 255]));
    expect([...fs.readFileSync(file)]).toEqual([0, 1, 2, 255]);
  });

  it('writes the temp file next to the target (same directory) before renaming', () => {
    const file = path.join(dir, 'a.json');
    const rename = vi.spyOn(fs, 'renameSync');
    atomicWriteFileSync(file, 'x');
    const [from, to] = rename.mock.calls[0] as [string, string];
    expect(path.dirname(from)).toBe(dir);
    expect(path.basename(from)).toMatch(/^a\.json\.\d+\.[0-9a-f]+\.tmp$/);
    expect(to).toBe(file);
  });

  it('fsyncs the data before renaming', () => {
    const order: string[] = [];
    const realFsync = fs.fsyncSync;
    const realRename = fs.renameSync;
    vi.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
      order.push('fsync');
      realFsync(fd);
    });
    vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => {
      order.push('rename');
      realRename(a, b);
    });
    atomicWriteFileSync(path.join(dir, 'a.json'), 'x');
    expect(order.indexOf('fsync')).toBeLessThan(order.indexOf('rename'));
  });

  it('keeps the original intact and cleans up when fsync fails', () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, 'original');
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw new Error('disk on fire');
    });
    expect(() => atomicWriteFileSync(file, 'replacement')).toThrow('disk on fire');
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(listDir(dir)).toEqual(['a.json']);
  });

  it('keeps the original intact and cleans up when the rename fails', () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, 'original');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed');
    });
    expect(() => atomicWriteFileSync(file, 'replacement')).toThrow('rename failed');
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(listDir(dir)).toEqual(['a.json']);
  });

  it('fails without leaving temp files when the target is a directory', () => {
    const target = path.join(dir, 'taken');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'keep.txt'), 'keep');
    expect(() => atomicWriteFileSync(target, 'x')).toThrow();
    expect(listDir(dir)).toEqual(['taken']);
    expect(listDir(target)).toEqual(['keep.txt']);
  });

  it('fails when the parent directory is missing', () => {
    expect(() => atomicWriteFileSync(path.join(dir, 'nope', 'a.json'), 'x')).toThrow(/ENOENT/);
    expect(listDir(dir)).toEqual([]);
  });

  it('does not collide with concurrent writers to the same file (unique temp names)', () => {
    const file = path.join(dir, 'a.json');
    const rename = vi.spyOn(fs, 'renameSync');
    atomicWriteFileSync(file, '1');
    atomicWriteFileSync(file, '2');
    const names = rename.mock.calls.map((c) => c[0] as string);
    expect(new Set(names).size).toBe(2);
  });
});

describe('atomicWriteJsonSync', () => {
  it('writes pretty-printed JSON', () => {
    const file = path.join(dir, 'a.json');
    atomicWriteJsonSync(file, { a: 1, b: [2] });
    expect(fs.readFileSync(file, 'utf8')).toBe(JSON.stringify({ a: 1, b: [2] }, null, 2));
  });

  it('refuses values that cannot be serialised and leaves the file alone', () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, '{"keep":true}');
    expect(() => atomicWriteJsonSync(file, undefined)).toThrow(/serializ/);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"keep":true}');
  });

  it('propagates circular reference errors without touching the file', () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, '{}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => atomicWriteJsonSync(file, circular)).toThrow();
    expect(listDir(dir)).toEqual(['a.json']);
  });
});
