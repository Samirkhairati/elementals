// Pure-ish planning for scripts/dev.mjs: CLI parsing, offset/port resolution
// and the exact commands + env that will be spawned.
import fs from 'node:fs';
import path from 'node:path';
import { checkInstalls } from './installs.mjs';
import {
  defaultExec,
  defaultIsPortFree,
  detectWorktree,
  resolveRuntime,
} from './worktree.mjs';

export const HELP = `Usage: node scripts/dev.mjs [options]

Starts the game (Vite) and the Electron editor (Vite + Electron) with
per-worktree ports.

Options:
  --offset N    Use port offset N (game 5175+N*100, editor 5174+N*100). No probing.
  --list        Print worktree, offset and ports, then exit (starts nothing).
  --dry-run     Print the exact commands and env that would be spawned, then exit.
  --json        With --list/--dry-run: machine-readable output.
  -h, --help    Show this help.

Environment overrides (see AGENTS.md): PORT_OFFSET, GAME_PORT, PORT, WORKTREE_NAME.
`;

export function parseArgs(argv) {
  const out = { offset: null, list: false, dryRun: false, json: false, help: false };
  const parseOffset = (v) => {
    if (v === undefined || !/^\d+$/.test(String(v))) {
      throw new Error(`--offset requires a non-negative integer, got "${v ?? ''}"`);
    }
    return Number(v);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offset') out.offset = parseOffset(argv[++i]);
    else if (a.startsWith('--offset=')) out.offset = parseOffset(a.slice('--offset='.length));
    else if (a === '--list') out.list = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

/** npm executable for a platform. win32 needs npm.cmd, which must go through a shell. */
export function npmCommand(platform = process.platform) {
  return platform === 'win32'
    ? { command: 'npm.cmd', shell: true }
    : { command: 'npm', shell: false };
}

/** The env vars dev.mjs injects (the contract shared with vite configs / Electron). */
export function buildChildEnv({ worktreeName, gamePort, editorPort }) {
  return {
    game: {
      WORKTREE_NAME: worktreeName,
      VITE_WORKTREE_NAME: worktreeName,
      GAME_PORT: String(gamePort),
      PORT: String(gamePort), // legacy: game/vite.config.ts reads GAME_PORT first
    },
    editor: {
      WORKTREE_NAME: worktreeName,
      VITE_WORKTREE_NAME: worktreeName,
      GAME_PORT: String(gamePort),
      PORT: String(editorPort),
      // dev-runner then keeps Vite/Electron in our process group (see editor/dev-runner.mjs)
      ELEMENTALS_SUPERVISED: '1',
    },
  };
}

export async function buildPlan({
  rootDir,
  argv = [],
  env = process.env,
  platform = process.platform,
  exec = defaultExec,
  realpath = fs.realpathSync,
  isPortFree = defaultIsPortFree,
  exists = fs.existsSync,
  readFile = fs.readFileSync,
} = {}) {
  const args = parseArgs(argv);
  const info = detectWorktree({ cwd: rootDir, exec, realpath });
  const runtime = await resolveRuntime({ info, cliOffset: args.offset, env, isPortFree });
  const worktreeName = env.WORKTREE_NAME && env.WORKTREE_NAME.trim() ? env.WORKTREE_NAME : info.name;
  const childEnv = buildChildEnv({
    worktreeName,
    gamePort: runtime.gamePort,
    editorPort: runtime.editorPort,
  });
  const npm = npmCommand(platform);
  const commands = [
    {
      name: 'game',
      command: npm.command,
      args: ['run', 'dev', '--prefix', 'game'],
      cwd: rootDir,
      shell: npm.shell,
      env: childEnv.game,
    },
    {
      name: 'editor',
      command: npm.command,
      args: ['run', 'electron:dev', '--prefix', 'editor'],
      cwd: rootDir,
      shell: npm.shell,
      env: childEnv.editor,
    },
  ];
  const installProblems = checkInstalls(rootDir, { exists, readFile });
  return {
    args,
    rootDir: path.resolve(rootDir),
    worktree: info,
    worktreeName,
    runtime,
    commands,
    installProblems,
    urls: {
      game: `http://localhost:${runtime.gamePort}`,
      editor: `http://localhost:${runtime.editorPort}`,
    },
  };
}

export function describeSource(runtime) {
  switch (runtime.source) {
    case 'cli':
      return 'from --offset';
    case 'env':
      return 'from PORT_OFFSET';
    case 'main':
      return 'main checkout';
    case 'hash':
      return 'stable hash of the worktree path';
    case 'probed':
      return `hash preferred +${runtime.preferredOffset}, but its ports were busy - probed to the next free offset`;
    default:
      return runtime.source;
  }
}

export function formatList(plan) {
  const { worktree, runtime } = plan;
  const kind = !worktree.inGit ? 'not a git repository (fallback)' : worktree.isWorktree ? 'linked worktree' : 'main checkout';
  const busy = (port) => (runtime.busy.some((b) => b.port === port) ? '  [BUSY]' : '');
  return [
    `Worktree : ${plan.worktreeName}`,
    `Kind     : ${kind}`,
    `Root     : ${worktree.root}`,
    `Offset   : ${runtime.offset} (${describeSource(runtime)})`,
    `Game     : ${plan.urls.game}${runtime.gameOverridden ? ' (GAME_PORT)' : ''}${busy(runtime.gamePort)}`,
    `Editor   : ${plan.urls.editor}${runtime.editorOverridden ? ' (PORT)' : ''}${busy(runtime.editorPort)}`,
  ].join('\n');
}

export function formatDryRun(plan) {
  const lines = [formatList(plan), ''];
  for (const c of plan.commands) {
    lines.push(`[${c.name}] cwd=${c.cwd} shell=${c.shell}`);
    lines.push(`  ${[c.command, ...c.args].join(' ')}`);
    for (const [k, v] of Object.entries(c.env)) lines.push(`  env ${k}=${v}`);
  }
  if (plan.installProblems.length) {
    lines.push('', 'WARNING: a real run would stop here: dependencies are missing:');
    for (const p of plan.installProblems) lines.push(`  - ${p.missing} -> ${p.fix}`);
  }
  if (plan.runtime.busy.length) {
    lines.push('', `WARNING: busy ports: ${plan.runtime.busy.map((b) => `${b.name}:${b.port}`).join(', ')}`);
  }
  return lines.join('\n');
}
