import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createSupervisor, createTreeKiller, exitCodeFor } from './supervisor.mjs';

const isWin = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(25);
  }
  throw new Error('waitFor timed out');
}
const tmpDirs = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-test-'));
  tmpDirs.push(d);
  return d;
};
after(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// A child that spawns a grandchild (like `npm run` -> sh -> vite) and records its pid.
const PARENT = `
const { spawn } = require('child_process');
const fs = require('fs');
const g = spawn(process.execPath, ['-e', process.env.GRANDCHILD || 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
fs.writeFileSync(process.argv[1], String(g.pid));
setInterval(() => {}, 1000);
`;
const readPid = (file) => waitFor(() => (fs.existsSync(file) && fs.readFileSync(file, 'utf8')) || null).then(Number);

test('exitCodeFor: code wins, signal maps to 128+n, otherwise 1', () => {
  assert.equal(exitCodeFor(3, null), 3);
  assert.equal(exitCodeFor(0, null), 0);
  assert.equal(exitCodeFor(null, 'SIGTERM'), 143);
  assert.equal(exitCodeFor(null, 'SIGKILL'), 137);
  assert.equal(exitCodeFor(null, null), 1);
});

test('createTreeKiller (posix): signals the negative pid for detached entries', () => {
  const calls = [];
  const t = createTreeKiller('linux', { kill: (pid, sig) => calls.push([pid, sig]) });
  t.signal({ pid: 42, detached: true }, 'SIGTERM');
  t.signal({ pid: 43, detached: false }, 'SIGKILL');
  assert.deepEqual(calls, [[-42, 'SIGTERM'], [43, 'SIGKILL']]);
});

test('createTreeKiller (win32): uses taskkill /T /F', () => {
  const runs = [];
  const t = createTreeKiller('win32', { run: (...a) => runs.push(a) });
  t.signal({ pid: 7 }, 'SIGTERM');
  assert.deepEqual(runs[0].slice(0, 2), ['taskkill', ['/pid', '7', '/T', '/F']]);
});

test('shutdown kills the whole process tree (child AND grandchild)', { skip: isWin }, async () => {
  const dir = tmp();
  const pidFile = path.join(dir, 'gc.pid');
  const sup = createSupervisor({ graceMs: 2000 });
  const entry = sup.start('parent', process.execPath, ['-e', PARENT, pidFile]);
  const gcPid = await readPid(pidFile);
  assert.ok(isAlive(entry.pid) && isAlive(gcPid));

  const code = await sup.shutdown(0);
  assert.equal(code, 0);
  await waitFor(() => !isAlive(gcPid));
  assert.equal(isAlive(entry.pid), false);
  assert.equal(isAlive(gcPid), false);
});

test('a TERM-ignoring grandchild is SIGKILLed after the grace period', { skip: isWin }, async () => {
  const dir = tmp();
  const pidFile = path.join(dir, 'gc.pid');
  const sup = createSupervisor({ graceMs: 300 });
  sup.start('parent', process.execPath, ['-e', PARENT, pidFile], {
    env: { ...process.env, GRANDCHILD: "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)" },
  });
  const gcPid = await readPid(pidFile);
  await sleep(200); // let the grandchild install its SIGTERM handler
  await sup.shutdown(0);
  await waitFor(() => !isAlive(gcPid));
  assert.equal(isAlive(gcPid), false);
});

test('when one child exits with a failure the other is stopped and its code is returned', async () => {
  const messages = [];
  const sup2 = createSupervisor({ graceMs: 2000, log: (m) => messages.push(m) });
  const long = sup2.start('long', process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  sup2.start('failing', process.execPath, ['-e', 'setTimeout(()=>process.exit(3),300)']);
  const code = await sup2.done;
  assert.equal(code, 3);
  await waitFor(() => !isAlive(long.pid));
  assert.ok(messages.some((m) => /failing.*code 3/.test(m)));
});

test('a clean exit (e.g. window closed, code 0) also stops the other child, exit 0', async () => {
  const sup = createSupervisor({ graceMs: 2000 });
  const long = sup.start('long', process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  sup.start('quits', process.execPath, ['-e', 'setTimeout(()=>process.exit(0),200)']);
  assert.equal(await sup.done, 0);
  await waitFor(() => !isAlive(long.pid));
});

test('leftover grandchildren of a child that exited by itself are cleaned up too', { skip: isWin }, async () => {
  const dir = tmp();
  const pidFile = path.join(dir, 'gc.pid');
  const sup = createSupervisor({ graceMs: 2000 });
  // leader spawns grandchild then exits with 5, leaving the grandchild behind
  const code = `
    const { spawn } = require('child_process');
    const g = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    require('fs').writeFileSync(process.argv[1], String(g.pid));
    setTimeout(() => process.exit(5), 300);`;
  sup.start('leader', process.execPath, ['-e', code, pidFile]);
  const gcPid = await readPid(pidFile);
  assert.equal(await sup.done, 5);
  await waitFor(() => !isAlive(gcPid));
  assert.equal(isAlive(gcPid), false);
});

test('non-detached mode (nested under dev.mjs) still stops children', { skip: isWin }, async () => {
  const sup = createSupervisor({ detached: false, graceMs: 2000 });
  const a = sup.start('a', process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  sup.start('b', process.execPath, ['-e', 'setTimeout(()=>process.exit(2),200)']);
  assert.equal(await sup.done, 2);
  await waitFor(() => !isAlive(a.pid));
});

test('spawn failure shuts everything down with exit 1', async () => {
  const sup = createSupervisor({ graceMs: 2000 });
  const long = sup.start('long', process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  sup.start('missing', 'definitely-not-a-real-binary-xyz', []);
  assert.equal(await sup.done, 1);
  await waitFor(() => !isAlive(long.pid));
});

test('start() after shutdown throws; shutdown is idempotent', async () => {
  const sup = createSupervisor({ graceMs: 500 });
  sup.start('a', process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  const first = sup.shutdown(4);
  assert.equal(await sup.shutdown(9), 4);
  assert.equal(await first, 4);
  assert.throws(() => sup.start('b', process.execPath, ['-e', '']), /shutting down/);
});

test('installSignalHandlers: SIGTERM on the host process triggers shutdown (fake process)', async () => {
  const { EventEmitter } = await import('node:events');
  const fakeProc = new EventEmitter();
  const sup = createSupervisor({ graceMs: 1000 });
  const child = sup.start('a', process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  const uninstall = sup.installSignalHandlers(fakeProc);
  fakeProc.emit('SIGTERM');
  assert.equal(await sup.done, 0);
  await waitFor(() => !isAlive(child.pid));
  uninstall();
  assert.equal(fakeProc.listenerCount('SIGTERM'), 0);
});
