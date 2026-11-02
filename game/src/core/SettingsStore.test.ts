import { afterEach, describe, expect, it } from 'vitest';
import { settingsStore } from './SettingsStore';

afterEach(() => settingsStore.applyGameSettings(null));

describe('SettingsStore game settings', () => {
  it('starts with the default view: 32 tiles across at 16:9 = 18 down', () => {
    settingsStore.applyGameSettings(null);
    expect(settingsStore.view).toEqual({ width: 1024, height: 576, tilesX: 32, tilesY: 18 });
    expect(settingsStore.camera.followLag).toBeGreaterThanOrEqual(0);
    expect(settingsStore.movement.playerSpeed).toBe(200);
  });

  it('takes the project settings and cleans anything out of range', () => {
    settingsStore.applyGameSettings({
      display: { visibleTilesX: 40, integerScaling: true },
      camera: { followLag: 9 },
      movement: { tileBased: false, playerSpeed: 'fast' },
    });
    expect(settingsStore.view).toMatchObject({ width: 1280, height: 720, tilesX: 40 });
    expect(settingsStore.display.integerScaling).toBe(true);
    expect(settingsStore.camera.followLag).toBe(0.5); // clamped
    expect(settingsStore.movement.playerSpeed).toBe(200); // not a number: the default
    expect(settingsStore.tileBasedMovement).toBe(false);
  });

  it('a missing or damaged file means the defaults', () => {
    settingsStore.applyGameSettings('garbage');
    expect(settingsStore.view.tilesX).toBe(32);
    expect(settingsStore.tileBasedMovement).toBe(true);
  });
});
