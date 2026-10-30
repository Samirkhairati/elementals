import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultWorktreesDir,
  describeWorktree,
  parseArgs,
  parseWorktreeList,
  resolveTarget,
  slugify,
} from './lib/wt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────

const PORCELAIN = `worktree /repo
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main

worktree /wts/feature-a
HEAD 2222222222222222222222222222222222222222
branch refs/heads/feature/a

worktree /wts/detached
HEAD 3333333333333333333333333333333333333333
detached

worktree /wts/gone
HEAD 4444444444444444444444444444444444444444
branch refs/heads/gone
prunable gitdir file points to non-existent location
`;

test('parseWorktreeList: main first, branches, detached and prunable entries', () => {
  const list = parseWorktreeList(PORCELAIN);
  assert.equal(list.length, 4);
  assert.deepEqual(
    list.map((w) => [w.name, w.isMain, w.detached, w.prunable]),
    [
      ['main', true, false, false],
      ['feature/a', false, false, false],
      ['detached@3333333', false, true, false],
      ['gone', false, false, true],
    ],
  );
  assert.equal(list[1].path, '/wts/feature-a');
});

test('slugify makes directory-safe names', () => {
  assert.equal(slugify('feature/foo bar'), 'feature-foo-bar');
  assert.equal(slugify('  ..weird//'), 'weird');
  assert.equal(slugify('///'), 'worktree');
  assert.equal(slugify('v1.2_ok'), 'v1.2_ok');
});

test('defaultWorktreesDir: sibling dir unless overridden', () => {
  assert.equal(defaultWorktreesDir('/a/b/elementals', {}), '/a/b/elementals-worktrees');
  assert.equal(defaultWorktreesDir('/a/b/elementals', { ELEMENTALS_WORKTREES_DIR: '/x/y' }), '/x/y');
  assert.equal(defaultWorktreesDir('/a/b/elementals', { ELEMENTALS_WORKTREES_DIR: '  ' }), '/a/b/elementals-worktrees');
});

test('resolveTarget: index, exact, directory name, prefix, ambiguity, misses', () => {
  const list = parseWorktreeList(PORCELAIN);
  assert.equal(resolveTarget(list, '1').wt.name, 'main');
  assert.equal(resolveTarget(list, '2').wt.name, 'feature/a');
  assert.match(resolveTarget(list, '9').error, /No worktree number 9/);
  assert.equal(resolveTarget(list, 'feature/a').wt.name, 'feature/a');
  assert.equal(resolveTarget(list, 'feature-a').wt.name, 'feature/a'); // directory name
  assert.equal(resolveTarget(list, 'FEAT').wt.name, 'feature/a'); // case-insensitive prefix
  assert.equal(resolveTarget(list, 'det').wt.name, 'detached@3333333');
  assert.match(resolveTarget(list, 'nope').error, /No worktree matches/);
  assert.match(resolveTarget(list, '').error, /No worktree given/);
  const ambiguous = parseWorktreeList('worktree /r\nbranch refs/heads/main\n\nworktree /w/other\nbranch refs/heads/make\n');
  assert.match(resolveTarget(ambiguous, 'ma').error, /ambiguous/);
  assert.equal(resolveTarget(ambiguous, 'main').wt.name, 'main'); // exact wins over prefix
});

test('parseArgs: command, target, flags, passthrough', () => {
  const a = parseArgs(['run', 'feat', '--yes', '--', '--offset', '3']);
  assert.equal(a.command, 'run');
  assert.equal(a.target, 'feat');
  assert.equal(a.flags.yes, true);
  assert.deepEqual(a.passthrough, ['--offset', '3']);

  const b = parseArgs(['new', 'x', '--from', 'main', '--no-install']);
  assert.deepEqual(b.flags, { from: 'main', 'no-install': true });

  assert.equal(parseArgs(['list', '--json']).flags.json, true);
  assert.equal(parseArgs(['-h']).flags.help, true);
  assert.deepEqual(parseArgs([]).positional, []);
  assert.throws(() => parseArgs(['new', 'x', '--from']), /needs a value/);
});

test('describeWorktree: missing directories are reported, not probed', async () => {
  const [, , , gone] = parseWorktreeList(PORCELAIN);
  const d = await describeWorktree(gone, { exists: () => false, isPortFree: () => assert.fail('must not probe') });
  assert.equal(d.present, false);
  assert.equal(d.running, false);
});

