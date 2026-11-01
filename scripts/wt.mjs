#!/usr/bin/env node
// Worktree launcher: list, start, create, install and remove git worktrees of this repo
// from one place. No dependencies, no Claude needed.
//
//   npm run wt                      interactive menu
//   npm run wt -- list [--json]
//   npm run wt -- run <worktree> [-- <dev.mjs args>]
//   npm run wt -- new <branch> [--from <base>] [--no-install]
//   npm run wt -- install <worktree>
//   npm run wt -- rm <worktree> [--force] [--yes]
//
// <worktree> = list number, branch name, directory name, or a unique prefix of those.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { formatInstallProblems } from './lib/installs.mjs';
import {
  defaultWorktreesDir,
  describeWorktree,
  parseArgs,
  parseWorktreeList,
  resolveTarget,
  slugify,
} from './lib/wt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'), cyan: paint('36') };

const HELP = `Elementals worktree launcher

Usage:
  npm run wt                          interactive menu
  npm run wt -- list [--json]         show worktrees, ports and status
  npm run wt -- run <worktree> [-- args]   start game + editor for that worktree
  npm run wt -- new <branch> [--from <base>] [--no-install]
  npm run wt -- install <worktree>    npm install game + editor in that worktree
  npm run wt -- rm <worktree> [--force] [--yes]

<worktree> is the list number, branch name, directory name, or a unique prefix.
New worktrees go to ${defaultWorktreesDir(ROOT, process.env)}
(override with ELEMENTALS_WORKTREES_DIR).

Shortcut for any terminal (add to ~/.zshrc):
  alias wt='node ${path.join(ROOT, 'scripts', 'wt.mjs')}'
`;

class CliError extends Error {}
const fail = (message) => {
  throw new CliError(message);
};

function git(args, cwd = ROOT) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const detail = String(e.stderr || e.message || '').trim();
    throw new CliError(detail || `git ${args.join(' ')} failed`);
  }
}

