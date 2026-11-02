import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { pathToFileURL } from 'url';
import { errorMessage } from './result.js';

export interface AssetSyncSummary {
  /** Files written under game/public (pictures, tilesets, manifests). */
  written: number;
  /** Why nothing was synced (the scripts are not there, or the project has errors); the export itself still worked. */
  skipped?: string;
}

const MARK = '@@assets-sync@@';

// The script imports `shared/*.ts` directly, which needs the repo's Node 24 (it strips types itself). Electron's embedded
// Node cannot ("Unknown file extension .ts"), so it runs in a child `node`.
const RUNNER = `const m = await import(process.argv[1]);
const r = m.syncAssets(JSON.parse(process.argv[2]));
process.stdout.write('${MARK}' + JSON.stringify({ errors: r.plan.errors, applied: r.applied.length }));`;

function runSync(script: string, options: { projectDir: string; publicDir: string; write: boolean }): Promise<{ errors: string[]; applied: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      ['--no-warnings', '--input-type=module', '-e', RUNNER, pathToFileURL(script).href, JSON.stringify(options)],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, cwd: path.dirname(script) },
      (error, stdout, stderr) => {
        const at = stdout.lastIndexOf(MARK);
        if (at >= 0) return resolve(JSON.parse(stdout.slice(at + MARK.length)));
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === 'ENOENT') return reject(new Error('Node.js (version 24) was not found on the PATH'));
        const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
        const reason = lines.find((l) => /^\w*Error\b/.test(l)) ?? lines[0] ?? error?.message ?? 'no result';
        reject(new Error(reason));
      }
    );
  });
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
    // <public>/data/maps -> <public>
    const publicDir = path.resolve(gameMapsDir, '..', '..');
    const result = await runSync(script, { projectDir: path.resolve(projectDir), publicDir, write: true });
    if (result.errors.length > 0) return { written: 0, skipped: `asset sync found problems: ${result.errors[0]}` };
    return { written: result.applied };
  } catch (e) {
    return { written: 0, skipped: `asset sync failed: ${errorMessage(e)}` };
  }
}
