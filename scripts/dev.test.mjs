// Integration test: real temp git repo + real `git worktree add` worktrees.
// Runs the real scripts/dev.mjs (copied into the temp repo and committed, so
// every worktree carries its own copy) with --list/--dry-run.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { computeOffset, detectWorktree } from './lib/worktree.mjs';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// env without anything that would override auto-detection
const cleanEnv = () => {
  const e = { ...process.env };
  for (const k of ['PORT', 'GAME_PORT', 'PORT_OFFSET', 'WORKTREE_NAME']) delete e[k];
  return e;
};
function dev(cwd, args, env = cleanEnv()) {
  const r = spawnSync(process.execPath, [path.join(cwd, 'scripts/dev.mjs'), ...args], { cwd, env, encoding: 'utf8' });
  return r;
}
function devJson(cwd, extra = [], env) {
  const r = dev(cwd, ['--list', '--json', ...extra], env);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

let base; // real path of the temp sandbox
let main;
let wtA;
let wtB;

before(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elementals-wt-test-')));
  main = path.join(base, 'main-repo');
  fs.mkdirSync(path.join(main, 'scripts'), { recursive: true });
  git(main, 'init', '-q', '-b', 'main');
  fs.copyFileSync(path.join(SCRIPTS, 'dev.mjs'), path.join(main, 'scripts/dev.mjs'));
  fs.cpSync(path.join(SCRIPTS, 'lib'), path.join(main, 'scripts/lib'), {
    recursive: true,
    filter: (src) => !src.endsWith('.test.mjs'),
  });
  fs.writeFileSync(path.join(main, 'package.json'), '{"type":"module"}\n');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'init');

  // Two linked worktrees whose hashed offsets differ (retry on the ~1% collision).
  const mk = (name, branch) => {
    const dir = path.join(base, name);
    git(main, 'worktree', 'add', '-q', '-b', branch, dir);
    return dir;
  };
  wtA = mk('wt-a', 'feature/a');
  for (let i = 0; ; i++) {
    wtB = mk(`wt-b${i}`, `feature/b${i}`);
    const a = computeOffset(detectWorktree({ cwd: wtA }));
    const b = computeOffset(detectWorktree({ cwd: wtB }));
    if (a !== b) break;
    git(main, 'worktree', 'remove', '--force', wtB);
    assert.ok(i < 20, 'could not find a non-colliding worktree path');
  }
});

after(() => {
  if (base) fs.rmSync(base, { recursive: true, force: true });
});

test('main checkout -> offset 0 with base ports', () => {
  const r = devJson(main);
  assert.equal(r.isWorktree, false);
  assert.equal(r.offset, 0);
  assert.equal(r.source, 'main');
  assert.equal(r.gamePort, 5175);
  assert.equal(r.editorPort, 5174);
  assert.equal(r.name, 'main');
});

test('two linked worktrees get different, stable, in-range offsets; names are branches', () => {
  const a = devJson(wtA);
  const b = devJson(wtB);
  assert.equal(a.isWorktree, true);
  assert.equal(a.name, 'feature/a');
  assert.match(b.name, /^feature\/b\d+$/);
  for (const r of [a, b]) {
    assert.ok(r.offset >= 1 && r.offset <= 99, `offset ${r.offset}`);
    assert.equal(r.gamePort, 5175 + r.offset * 100);
    assert.equal(r.editorPort, 5174 + r.offset * 100);
  }
  assert.notEqual(a.offset, b.offset);
  assert.deepEqual(devJson(wtA), a, 'repeat runs give identical results');
});

test('REGRESSION: removing a sibling worktree does not change the other worktree offset', () => {
  const bBefore = devJson(wtB).offset;
  const aBefore = devJson(wtA).offset;
  git(main, 'worktree', 'remove', '--force', wtA);
  assert.equal(devJson(wtB).offset, bBefore);
  // also: adding and pruning an unrelated worktree changes nothing
  const tmpWt = path.join(base, 'wt-temp');
  git(main, 'worktree', 'add', '-q', '-b', 'temp-branch', tmpWt);
  assert.equal(devJson(wtB).offset, bBefore);
  git(main, 'worktree', 'remove', '--force', tmpWt);
  git(main, 'worktree', 'prune');
  assert.equal(devJson(wtB).offset, bBefore);
  // re-adding the same path yields the same offset again (path-derived)
  git(main, 'worktree', 'add', '-q', '-b', 'feature/a2', wtA);
  assert.equal(devJson(wtA).offset, aBefore);
});

