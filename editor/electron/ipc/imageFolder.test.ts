import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanImageFolder } from './imageFolder';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const put = (rel: string) => {
  const file = path.join(root, 'Trees', rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
};

describe('scanImageFolder', () => {
  it('finds every PNG with the folder structure, starting at the folder itself', () => {
    put('oak.png');
    put('autumn/maple.png');
    put('autumn/dark/elm.PNG');
    put('notes.txt');
    put('.hidden.png');
    const scan = scanImageFolder(path.join(root, 'Trees'));
    expect(scan.files.map((f) => [f.dir, f.defaultName])).toEqual([
      ['Trees/autumn/dark', 'elm'],
      ['Trees/autumn', 'maple'],
      ['Trees', 'oak'],
    ]);
    expect(scan.skipped).toBe(1);
    expect(scan.truncated).toBe(false);
  });

  it('ignores symbolic links so a scan cannot leave the folder', () => {
    put('a.png');
    fs.symlinkSync(os.tmpdir(), path.join(root, 'Trees', 'out'));
    expect(scanImageFolder(path.join(root, 'Trees')).files).toHaveLength(1);
  });

  it('stops at the limits and says so', () => {
    put('a.png');
    put('b.png');
    put('x/y/z.png');
    expect(scanImageFolder(path.join(root, 'Trees'), 1).truncated).toBe(true);
    expect(scanImageFolder(path.join(root, 'Trees'), 10, 1).truncated).toBe(true);
  });

  it('returns nothing for a folder that cannot be read', () => {
    expect(scanImageFolder(path.join(root, 'missing')).files).toEqual([]);
  });
});
