import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDirTracker } from '../__testutils__/helpers';
import { getGameSettings, saveGameSettings, validateGameSettings } from './gameSettingsStore';

const tmp = makeTempDirTracker();
let dir: string;
beforeEach(() => {
  dir = tmp.create();
});
afterEach(() => tmp.cleanup());

describe('gameSettingsStore', () => {
  it('a project without settings has none (nothing is written)', () => {
    expect(getGameSettings(dir)).toEqual({ settings: null });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('saves and reads them back', () => {
    const settings = { display: { visibleTilesX: 36, integerScaling: true }, camera: { followLag: 0.1 } };
    saveGameSettings(dir, settings);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'game-settings.json'), 'utf8'))).toEqual(settings);
    expect(getGameSettings(dir)).toEqual({ settings });
  });

  it('refuses anything that is not categories of numbers and switches', () => {
    expect(validateGameSettings({ a: { b: 1, c: true } })).toEqual([]);
    expect(validateGameSettings(null)).toHaveLength(1);
    expect(validateGameSettings({ a: 1 })).toHaveLength(1);
    expect(validateGameSettings({ a: { b: 'x', c: Number.NaN } })).toHaveLength(2);
    expect(() => saveGameSettings(dir, { a: { b: {} } })).toThrow(/Invalid game settings/);
    expect(fs.existsSync(path.join(dir, 'game-settings.json'))).toBe(false);
  });
});