test('describeWorktree: ports, running, installs, dirty and runner flags (all injected)', async () => {
  const wt = { name: 'feature/a', path: '/wts/feature-a', isMain: false, prunable: false };
  const calls = [];
  const exec = (cmd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'status') return ' M file.txt';
    throw new Error('unexpected');
  };
  const detect = () => ({ inGit: true, isWorktree: true, name: 'feature/a', branch: 'feature/a', toplevel: '/wts/feature-a', root: '/wts/feature-a' });
  const d = await describeWorktree(wt, {
    exists: (p) => p === '/wts/feature-a' || p.endsWith(path.join('scripts', 'dev.mjs')),
    exec,
    detect,
    isPortFree: async () => false, // both busy
  });
  assert.equal(d.running, true);
  assert.deepEqual(d.portsBusy, ['game', 'editor']);
  assert.equal(d.dirty, true);
  assert.equal(d.hasRunner, true);
  assert.ok(d.missingInstalls.length >= 1, 'no node_modules exist => problems reported');
  assert.ok(d.offset >= 1 && d.offset <= 99);
  assert.equal(d.gamePort, 5175 + d.offset * 100);
  assert.equal(d.editorPort, 5174 + d.offset * 100);

  const half = await describeWorktree(wt, {
    exists: () => true,
    exec: () => '',
    detect,
    isPortFree: async (p) => p !== 5175 + d.offset * 100, // only the game port busy
  });
  assert.equal(half.running, false, 'one busy port alone is not "running"');
  assert.deepEqual(half.portsBusy, ['game']);
  assert.equal(half.dirty, false);
});

// ── CLI against a throwaway repository ────────────────────────────────────────────────────────

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

function makeRepo(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'elementals');
  const wtDir = path.join(base, 'trees');
  fs.mkdirSync(path.join(repo, 'scripts', 'lib'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');

  for (const f of ['wt.mjs', 'lib/wt.mjs', 'lib/installs.mjs', 'lib/worktree.mjs']) {
    fs.copyFileSync(path.join(HERE, f), path.join(repo, 'scripts', f));
  }
  fs.writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  // Fake runner: report where/how it was started, then exit.
  fs.writeFileSync(
    path.join(repo, 'scripts', 'dev.mjs'),
    `console.log('FAKE-DEV ' + JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), port: process.env.PORT ?? null, name: process.env.WORKTREE_NAME ?? null }));\n`,
  );
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');

  const wt = (...args) => {
    const r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'wt.mjs'), ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, ELEMENTALS_WORKTREES_DIR: wtDir, NO_COLOR: '1', PORT: '4242', WORKTREE_NAME: 'leaked' },
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  return { repo, wtDir, wt };
}

