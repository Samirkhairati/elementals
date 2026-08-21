import { spawn } from 'child_process';

const port = process.env.PORT || '5174';

console.log(`\x1b[36m[Editor]\x1b[0m Starting Vite dev server on port ${port}...`);

const vite = spawn('npx', ['vite', '--port', port], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: port }
});

const electron = spawn('npx', ['wait-on', `http://localhost:${port}`, '&&', 'electron', '.'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: port }
});

const cleanup = () => {
  try { vite.kill(); } catch {}
  try { electron.kill(); } catch {}
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
electron.on('exit', () => {
  cleanup();
});
