import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_OFFSET,
  computeOffset,
  detectWorktree,
  findFreeOffset,
  hashString,
  resolvePorts,
  resolveRuntime,
} from './worktree.mjs';

/** Fake `exec`: responses keyed by "arg1 arg2 ..."; Error values are thrown. */
function fakeExec(responses) {
  return (command, args) => {
    assert.equal(command, 'git');
    const key = args.join(' ');
    if (!(key in responses)) throw new Error(`unexpected git call: ${key}`);
    const r = responses[key];
    if (r instanceof Error) throw r;
    return r;
  };
}
const identity = (p) => p;
const fail = new Error('fatal');

const mainRepo = {
  'rev-parse --show-toplevel': '/repo',
  'rev-parse --git-dir': '.git',
  'rev-parse --git-common-dir': '.git',
  'rev-parse --abbrev-ref HEAD': 'main',
};
const linked = {
  'rev-parse --show-toplevel': '/wt/feature-x',
  'rev-parse --git-dir': '/repo/.git/worktrees/feature-x',
  'rev-parse --git-common-dir': '/repo/.git',
  'rev-parse --abbrev-ref HEAD': 'feature/x',
};

// ---------- detectWorktree ----------

test('detectWorktree: main checkout (git-dir == common-dir, relative paths)', () => {
  const info = detectWorktree({ cwd: '/repo', exec: fakeExec(mainRepo), realpath: identity });
  assert.equal(info.inGit, true);
  assert.equal(info.isWorktree, false);
  assert.equal(info.name, 'main');
  assert.equal(info.root, '/repo');
});

test('detectWorktree: linked worktree (git-dir != common-dir) is named after its branch', () => {
  const info = detectWorktree({ cwd: '/wt/feature-x', exec: fakeExec(linked), realpath: identity });
  assert.equal(info.isWorktree, true);
  assert.equal(info.name, 'feature/x');
  assert.equal(info.root, '/wt/feature-x');
});

test('detectWorktree: detached HEAD becomes detached@<shortsha>', () => {
  const exec = fakeExec({ ...linked, 'rev-parse --abbrev-ref HEAD': 'HEAD', 'rev-parse --short HEAD': 'abc1234' });
  const info = detectWorktree({ cwd: '/wt/feature-x', exec, realpath: identity });
  assert.equal(info.name, 'detached@abc1234');
  assert.equal(info.isWorktree, true);
});

test('detectWorktree: repository without commits falls back to symbolic-ref', () => {
  const exec = fakeExec({
    ...mainRepo,
    'rev-parse --abbrev-ref HEAD': fail,
    'symbolic-ref --short -q HEAD': 'trunk',
  });
  assert.equal(detectWorktree({ cwd: '/repo', exec, realpath: identity }).name, 'trunk');
});

test('detectWorktree: git unavailable / not a repo -> basename, offset 0', () => {
  const exec = () => {
    throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
  };
  const info = detectWorktree({ cwd: '/some/dir/my-project', exec, realpath: identity });
  assert.equal(info.inGit, false);
  assert.equal(info.isWorktree, false);
  assert.equal(info.name, 'my-project');
  assert.equal(computeOffset(info), 0);
});

test('detectWorktree: compares real paths (symlinked git dirs are still equal)', () => {
  const realpath = (p) => p.replace('/link', '/real');
  const exec = fakeExec({ ...mainRepo, 'rev-parse --git-dir': '/link/.git', 'rev-parse --git-common-dir': '/real/.git' });
  assert.equal(detectWorktree({ cwd: '/repo', exec, realpath }).isWorktree, false);
});

test('detectWorktree: no substring matching - sibling dir with shared prefix is not confused', () => {
  const a = detectWorktree({ cwd: '/wt/app', exec: fakeExec({ ...linked, 'rev-parse --show-toplevel': '/wt/app' }), realpath: identity });
  const b = detectWorktree({ cwd: '/wt/app-2', exec: fakeExec({ ...linked, 'rev-parse --show-toplevel': '/wt/app-2' }), realpath: identity });
  assert.notEqual(computeOffset(a), computeOffset(b));
});

// ---------- computeOffset / hash ----------

test('computeOffset: main/non-git is 0', () => {
  assert.equal(computeOffset({ isWorktree: false, root: '/x' }), 0);
});

test('computeOffset: deterministic and always within 1..MAX_OFFSET', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const root = `/tmp/worktrees/wt-${i}`;
    const o = computeOffset({ isWorktree: true, root });
    assert.equal(o, computeOffset({ isWorktree: true, root }));
    assert.ok(Number.isInteger(o) && o >= 1 && o <= MAX_OFFSET, `offset ${o} out of range`);
    seen.add(o);
  }
  assert.ok(seen.size > MAX_OFFSET * 0.9, 'hash should spread over the whole range');
  assert.equal(hashString('a'), hashString('a'));
  assert.notEqual(hashString('a'), hashString('b'));
});

test('computeOffset: depends only on the root path, not on branch or siblings', () => {
  const a = computeOffset({ isWorktree: true, root: '/w/one', name: 'x' });
  const b = computeOffset({ isWorktree: true, root: '/w/one', name: 'renamed-branch' });
  assert.equal(a, b);
});

// ---------- resolvePorts ----------

