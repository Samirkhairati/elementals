#!/usr/bin/env node
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Auto-detect worktree name and index
function detectWorktree() {
  try {
    const gitPath = path.join(ROOT_DIR, '.git');
    if (fs.existsSync(gitPath) && fs.statSync(gitPath).isFile()) {
      const content = fs.readFileSync(gitPath, 'utf8');
      const match = content.match(/worktrees[/\\]([^/\r\n]+)/);
      const name = match ? match[1] : path.basename(ROOT_DIR);

      try {
        const list = execSync('git worktree list --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
        const entries = list.split('\n\n').filter(Boolean);
        const idx = entries.findIndex(e => e.includes(ROOT_DIR) || (match && e.includes(match[1])));
        const offset = idx > 0 ? idx : 1;
        return { isWorktree: true, name, offset };
      } catch {
        return { isWorktree: true, name, offset: 1 };
      }
    }
  } catch {}

  return { isWorktree: false, name: 'main', offset: 0 };
}

const detected = detectWorktree();

// 2. Parse CLI args (allow overriding auto-detected offset)
const args = process.argv.slice(2);
let offset = detected.offset;
let explicitOffset = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--offset' && args[i + 1]) {
    offset = parseInt(args[i + 1], 10) || 0;
    explicitOffset = true;
  } else if (args[i].startsWith('--offset=')) {
    offset = parseInt(args[i].split('=')[1], 10) || 0;
    explicitOffset = true;
  }
}

if (process.env.PORT_OFFSET) {
  offset = parseInt(process.env.PORT_OFFSET, 10) || offset;
  explicitOffset = true;
}

const worktreeName = process.env.WORKTREE_NAME || detected.name;
const gamePort = process.env.GAME_PORT ? parseInt(process.env.GAME_PORT, 10) : 5175 + (offset * 100);
const editorPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 5174 + (offset * 100);

console.log('\n======================================================');
console.log(`🚀  \x1b[1m\x1b[32mElementals Unified Dev Server\x1b[0m — \x1b[36m[${worktreeName}]\x1b[0m`);
console.log('======================================================');
console.log(`🎮  \x1b[1mGame Web App:\x1b[0m      \x1b[34mhttp://localhost:${gamePort}\x1b[0m`);
console.log(`🎨  \x1b[1mElectron Editor:\x1b[0m   \x1b[35mhttp://localhost:${editorPort}\x1b[0m (Vite dev server)`);
if (offset > 0) {
  console.log(`⚡  \x1b[33mWorktree Port Offset (${explicitOffset ? 'Manual' : 'Auto-detected'}): +${offset * 100}\x1b[0m`);
}
console.log('======================================================\n');

const env = {
  ...process.env,
  WORKTREE_NAME: worktreeName,
  VITE_WORKTREE_NAME: worktreeName,
};

// 1. Start Game
const gameProc = spawn('npm', ['run', 'dev', '--prefix', 'game'], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  shell: true,
  env: { ...env, PORT: String(gamePort) }
});

// 2. Start Electron Editor
const editorProc = spawn('npm', ['run', 'electron:dev', '--prefix', 'editor'], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  shell: true,
  env: { ...env, PORT: String(editorPort) }
});

const cleanup = () => {
  console.log('\n🛑 Shutting down dev servers...');
  try { gameProc.kill(); } catch {}
  try { editorProc.kill(); } catch {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
