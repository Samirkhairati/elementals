import fs from 'fs';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { pathExists } from './folderOps.js';
import { resolveInside } from './pathSafety.js';

/**
 * Electron-free storage for `project/game-settings.json` (the game's view, camera and movement settings).
 * The meaning of the values (names, ranges, defaults) lives in shared/gameSettings.ts, which the main process cannot
 * import; this only keeps the file well-formed (an object of categories, each a flat bag of numbers and switches) and the
 * renderer and the asset sync clean the values themselves.
 */

export const GAME_SETTINGS_FILE = 'game-settings.json';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Problems with a settings value (empty list = storable). */
export function validateGameSettings(settings: unknown): string[] {
  if (!isObject(settings)) return ['settings must be a JSON object'];
  const errors: string[] = [];
  for (const [category, bag] of Object.entries(settings)) {
    if (!isObject(bag)) {
      errors.push(`${category} must be an object`);
      continue;
    }
    for (const [key, value] of Object.entries(bag)) {
      const ok = typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
      if (!ok) errors.push(`${category}.${key} must be a number or true/false`);
    }
  }
  return errors;
}

/** The stored settings, or null when the project has none yet (the defaults apply; nothing is written). */
export function getGameSettings(projectDir: string): { settings: unknown | null } {
  const file = resolveInside(projectDir, [GAME_SETTINGS_FILE]);
  if (!pathExists(file)) return { settings: null };
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { settings: isObject(parsed) ? parsed : null };
}

export function saveGameSettings(projectDir: string, settings: unknown): { settings: unknown } {
  const errors = validateGameSettings(settings);
  if (errors.length > 0) throw new Error(`Invalid game settings: ${errors.join('; ')}`);
  fs.mkdirSync(projectDir, { recursive: true });
  atomicWriteJsonSync(resolveInside(projectDir, [GAME_SETTINGS_FILE]), settings);
  return { settings };
}
