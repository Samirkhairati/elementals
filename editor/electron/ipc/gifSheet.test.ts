import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// The main process cannot import shared/, so the GIF code is copied into electron/ipc. This pins the copies to the originals.
const here = __dirname;
const shared = path.resolve(here, '../../../shared');
const read = (file: string) => fs.readFileSync(file, 'utf8');
const withoutTwinNote = (source: string) => source.replace(/^\/\/ TWIN of .*\n/, '');

describe('the GIF code of the main process is a copy of shared/', () => {
  it.each(['gif', 'pngEncode'])('%s.ts is identical', (name) => {
    expect(withoutTwinNote(read(path.join(here, `${name}.ts`)))).toBe(read(path.join(shared, `${name}.ts`)));
  });

  it('gifSheet.ts is identical apart from its import suffixes', () => {
    const original = read(path.join(shared, 'gifSheet.ts')).replace(/from '\.\/(\w+)\.ts'/g, "from './$1.js'");
    expect(withoutTwinNote(read(path.join(here, 'gifSheet.ts')))).toBe(original);
  });
});