function stubInstalls(dir) {
  fs.mkdirSync(path.join(dir, 'game', 'node_modules', 'vite'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'editor', 'node_modules', 'vite'), { recursive: true });
  const electron = path.join(dir, 'editor', 'node_modules', 'electron');
  fs.mkdirSync(path.join(electron, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(electron, 'path.txt'), 'bin');
  fs.writeFileSync(path.join(electron, 'dist', 'bin'), '');
}

test('cli: list --json shows the main checkout; help prints usage', (t) => {
  const { repo, wt } = makeRepo(t);
  const list = JSON.parse(wt('list', '--json').out);
  assert.equal(list.length, 1);
  assert.equal(list[0].isMain, true);
  assert.equal(list[0].name, 'main');
  assert.equal(list[0].path, repo);
  assert.equal(list[0].gamePort, 5175);
  assert.equal(list[0].hasRunner, true);
  assert.ok(wt('--help').out.includes('Elementals worktree launcher'));
  assert.ok(wt().out.includes('main'), 'non-interactive default prints the table');
});

test('cli: new creates a worktree in the configured dir; list/ports; duplicates and bad names fail', (t) => {
  const { wtDir, wt } = makeRepo(t);
  const res = wt('new', 'feature/x', '--no-install');
  assert.equal(res.code, 0, res.err);
  const dir = path.join(wtDir, 'feature-x');
  assert.ok(fs.existsSync(path.join(dir, 'scripts', 'dev.mjs')));
  assert.equal(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feature/x');

  const list = JSON.parse(wt('list', '--json').out);
  assert.equal(list.length, 2);
  const created = list.find((w) => w.name === 'feature/x');
  assert.ok(created.offset >= 1 && created.offset <= 99);
  assert.equal(created.gamePort, 5175 + created.offset * 100);
  assert.ok(created.missingInstalls.length > 0, 'fresh worktree has no node_modules yet');

  assert.equal(wt('new', 'feature/x', '--no-install').code, 1, 'already exists');
  assert.match(wt('new', 'bad..name', '--no-install').err, /not a valid branch name/);
  assert.equal(wt('new').code, 1);
});

test('cli: new from an existing local branch and from --from', (t) => {
  const { repo, wtDir, wt } = makeRepo(t);
  git(repo, 'branch', 'existing');
  assert.equal(wt('new', 'existing', '--no-install').code, 0);
  assert.equal(git(path.join(wtDir, 'existing'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'existing');
  git(repo, 'branch', 'base');
  assert.equal(wt('new', 'child', '--from', 'base', '--no-install').code, 0);
  assert.equal(git(path.join(wtDir, 'child'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'child');
});

test('cli: run starts that worktree\'s own dev.mjs in its directory without leaking env', (t) => {
  const { wtDir, wt } = makeRepo(t);
  assert.equal(wt('new', 'feat-run', '--no-install').code, 0);
  const dir = path.join(wtDir, 'feat-run');

  // missing dependencies: refuses (not a TTY, so it cannot ask)
  const blocked = wt('run', 'feat-run');
  assert.equal(blocked.code, 1);
  assert.match(blocked.out + blocked.err, /Dependencies are missing|not a terminal/);

  stubInstalls(dir);
  const res = wt('run', 'feat-run', '--yes', '--', '--dry-run');
  assert.equal(res.code, 0, res.err + res.out);
  const line = res.out.split('\n').find((l) => l.startsWith('FAKE-DEV '));
  assert.ok(line, res.out);
  const info = JSON.parse(line.slice('FAKE-DEV '.length));
  assert.equal(fs.realpathSync(info.cwd), dir);
  assert.deepEqual(info.args, ['--dry-run']);
  assert.equal(info.port, null, 'PORT from the parent shell must not leak');
  assert.equal(info.name, null, 'WORKTREE_NAME from the parent shell must not leak');

  // shorthand and prefix matching
  assert.equal(wt('feat-r', '--yes').code, 0);
});

test('cli: run refuses worktrees without a dev runner and unknown targets', (t) => {
  const { wtDir, wt } = makeRepo(t);
  assert.equal(wt('new', 'old', '--no-install').code, 0);
  const dir = path.join(wtDir, 'old');
  stubInstalls(dir);
  fs.rmSync(path.join(dir, 'scripts', 'dev.mjs'));
  const res = wt('run', 'old', '--yes');
  assert.equal(res.code, 1);
  assert.match(res.err, /no scripts\/dev\.mjs/);

  const missing = wt('run', 'does-not-exist');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No worktree matches/);
});

test('cli: rm refuses main, dirty and running-unless-forced; removes clean worktrees (ignored files ok)', (t) => {
  const { repo, wtDir, wt } = makeRepo(t);
  assert.equal(wt('rm', 'main', '--yes').code, 1);

  assert.equal(wt('new', 'to-remove', '--no-install').code, 0);
  const dir = path.join(wtDir, 'to-remove');
  stubInstalls(dir); // gitignored node_modules must not block removal

  // needs confirmation; non-TTY without --yes fails and keeps the worktree
  const noConfirm = wt('rm', 'to-remove');
  assert.equal(noConfirm.code, 1);
  assert.ok(fs.existsSync(dir));

  // dirty => refused
  fs.writeFileSync(path.join(dir, 'scratch.txt'), 'x');
  const dirty = wt('rm', 'to-remove', '--yes');
  assert.equal(dirty.code, 1);
  assert.match(dirty.err, /uncommitted changes/);
  assert.ok(fs.existsSync(dir));

  // clean => removed, branch kept
  fs.rmSync(path.join(dir, 'scratch.txt'));
  const ok = wt('rm', 'to-remove', '--yes');
  assert.equal(ok.code, 0, ok.err);
  assert.ok(!fs.existsSync(dir));
  assert.equal(git(repo, 'branch', '--list', 'to-remove').includes('to-remove'), true);
  assert.equal(JSON.parse(wt('list', '--json').out).length, 1);

  // --force discards dirty work
  assert.equal(wt('new', 'forced', '--no-install').code, 0);
  fs.writeFileSync(path.join(wtDir, 'forced', 'scratch.txt'), 'x');
  assert.equal(wt('rm', 'forced', '--yes', '--force').code, 0);
  assert.ok(!fs.existsSync(path.join(wtDir, 'forced')));
});
