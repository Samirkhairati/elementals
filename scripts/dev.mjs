#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
let offset = 0;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--offset' && args[i + 1]) {
    offset = parseInt(args[i + 1], 10) || 0;
  } else if (args[i].startsWith('--offset=')) {
    offset = parseInt(args[i].split('=')[1], 10) || 0;
  }
}

if (process.env.PORT_OFFSET) {
  offset = parseInt(process.env.PORT_OFFSET, 10) || offset;
}

const gamePort = process.env.GAME_PORT ? parseInt(process.env.GAME_PORT, 10) : 5175 + (offset * 100);
const editorPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 5174 + (offset * 100);

console.log('\n======================================================');
console.log('🚀  \x1b[1m\x1b[32mElementals Unified Dev Server\x1b[0m');
console.log('======================================================');
console.log(`🎮  \x1b[1mGame Web App:\x1b[0m      \x1b[34mhttp://localhost:${gamePort}\x1b[0m`);
console.log(`🎨  \x1b[1mElectron Editor:\x1b[0m   \x1b[35mhttp://localhost:${editorPort}\x1b[0m (Vite dev server)`);
if (offset > 0) {
  console.log(`⚡  \x1b[33mWorktree Port Offset Active: +${offset * 100}\x1b[0m`);
}
console.log('======================================================\n');

// 1. Start Game
const gameProc = spawn('npm', ['run', 'dev', '--prefix', 'game'], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: String(gamePort) }
});

// 2. Start Electron Editor
const editorProc = spawn('npm', ['run', 'electron:dev', '--prefix', 'editor'], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: String(editorPort) }
});

const cleanup = () => {
  console.log('\n🛑 Shutting down dev servers...');
  try { gameProc.kill(); } catch {}
  try { editorProc.kill(); } catch {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