const gitOk = (args) => {
  try {
    execFileSync('git', args, { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

function listWorktrees() {
  return parseWorktreeList(git(['worktree', 'list', '--porcelain'])).filter((w) => !w.bare);
}

async function describeAll() {
  const list = listWorktrees();
  return Promise.all(list.map((w) => describeWorktree(w)));
}

// ── Output ──────────────────────────────────────────────────────────────────────────────────────

function statusBadges(w) {
  if (!w.present) return [c.red('missing on disk (run: git worktree prune)')];
  const badges = [w.running ? c.green('● running') : c.dim('○ stopped')];
  if (w.missingInstalls.some((p) => p.pkg === 'node')) badges.push(c.yellow('wrong Node'));
  else if (w.missingInstalls.length) badges.push(c.yellow('deps missing'));
  if (!w.hasRunner) badges.push(c.red('no dev runner (merge main into it)'));
  if (w.dirty) badges.push(c.yellow('uncommitted changes'));
  return badges;
}

function printTable(list) {
  const nameWidth = Math.max(8, ...list.map((w) => w.name.length));
  console.log(c.bold('\nElementals worktrees'));
  list.forEach((w, i) => {
    const num = String(i + 1).padStart(2);
    const ports = w.present ? `game :${w.gamePort}  editor :${w.editorPort}` : '';
    const kind = w.isMain ? c.cyan(' (main checkout)') : '';
    console.log(`${c.bold(num)}  ${w.name.padEnd(nameWidth)}  ${ports}  ${statusBadges(w).join('  ')}${kind}`);
    console.log(`    ${c.dim(w.path)}`);
  });
  console.log('');
}

// ── Prompts ─────────────────────────────────────────────────────────────────────────────────────

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function confirm(question, { yes = false, defaultYes = false } = {}) {
  if (yes) return true;
  if (!isTTY) fail(`${question} — not a terminal; pass --yes to confirm.`);
  const answer = (await ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
  if (answer === '') return defaultYes;
  return answer === 'y' || answer === 'yes';
}

// ── Actions ─────────────────────────────────────────────────────────────────────────────────────

function npmCommand() {
  return process.platform === 'win32' ? { cmd: 'npm.cmd', shell: true } : { cmd: 'npm', shell: false };
}

function installDeps(wt) {
  const { cmd, shell } = npmCommand();
  for (const pkg of ['game', 'editor']) {
    console.log(c.cyan(`\n› npm install --prefix ${pkg}  (${wt.name})`));
    const res = spawnSync(cmd, ['install', '--prefix', pkg], { cwd: wt.path, stdio: 'inherit', shell });
    if (res.status !== 0) fail(`npm install failed for ${pkg} (exit ${res.status ?? res.signal}).`);
  }
}

function pickTarget(list, query) {
  const { wt, error } = resolveTarget(list, query);
  if (error) fail(error);
  return wt;
}

// Env that would silently override the target worktree's own port/name detection.
const LEAKY_ENV = ['WORKTREE_NAME', 'VITE_WORKTREE_NAME', 'PORT', 'GAME_PORT', 'PORT_OFFSET'];

async function runWorktree(query, flags, passthrough) {
  const list = await describeAll();
  const wt = pickTarget(list, query);

  if (!wt.present) fail(`${wt.name}: directory is missing (${wt.path}). Run: git worktree prune`);
  if (!wt.hasRunner) {
    fail(`${wt.name}: has no scripts/dev.mjs (older branch). Merge main into it first:\n  git -C "${wt.path}" merge main`);
  }

  if (wt.missingInstalls.length) {
    console.log(c.yellow(formatInstallProblems(wt.missingInstalls)));
    // Installing on the wrong Node cannot work (engine-strict) and would only hide the real cause.
    if (wt.missingInstalls.some((p) => p.pkg === 'node')) fail('Switch Node first, then run this again.');
    if (await confirm('Install them now?', { yes: flags.yes, defaultYes: true })) {
      installDeps(wt);
    } else {
      fail('Cannot start without dependencies.');
    }
  }

  if (wt.running) {
    console.log(c.yellow(`${wt.name}: its ports (${wt.gamePort}/${wt.editorPort}) are already in use — it may already be running.`));
    if (!(await confirm('Start anyway?', { yes: flags.yes }))) return 0;
  }

  console.log(c.bold(`\nStarting ${c.cyan(wt.name)}  ${c.dim(wt.path)}\n`));
  const env = { ...process.env };
  for (const key of LEAKY_ENV) delete env[key];

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(wt.path, 'scripts', 'dev.mjs'), ...passthrough], {
      cwd: wt.path,
      stdio: 'inherit',
      env,
    });
    // Ctrl+C reaches the child through the terminal; stay alive until it has cleaned up.
    process.on('SIGINT', () => {});
    for (const sig of ['SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
    child.on('error', (e) => {
      console.error(c.red(`Could not start dev runner: ${e.message}`));
      resolve(1);
    });
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 + (signal === 'SIGINT' ? 2 : 15) : 1)));
  });
}

