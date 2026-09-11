import { spawn } from 'child_process';

const port = process.env.PORT || '5174';

console.log(`\x1b[36m[Editor]\x1b[0m Starting Vite dev server on port ${port}...`);

const vite = spawn('npx', ['vite', '--port', port], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: port }
});

let electronProc = null;

const cleanup = () => {
  try { vite.kill(); } catch {}
  try { if (electronProc) electronProc.kill(); } catch {}
  process.exit(0);
};

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

waitForServer(`http://localhost:${port}`).then(() => {
  console.log(`\x1b[35m[Editor]\x1b[0m Vite server ready on port ${port}. Launching Electron...`);
  electronProc = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: port }
  });

  electronProc.on('exit', () => {
    cleanup();
  });
}).catch((err) => {
  console.error('\x1b[31m[Editor]\x1b[0m Failed waiting for Vite server:', err);
});

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