test('resolvePorts: offset formula and env override precedence', () => {
  assert.deepEqual(resolvePorts({ offset: 0 }), {
    offset: 0, gamePort: 5175, editorPort: 5174, gameOverridden: false, editorOverridden: false,
  });
  const p = resolvePorts({ offset: 2 });
  assert.equal(p.gamePort, 5375);
  assert.equal(p.editorPort, 5374);
  const o = resolvePorts({ offset: 2, env: { GAME_PORT: '7001', PORT: '7002' } });
  assert.equal(o.gamePort, 7001);
  assert.equal(o.editorPort, 7002);
  assert.equal(o.gameOverridden && o.editorOverridden, true);
  assert.equal(resolvePorts({ offset: 1, env: { GAME_PORT: '' } }).gamePort, 5275);
});

test('resolvePorts: rejects invalid ports', () => {
  assert.throws(() => resolvePorts({ offset: 0, env: { PORT: 'abc' } }), /PORT/);
  assert.throws(() => resolvePorts({ offset: 0, env: { GAME_PORT: '70000' } }), /out of range/);
  assert.throws(() => resolvePorts({ offset: 9999 }), /out of range/);
});

// ---------- findFreeOffset ----------

const portsFor = (o) => [5175 + o * 100, 5174 + o * 100];

test('findFreeOffset: returns start when free', async () => {
  assert.equal(await findFreeOffset({ start: 7, portsFor, isPortFree: async () => true }), 7);
});

test('findFreeOffset: linear-probes past busy game OR editor port, wrapping at the end', async () => {
  const busy = new Set([5175 + 5 * 100, 5174 + 6 * 100]);
  const isPortFree = async (p) => !busy.has(p);
  assert.equal(await findFreeOffset({ start: 5, portsFor, isPortFree }), 7);

  const busyEnd = new Set([5175 + 99 * 100]);
  assert.equal(await findFreeOffset({ start: 99, portsFor, isPortFree: async (p) => !busyEnd.has(p) }), 1);
});

test('findFreeOffset: null when nothing is free', async () => {
  assert.equal(await findFreeOffset({ start: 1, maxOffset: 5, portsFor, isPortFree: async () => false }), null);
});

// ---------- resolveRuntime ----------

const wt = (root = '/w/one') => ({ isWorktree: true, inGit: true, name: 'b', root });
const allFree = async () => true;

test('resolveRuntime: main checkout -> offset 0, source main', async () => {
  const r = await resolveRuntime({ info: { isWorktree: false }, env: {}, isPortFree: allFree });
  assert.equal(r.offset, 0);
  assert.equal(r.source, 'main');
  assert.equal(r.gamePort, 5175);
});

test('resolveRuntime: worktree uses its hashed offset when free', async () => {
  const info = wt();
  const r = await resolveRuntime({ info, env: {}, isPortFree: allFree });
  assert.equal(r.offset, computeOffset(info));
  assert.equal(r.source, 'hash');
  assert.equal(r.probed, false);
});

test('resolveRuntime: busy preferred ports -> probes to next free offset and flags it', async () => {
  const info = wt();
  const pref = computeOffset(info);
  const r = await resolveRuntime({
    info, env: {},
    isPortFree: async (p) => p !== 5175 + pref * 100,
  });
  assert.equal(r.offset, (pref % MAX_OFFSET) + 1);
  assert.equal(r.probed, true);
  assert.equal(r.source, 'probed');
  assert.equal(r.preferredOffset, pref);
  assert.deepEqual(r.busy, []);
});

test('resolveRuntime: precedence --offset > PORT_OFFSET > auto; explicit offsets are never probed', async () => {
  const info = wt();
  const env = { PORT_OFFSET: '4' };
  assert.equal((await resolveRuntime({ info, cliOffset: 2, env, isPortFree: allFree })).offset, 2);
  assert.equal((await resolveRuntime({ info, env, isPortFree: allFree })).offset, 4);
  const busy = await resolveRuntime({ info, cliOffset: 2, env: {}, isPortFree: async (p) => p !== 5375 });
  assert.equal(busy.offset, 2);
  assert.equal(busy.source, 'cli');
  assert.deepEqual(busy.busy, [{ name: 'game', port: 5375 }]);
  // --offset 0 is a real explicit value (not "unset")
  assert.equal((await resolveRuntime({ info, cliOffset: 0, env: {}, isPortFree: allFree })).offset, 0);
});

test('resolveRuntime: GAME_PORT / PORT override ports; overridden ports are not used for probing', async () => {
  const info = wt();
  const pref = computeOffset(info);
  // GAME_PORT overridden to a busy port: probing ignores it (only editor port considered)
  const r = await resolveRuntime({
    info, env: { GAME_PORT: '6000' },
    isPortFree: async (p) => p !== 6000,
  });
  assert.equal(r.offset, pref);
  assert.equal(r.gamePort, 6000);
  assert.deepEqual(r.busy, [{ name: 'game', port: 6000 }]);
  const r2 = await resolveRuntime({ info: { isWorktree: false }, env: { PORT: '6100', GAME_PORT: '6101' }, isPortFree: allFree });
  assert.equal(r2.editorPort, 6100);
  assert.equal(r2.gamePort, 6101);
});

test('resolveRuntime: invalid PORT_OFFSET and exhausted range throw', async () => {
  await assert.rejects(resolveRuntime({ info: wt(), env: { PORT_OFFSET: 'x' }, isPortFree: allFree }), /PORT_OFFSET/);
  await assert.rejects(resolveRuntime({ info: wt(), env: {}, isPortFree: async () => false }), /No free port offset/);
});
