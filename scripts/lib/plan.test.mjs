import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkInstalls } from './installs.mjs';
import { buildPlan, formatDryRun, npmCommand, parseArgs } from './plan.mjs';

test('parseArgs: --offset forms, flags, and errors', () => {
  assert.equal(parseArgs(['--offset', '3']).offset, 3);
  assert.equal(parseArgs(['--offset=2']).offset, 2);
  assert.equal(parseArgs(['--offset', '0']).offset, 0);
  assert.equal(parseArgs([]).offset, null);
  const f = parseArgs(['--list', '--dry-run', '--json', '-h']);
  assert.deepEqual([f.list, f.dryRun, f.json, f.help], [true, true, true, true]);
  assert.throws(() => parseArgs(['--offset']), /--offset/);
  assert.throws(() => parseArgs(['--offset', 'abc']), /--offset/);
  assert.throws(() => parseArgs(['--bogus']), /Unknown/);
});

test('npmCommand: npm.cmd via shell on win32, plain npm elsewhere', () => {
  assert.deepEqual(npmCommand('win32'), { command: 'npm.cmd', shell: true });
  assert.deepEqual(npmCommand('darwin'), { command: 'npm', shell: false });
  assert.deepEqual(npmCommand('linux'), { command: 'npm', shell: false });
});

const gitMain = (_c, args) => {
  const key = args.join(' ');
  const r = {
    'rev-parse --show-toplevel': '/repo',
    'rev-parse --git-dir': '.git',
    'rev-parse --git-common-dir': '.git',
    'rev-parse --abbrev-ref HEAD': 'main',
  }[key];
  if (r === undefined) throw new Error(key);
  return r;
};
const base = {
  rootDir: '/repo',
  exec: gitMain,
  realpath: (p) => p,
  isPortFree: async () => true,
  exists: () => true,
  readFile: () => 'electron',
};

test('buildPlan: exports the full env contract to both children', async () => {
  const plan = await buildPlan({ ...base, argv: ['--offset', '2'], env: {} });
  const [game, editor] = plan.commands;
  assert.equal(game.env.GAME_PORT, '5375');
  assert.equal(game.env.PORT, '5375');
  assert.equal(editor.env.PORT, '5374');
  assert.equal(editor.env.GAME_PORT, '5375');
  for (const c of plan.commands) {
    assert.equal(c.env.WORKTREE_NAME, 'main');
    assert.equal(c.env.VITE_WORKTREE_NAME, 'main');
  }
  assert.deepEqual(game.args, ['run', 'dev', '--prefix', 'game']);
  assert.deepEqual(editor.args, ['run', 'electron:dev', '--prefix', 'editor']);
  assert.equal(plan.urls.game, 'http://localhost:5375');
  assert.match(formatDryRun(plan), /npm run electron:dev --prefix editor/);
});

test('buildPlan: WORKTREE_NAME env wins; GAME_PORT/PORT override', async () => {
  const plan = await buildPlan({
    ...base, argv: [], env: { WORKTREE_NAME: 'custom', GAME_PORT: '7001', PORT: '7002' },
  });
  assert.equal(plan.worktreeName, 'custom');
  assert.equal(plan.commands[0].env.WORKTREE_NAME, 'custom');
  assert.equal(plan.commands[0].env.GAME_PORT, '7001');
  assert.equal(plan.commands[1].env.PORT, '7002');
});

test('buildPlan: reports busy ports and win32 npm.cmd', async () => {
  const plan = await buildPlan({ ...base, platform: 'win32', isPortFree: async (p) => p !== 5174, argv: [], env: {} });
  assert.deepEqual(plan.runtime.busy, [{ name: 'editor', port: 5174 }]);
  assert.equal(plan.commands[0].command, 'npm.cmd');
  assert.equal(plan.commands[0].shell, true);
});

test('checkInstalls: actionable messages for each missing piece', () => {
  const files = new Set();
  const exists = (p) => files.has(p);
  const readFile = () => 'dist/electron';
  let problems = checkInstalls('/r', { exists, readFile });
  assert.deepEqual(problems.map((p) => p.fix.split(' ').slice(0, 4).join(' ')), [
    'npm install --prefix game',
    'npm install --prefix editor',
  ]);
  files.add('/r/game/node_modules/vite');
  files.add('/r/editor/node_modules/vite');
  problems = checkInstalls('/r', { exists, readFile });
  assert.equal(problems.length, 1);
  assert.match(problems[0].missing, /Electron binary/);
  files.add('/r/editor/node_modules/electron/dist/dist/electron');
  assert.deepEqual(checkInstalls('/r', { exists, readFile }), []);
});