test('busy derived ports make the worktree probe to another free offset', async () => {
  const preferred = devJson(wtB);
  const blocker = net.createServer();
  await new Promise((res, rej) => {
    blocker.once('error', rej);
    blocker.listen(preferred.gamePort, '127.0.0.1', res);
  });
  try {
    // spawnSync would block this process's event loop but the server only needs to hold the socket
    const probed = devJson(wtB);
    assert.equal(probed.probed, true);
    assert.equal(probed.source, 'probed');
    assert.equal(probed.preferredOffset, preferred.offset);
    assert.notEqual(probed.offset, preferred.offset);
    assert.deepEqual(probed.busy, []);

    // an explicit --offset on the busy port is honoured (not probed) and reported busy
    const explicit = devJson(wtB, ['--offset', String(preferred.offset)]);
    assert.equal(explicit.offset, preferred.offset);
    assert.deepEqual(explicit.busy, [{ name: 'game', port: preferred.gamePort }]);

    // a real run refuses to start on busy ports (fake the installs so that check passes)
    for (const p of ['game/node_modules/vite', 'editor/node_modules/vite', 'editor/node_modules/electron/dist']) {
      fs.mkdirSync(path.join(wtB, p), { recursive: true });
    }
    fs.writeFileSync(path.join(wtB, 'editor/node_modules/electron/path.txt'), 'electron-bin');
    fs.writeFileSync(path.join(wtB, 'editor/node_modules/electron/dist/electron-bin'), '');
    const real = dev(wtB, ['--offset', String(preferred.offset)]);
    assert.equal(real.status, 1);
    assert.match(real.stderr, /game port \d+ already in use/);
  } finally {
    await new Promise((r) => blocker.close(r));
  }
});

test('env overrides: PORT_OFFSET, GAME_PORT, PORT, WORKTREE_NAME and --offset precedence', () => {
  const env = { ...cleanEnv(), PORT_OFFSET: '4', GAME_PORT: '5999', WORKTREE_NAME: 'custom-name' };
  const r = devJson(main, [], env);
  assert.equal(r.offset, 4);
  assert.equal(r.source, 'env');
  assert.equal(r.gamePort, 5999);
  assert.equal(r.editorPort, 5174 + 400);
  assert.equal(r.name, 'custom-name');
  assert.equal(devJson(main, ['--offset', '1'], env).offset, 1);
  assert.equal(devJson(main, [], { ...cleanEnv(), PORT: '5888' }).editorPort, 5888);
});

test('detached HEAD worktree is named detached@<sha>', () => {
  const dir = path.join(base, 'wt-detached');
  git(main, 'worktree', 'add', '-q', '--detach', dir);
  const sha = git(main, 'rev-parse', '--short', 'HEAD');
  const r = devJson(dir);
  assert.equal(r.name, `detached@${sha}`);
  assert.equal(r.isWorktree, true);
  git(main, 'worktree', 'remove', '--force', dir);
});

test('--dry-run prints the exact commands and env contract', () => {
  const r = dev(main, ['--dry-run', '--offset', '1']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /npm run dev --prefix game/);
  assert.match(r.stdout, /npm run electron:dev --prefix editor/);
  for (const v of ['WORKTREE_NAME=main', 'VITE_WORKTREE_NAME=main', 'GAME_PORT=5275', 'PORT=5274']) {
    assert.ok(r.stdout.includes(v), `missing ${v}`);
  }
  const j = JSON.parse(dev(main, ['--dry-run', '--json', '--offset', '1']).stdout);
  assert.equal(j.commands.length, 2);
  assert.equal(j.commands[1].env.PORT, '5274');
});

test('missing node_modules: real run exits non-zero with an actionable message', () => {
  const r = dev(main, ['--offset', '60']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /npm install --prefix game/);
  assert.match(r.stderr, /npm install --prefix editor/);
});

test('git unavailable: falls back to directory basename and offset 0', () => {
  const dir = path.join(base, 'plain-dir');
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(main, 'scripts/dev.mjs'), path.join(dir, 'scripts/dev.mjs'));
  fs.cpSync(path.join(main, 'scripts/lib'), path.join(dir, 'scripts/lib'), { recursive: true });
  // simulate "git missing" by emptying PATH (node is invoked by absolute path)
  const r = devJson(dir, [], { ...cleanEnv(), PATH: path.join(base, 'no-bin') });
  assert.equal(r.inGit, false);
  assert.equal(r.offset, 0);
  assert.equal(r.name, 'plain-dir');
});
