import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDirTracker } from '../__testutils__/helpers';
import { getPrefabs, savePrefabs, validatePrefabs } from './prefabStore';

const tmp = makeTempDirTracker();
let dir: string;
beforeEach(() => {
  dir = tmp.create();
});
afterEach(() => tmp.cleanup());

const sign = { id: 'sign', name: 'Sign', node: { id: 'n', type: 'group', name: 'Sign', children: [] } };

describe('prefabStore', () => {
  it('a project without prefabs has none (the built-in ones apply; nothing is written)', () => {
    expect(getPrefabs(dir)).toEqual({ prefabs: null });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('saves and reads them back', () => {
    const file = { prefabs: [sign] };
    savePrefabs(dir, file);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'prefabs.json'), 'utf8'))).toEqual(file);
    expect(getPrefabs(dir)).toEqual({ prefabs: file });
  });

  it('refuses a file without a list, an id used twice, a prefab without a node', () => {
    expect(validatePrefabs({ prefabs: [sign] })).toEqual([]);
    expect(validatePrefabs(null)).toHaveLength(1);
    expect(validatePrefabs({ prefabs: {} })).toHaveLength(1);
    expect(validatePrefabs({ prefabs: [sign, sign] })).toEqual(['prefab id "sign" is used twice']);
    expect(validatePrefabs({ prefabs: [{ id: 'x', name: 'X' }] })).toEqual(['prefab 0 needs a node']);
    expect(() => savePrefabs(dir, { prefabs: [{}] })).toThrow(/Invalid prefabs/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
