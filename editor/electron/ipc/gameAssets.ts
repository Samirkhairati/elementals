import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { errorMessage } from './result.js';

export interface AssetSyncSummary {
  /** Files written under game/public (pictures, tilesets, manifests). */
  written: number;
  /** Why nothing was synced (the scripts are not there, or the project has errors); the export itself still worked. */
  skipped?: string;
}

interface SyncModule {
  syncAssets: (opts: { projectDir: string; publicDir: string; write: boolean }) => {
    plan: { errors: string[] };
    applied: unknown[];
  };
}

/**
 * Copies what the game needs from the project (pictures, tilesets, sprites, manifests) into `game/public`, exactly like
 * `npm run assets:sync`, so an exported map never points at a picture the game does not have. It uses the repo's own
 * script (`<repo>/scripts/lib/assets.mjs`); a project that is not inside the repo, or a packaged editor, has none and skips.
 * It never throws: the map export has already succeeded when this runs.
 */
export async function syncGameAssets(projectDir: string, gameMapsDir: string): Promise<AssetSyncSummary> {
  const script = path.join(path.resolve(projectDir), '..', 'scripts', 'lib', 'assets.mjs');
  if (!fs.existsSync(script)) return { written: 0, skipped: 'no asset sync script next to the project' };
  try {
    const mod = (await import(/* @vite-ignore */ pathToFileURL(script).href)) as SyncModule;
    // <public>/data/maps -> <public>
    const publicDir = path.resolve(gameMapsDir, '..', '..');
    const result = mod.syncAssets({ projectDir: path.resolve(projectDir), publicDir, write: true });
    if (result.plan.errors.length > 0) return { written: 0, skipped: `asset sync found problems: ${result.plan.errors[0]}` };
    return { written: result.applied.length };
  } catch (e) {
    return { written: 0, skipped: `asset sync failed: ${errorMessage(e)}` };
  }
}
