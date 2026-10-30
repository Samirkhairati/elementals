// Runs the editor in development: Vite dev server, then the Electron window.
// Closing Electron stops Vite; a Vite failure/timeout stops everything and
// exits non-zero. Port: PORT env (default 5174).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupervisor } from '../scripts/lib/supervisor.mjs';
import { defaultIsPortFree } from '../scripts/lib/worktree.mjs';

const require = createRequire(import.meta.url);
const editorDir = path.dirname(fileURLToPath(import.meta.url));

const portStr = process.env.PORT || '5174';
const port = Number(portStr);
const tag = '\x1b[36m[Editor]\x1b[0m';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`${tag} invalid PORT "${portStr}"`);
  process.exit(2);
}

/** Resolve the Vite CLI entry so it can run via `node` (no npx / shell needed). */
function resolveViteBin() {
  const pkgPath = require.resolve('vite/package.json', { paths: [editorDir] });
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vite;
  return path.join(path.dirname(pkgPath), bin);
}

/** Electron's `require` returns the path of its binary. */
function resolveElectronBin() {
  const bin = require('electron');
  if (typeof bin !== 'string' || !fs.existsSync(bin)) {
    throw new Error('Electron binary not found');
  }
  return bin;
}

/**
 * True only if `http://localhost:<port>` is a Vite dev server: /@vite/client
 * must answer 200 with Vite's client script, so an unrelated server already on
 * the port is never mistaken for ours.
 */
async function isViteServer(url) {
  const res = await fetch(`${url}/@vite/client`, { signal: AbortSignal.timeout(2000) });
  if (res.status !== 200) return false;
  return (await res.text()).includes('vite');
}

async function waitForVite(url, { timeoutMs = 30000, shouldStop = () => false } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (shouldStop()) return false;
    try {
      if (await isViteServer(url)) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for Vite at ${url}`);
}

async function main() {
  let viteBin;
  let electronBin;
  try {
    viteBin = resolveViteBin();
    electronBin = resolveElectronBin();
  } catch (err) {
    console.error(`${tag} ${err.message}. Run: npm install --prefix editor`);
    return 1;
  }

  // Fail fast if something else already holds the port, so a foreign server can
  // never be mistaken for our Vite while it is still starting.
  if (!(await defaultIsPortFree(port))) {
    console.error(`${tag} port ${port} is already in use. Stop that process or pick another PORT.`);
    return 1;
  }

  // Under scripts/dev.mjs the whole group is killed by the parent, so stay in it.
  const sup = createSupervisor({
    detached: process.env.ELEMENTALS_SUPERVISED ? false : undefined,
    log: (m) => console.log(`${tag} ${m}`),
  });
  sup.installSignalHandlers();

  const url = `http://localhost:${port}`;
  console.log(`${tag} Starting Vite dev server on port ${port} (strictPort)...`);
  sup.start('vite', process.execPath, [viteBin, '--port', String(port), '--strictPort'], {
    cwd: editorDir,
    env: { ...process.env, PORT: String(port) },
  });

  waitForVite(url, { shouldStop: () => sup.stopping })
    .then((ready) => {
      if (!ready || sup.stopping) return;
      console.log(`\x1b[35m[Editor]\x1b[0m Vite ready at ${url}. Launching Electron...`);
      sup.start('electron', electronBin, ['.'], {
        cwd: editorDir,
        env: { ...process.env, PORT: String(port) },
      });
    })
    .catch((err) => {
      console.error(`${tag} ${err.message}`);
      sup.shutdown(1);
    });

  return sup.done;
}

main().then((code) => process.exit(code));