async function newWorktree(branch, flags) {
  if (!branch) fail('Usage: wt new <branch> [--from <base>] [--no-install]');
  if (!gitOk(['check-ref-format', '--branch', branch])) fail(`"${branch}" is not a valid branch name.`);

  const dir = path.join(defaultWorktreesDir(ROOT, process.env), slugify(branch));
  if (fs.existsSync(dir)) fail(`${dir} already exists.`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });

  const hasLocal = gitOk(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  const hasRemote = gitOk(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
  let args;
  if (hasLocal) args = ['worktree', 'add', dir, branch];
  else if (hasRemote && !flags.from) args = ['worktree', 'add', '--track', '-b', branch, dir, `origin/${branch}`];
  else args = ['worktree', 'add', '-b', branch, dir, flags.from || 'HEAD'];

  console.log(c.cyan(`› git ${args.join(' ')}`));
  git(args);
  const wt = { name: branch, path: dir };
  console.log(c.green(`Created ${dir}`));

  if (!flags['no-install']) installDeps(wt);
  else console.log(c.dim('Skipped npm install (run: npm run wt -- install ' + branch + ')'));
  console.log(c.bold(`\nStart it with: npm run wt -- run ${branch}`));
  return 0;
}

async function removeWorktree(query, flags) {
  const list = await describeAll();
  const wt = pickTarget(list, query);
  if (wt.isMain) fail('Refusing to remove the main checkout.');
  if (wt.running && !flags.force) fail(`${wt.name} looks like it is running (ports in use). Stop it first or pass --force.`);
  if (wt.dirty && !flags.force) fail(`${wt.name} has uncommitted changes. Commit/stash them or pass --force to discard.`);

  const warn = wt.dirty ? c.red(' It has uncommitted changes that will be LOST.') : '';
  if (!(await confirm(`Remove worktree "${wt.name}" at ${wt.path}?${warn} (the branch is kept)`, { yes: flags.yes }))) {
    console.log('Cancelled.');
    return 0;
  }
  git(['worktree', 'remove', ...(flags.force ? ['--force'] : []), wt.path]);
  console.log(c.green(`Removed ${wt.path}  (branch "${wt.branch ?? wt.name}" kept; delete with: git branch -d ${wt.branch ?? wt.name})`));
  return 0;
}

async function installWorktree(query) {
  const list = await describeAll();
  const wt = pickTarget(list, query);
  if (!wt.present) fail(`${wt.name}: directory is missing.`);
  installDeps(wt);
  console.log(c.green(`\nDependencies installed for ${wt.name}.`));
  return 0;
}

// ── Interactive menu ────────────────────────────────────────────────────────────────────────────

async function menu() {
  for (;;) {
    const list = await describeAll();
    printTable(list);
    const answer = await ask(
      `${c.bold('Run which?')} number/name   ${c.cyan('[n]')}ew  ${c.cyan('[r]')}emove  ${c.cyan('[i]')}nstall  ${c.cyan('[q]')}uit  ${c.dim('(enter = refresh)')}\n> `,
    );
    const lower = answer.toLowerCase();
    try {
      if (answer === '') continue;
      if (lower === 'q' || lower === 'quit') return 0;
      if (lower === 'n' || lower === 'new') {
        const branch = await ask('New branch name: ');
        const from = await ask('Base (blank = current HEAD of main checkout): ');
        if (branch) await newWorktree(branch, from ? { from } : {});
      } else if (lower === 'r' || lower === 'remove') {
        const target = await ask('Remove which (number/name): ');
        if (target) await removeWorktree(target, {});
      } else if (lower === 'i' || lower === 'install') {
        const target = await ask('Install deps for which (number/name): ');
        if (target) await installWorktree(target);
      } else {
        return await runWorktree(answer, {}, []);
      }
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      console.error(c.red(`\n${e.message}`));
    }
  }
}

// ── Entry ───────────────────────────────────────────────────────────────────────────────────────

export async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(c.red(e.message));
    return 2;
  }
  const { command, target, flags, passthrough } = args;

  try {
    if (flags.help || command === 'help') {
      console.log(HELP);
      return 0;
    }
    if (!command) {
      if (!isTTY) {
        printTable(await describeAll());
        return 0;
      }
      return await menu();
    }
    switch (command) {
      case 'list':
      case 'ls': {
        const list = await describeAll();
        if (flags.json) console.log(JSON.stringify(list, null, 2));
        else printTable(list);
        return 0;
      }
      case 'run':
      case 'start':
        return await runWorktree(target, flags, passthrough);
      case 'new':
      case 'add':
        return await newWorktree(target, flags);
      case 'install':
        return await installWorktree(target);
      case 'rm':
      case 'remove':
        return await removeWorktree(target, flags);
      default:
        // `wt feature-x` is shorthand for `wt run feature-x`
        return await runWorktree(command, flags, passthrough);
    }
  } catch (e) {
    if (e instanceof CliError) {
      console.error(c.red(e.message));
      return 1;
    }
    throw e;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
