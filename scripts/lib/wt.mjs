// Pure-ish helpers for the worktree launcher (scripts/wt.mjs).
// Everything with side effects (git, filesystem, port binding) is injectable.
import fs from 'node:fs';
import path from 'node:path';
import { checkInstalls } from './installs.mjs';
import {
  computeOffset,
  defaultExec,
  defaultIsPortFree,
  detectWorktree,
  resolvePorts,
} from './worktree.mjs';

/**
 * Parse `git worktree list --porcelain`. The first entry is always the main checkout.
 * Returns [{ path, head, branch, detached, bare, locked, prunable, isMain, name }].
 */
export function parseWorktreeList(text) {
  const entries = [];
  for (const block of String(text).split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const e = { path: '', head: '', branch: null, detached: false, bare: false, locked: false, prunable: false };
    for (const line of lines) {
      if (line.startsWith('worktree ')) e.path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) e.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) e.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      else if (line === 'detached') e.detached = true;
      else if (line === 'bare') e.bare = true;
      else if (line.startsWith('locked')) e.locked = true;
      else if (line.startsWith('prunable')) e.prunable = true;
    }
    if (e.path) entries.push(e);
  }
  return entries.map((e, i) => ({
    ...e,
    isMain: i === 0,
    name: e.branch ?? (e.detached ? `detached@${e.head.slice(0, 7)}` : path.basename(e.path)),
  }));
}

/** Directory-safe name for a branch (`feature/foo bar` -> `feature-foo-bar`). */
export function slugify(branch) {
  const slug = String(branch)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug || 'worktree';
}

/** Where new worktrees are created: $ELEMENTALS_WORKTREES_DIR or `<repo>-worktrees` next to the repo. */
export function defaultWorktreesDir(repoRoot, env = {}) {
  if (env.ELEMENTALS_WORKTREES_DIR && String(env.ELEMENTALS_WORKTREES_DIR).trim()) {
    return path.resolve(env.ELEMENTALS_WORKTREES_DIR);
  }
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-worktrees`);
}

/**
 * Find one worktree from a user query: 1-based index, exact branch name, exact directory
 * name, then a unique case-insensitive prefix. Returns { wt } or { error }.
 */
export function resolveTarget(list, query) {
  const q = String(query ?? '').trim();
  if (!q) return { error: 'No worktree given.' };

  if (/^\d+$/.test(q)) {
    const wt = list[Number(q) - 1];
    return wt ? { wt } : { error: `No worktree number ${q} (1..${list.length}).` };
  }

  const base = (w) => path.basename(w.path);
  const exact = list.filter((w) => w.name === q || base(w) === q);
  if (exact.length === 1) return { wt: exact[0] };
  if (exact.length > 1) return { error: `"${q}" is ambiguous: ${exact.map((w) => w.name).join(', ')}` };

  const lower = q.toLowerCase();
  const prefix = list.filter((w) => w.name.toLowerCase().startsWith(lower) || base(w).toLowerCase().startsWith(lower));
  if (prefix.length === 1) return { wt: prefix[0] };
  if (prefix.length > 1) return { error: `"${q}" is ambiguous: ${prefix.map((w) => w.name).join(', ')}` };
  return { error: `No worktree matches "${q}".` };
}

/**
 * Enrich a worktree entry with what the menu needs: ports, running state, installs,
 * dirty state and whether it has the dev runner.
 */
export async function describeWorktree(
  wt,
  {
    exists = fs.existsSync,
    exec = defaultExec,
    isPortFree = defaultIsPortFree,
    detect = detectWorktree,
    env = {},
  } = {},
) {
  const present = !wt.prunable && exists(wt.path);
  if (!present) {
    return { ...wt, present: false, offset: null, gamePort: null, editorPort: null, running: false, missingInstalls: [], dirty: false, hasRunner: false };
  }

  const info = detect({ cwd: wt.path, exec });
  const offset = computeOffset(info);
  const ports = resolvePorts({ offset, env });
  const gameFree = await isPortFree(ports.gamePort);
  const editorFree = await isPortFree(ports.editorPort);

  let dirty = false;
  try {
    dirty = exec('git', ['status', '--porcelain'], { cwd: wt.path }).length > 0;
  } catch {
    dirty = false;
  }

  return {
    ...wt,
    present: true,
    offset,
    gamePort: ports.gamePort,
    editorPort: ports.editorPort,
    // Both ports taken => this worktree's servers are (almost certainly) up.
    running: !gameFree && !editorFree,
    portsBusy: [!gameFree && 'game', !editorFree && 'editor'].filter(Boolean),
    missingInstalls: checkInstalls(wt.path, { exists }),
    dirty,
    hasRunner: exists(path.join(wt.path, 'scripts', 'dev.mjs')),
  };
}

const BOOLEAN_FLAGS = new Set(['json', 'yes', 'force', 'no-install', 'help']);

/** `wt [command] [target] [--flag] [-- passthrough...]` */
export function parseArgs(argv) {
  const out = { command: null, target: null, positional: [], flags: {}, passthrough: [] };
  const rest = [...argv];
  const dd = rest.indexOf('--');
  if (dd !== -1) {
    out.passthrough = rest.slice(dd + 1);
    rest.length = dd;
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '-h') out.flags.help = true;
    else if (a === '-y') out.flags.yes = true;
    else if (a === '-f') out.flags.force = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (eq !== -1) out.flags[key] = a.slice(eq + 1);
      else if (BOOLEAN_FLAGS.has(key)) out.flags[key] = true;
      else {
        const value = rest[i + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value`);
        out.flags[key] = value;
        i++;
      }
    } else out.positional.push(a);
  }
  [out.command, out.target] = [out.positional[0] ?? null, out.positional[1] ?? null];
  return out;
}
