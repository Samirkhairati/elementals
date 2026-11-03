import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, execFileSync } from 'child_process';
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

const MIN_NODE_MAJOR = 24;

function nodeMajor(bin: string): number {
  try {
    const out = execFileSync(bin, ['--version'], { timeout: 5_000, encoding: 'utf8' });
    return Number(/^v(\d+)/.exec(out.trim())?.[1] ?? 0);
  } catch {
    return 0;
  }
}

let nodeBin: string | undefined;

/**
 * A GUI-launched editor often has an older `node` first on its PATH (or none), so look for one that can run the script:
 * the PATH's own if it is new enough, else an nvm / Homebrew install of at least Node 24.
 */
function findNode(): string {
  if (nodeBin) return nodeBin;
  const candidates = ['node'];
  const nvmDir = path.join(process.env.NVM_DIR ?? path.join(os.homedir(), '.nvm'), 'versions', 'node');
  try {
    for (const v of fs.readdirSync(nvmDir)) candidates.push(path.join(nvmDir, v, 'bin', 'node'));
  } catch {
    /* no nvm */
  }
  candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node');
  let best = { bin: 'node', major: 0 };
  for (const bin of candidates) {
    const major = nodeMajor(bin);
    if (major >= MIN_NODE_MAJOR && (best.major < MIN_NODE_MAJOR || bin === 'node')) {
      best = { bin, major };
      if (bin === 'node') break;
    }
  }
  return (nodeBin = best.bin);
}

function runSync(script: string, options: { projectDir: string; publicDir: string; write: boolean }): Promise<{ errors: string[]; applied: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      findNode(),
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
