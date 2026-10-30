// Worktree detection, stable port-offset computation and port probing.
//
// Everything with side effects (running git, resolving real paths, binding
// ports) is injectable so the logic can be unit-tested with fakes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export const GAME_BASE_PORT = 5175;
export const EDITOR_BASE_PORT = 5174;
export const OFFSET_STEP = 100;
/** Hashed offsets live in 1..MAX_OFFSET (highest game port: 5175 + 99*100 = 15075). */
export const MAX_OFFSET = 99;

/** Default `exec`: run a command, return trimmed stdout, throw on failure. */
export function defaultExec(command, args, { cwd } = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function safeRealpath(realpath, p) {
  try {
    return realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Detect whether `cwd` is the main checkout, a linked git worktree, or not in
 * git at all. Uses git plumbing only (no `.git` file parsing):
 *   --show-toplevel          checkout root
 *   --git-dir/--git-common-dir  differ  <=>  linked worktree
 *   --abbrev-ref HEAD        branch ("HEAD" => detached => `detached@<sha>`)
 *
 * Returns { inGit, isWorktree, name, branch, toplevel, root }
 *   root = real path of the toplevel (symlinks resolved) - the stable identity.
 */
export function detectWorktree({
  cwd,
  exec = defaultExec,
  realpath = fs.realpathSync,
} = {}) {
  const git = (...args) => exec('git', args, { cwd });
  const fallback = () => ({
    inGit: false,
    isWorktree: false,
    name: path.basename(path.resolve(cwd)),
    branch: null,
    toplevel: null,
    root: safeRealpath(realpath, cwd),
  });

  let toplevel;
  let gitDir;
  let commonDir;
  try {
    toplevel = git('rev-parse', '--show-toplevel');
    gitDir = git('rev-parse', '--git-dir');
    commonDir = git('rev-parse', '--git-common-dir');
  } catch {
    return fallback();
  }
  if (!toplevel) return fallback();

  // git prints these relative to cwd (or absolute); compare real paths.
  const norm = (p) => safeRealpath(realpath, path.resolve(cwd, p));
  const isWorktree = norm(gitDir) !== norm(commonDir);

  let branch = null;
  try {
    branch = git('rev-parse', '--abbrev-ref', 'HEAD') || null;
  } catch {
    // e.g. a repository without commits yet
    try {
      branch = git('symbolic-ref', '--short', '-q', 'HEAD') || null;
    } catch {
      branch = null;
    }
  }

  let name;
  if (branch === 'HEAD') {
    let sha = '';
    try {
      sha = git('rev-parse', '--short', 'HEAD');
    } catch {
      sha = 'unknown';
    }
    name = `detached@${sha}`;
  } else {
    name = branch || path.basename(toplevel);
  }

  return {
    inGit: true,
    isWorktree,
    name,
    branch,
    toplevel,
    root: safeRealpath(realpath, toplevel),
  };
}

/** Deterministic 32-bit unsigned hash of a string. */
export function hashString(str) {
  return createHash('sha256').update(str).digest().readUInt32BE(0);
}

/**
 * Preferred (pre-probing) offset: 0 for the main checkout / non-git dirs;
 * otherwise 1..maxOffset derived from the real path of the worktree root.
 *
 * Real path (not branch name, not list index) because it is fixed for the whole
 * life of a worktree: branches get renamed/switched and list indexes shift when
 * any sibling worktree is removed, both of which would move running servers.
 */
export function computeOffset(info, { maxOffset = MAX_OFFSET } = {}) {
  if (!info || !info.isWorktree) return 0;
  return 1 + (hashString(info.root) % maxOffset);
}

function parsePort(value, label) {
  if (!/^\d+$/.test(String(value).trim())) {
    throw new Error(`${label} must be a port number, got "${value}"`);
  }
  const n = Number(value);
  if (n < 1 || n > 65535) throw new Error(`${label} out of range (1-65535): ${n}`);
  return n;
}

const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * Ports for an offset. `GAME_PORT` overrides the game port, `PORT` overrides
 * the editor port (each wins over the offset-derived value).
 */
export function resolvePorts({ offset, env = {} }) {
  const gameOverridden = isSet(env.GAME_PORT);
  const editorOverridden = isSet(env.PORT);
  const gamePort = gameOverridden
    ? parsePort(env.GAME_PORT, 'GAME_PORT')
    : parsePort(GAME_BASE_PORT + offset * OFFSET_STEP, `game port for offset ${offset}`);
  const editorPort = editorOverridden
    ? parsePort(env.PORT, 'PORT')
    : parsePort(EDITOR_BASE_PORT + offset * OFFSET_STEP, `editor port for offset ${offset}`);
  return { offset, gamePort, editorPort, gameOverridden, editorOverridden };
}

/** Try to bind `port` on `host`; unsupported address families count as free. */
function canBind(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', (err) => {
      resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT');
    });
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

/**
 * A port is free only if it can be bound on IPv4 loopback, IPv6 loopback and
 * the wildcard (Vite's "localhost" may resolve to either family).
 */
export async function defaultIsPortFree(port, hosts = ['127.0.0.1', '::1', '0.0.0.0']) {
  for (const host of hosts) {
    if (!(await canBind(port, host))) return false;
  }
  return true;
}

/**
 * Linear probe over 1..maxOffset (wrapping) starting at `start`; returns the
 * first offset for which every port in `portsFor(offset)` is free, or null.
 */
export async function findFreeOffset({
  start,
  maxOffset = MAX_OFFSET,
  portsFor,
  isPortFree = defaultIsPortFree,
}) {
  for (let i = 0; i < maxOffset; i++) {
    const offset = ((start - 1 + i) % maxOffset) + 1;
    let free = true;
    for (const port of portsFor(offset)) {
      if (!(await isPortFree(port))) {
        free = false;
        break;
      }
    }
    if (free) return offset;
  }
  return null;
}

/**
 * Decide the offset and ports.
 * Precedence: cliOffset (--offset) > env.PORT_OFFSET > auto
 *   auto = 0 for main checkout; hashed + probed for linked worktrees.
 * Env GAME_PORT / PORT override the resulting ports individually.
 * Only the auto path probes; explicit choices are honoured as-is and merely
 * reported as `busy` so the caller can fail loudly.
 *
 * Returns { offset, source, preferredOffset, probed, gamePort, editorPort,
 *           gameOverridden, editorOverridden, busy: [{name, port}] }
 */
export async function resolveRuntime({
  info,
  cliOffset = null,
  env = {},
  isPortFree = defaultIsPortFree,
  maxOffset = MAX_OFFSET,
}) {
  const preferredOffset = computeOffset(info, { maxOffset });
  let offset;
  let source;
  let probed = false;

  if (cliOffset !== null && cliOffset !== undefined) {
    offset = cliOffset;
    source = 'cli';
  } else if (isSet(env.PORT_OFFSET)) {
    if (!/^\d+$/.test(String(env.PORT_OFFSET).trim())) {
      throw new Error(`PORT_OFFSET must be a non-negative integer, got "${env.PORT_OFFSET}"`);
    }
    offset = Number(env.PORT_OFFSET);
    source = 'env';
  } else if (!info.isWorktree) {
    offset = 0;
    source = 'main';
  } else {
    source = 'hash';
    const portsFor = (o) => {
      const p = resolvePorts({ offset: o, env });
      const ports = [];
      if (!p.gameOverridden) ports.push(p.gamePort);
      if (!p.editorOverridden) ports.push(p.editorPort);
      return ports;
    };
    const found = await findFreeOffset({ start: preferredOffset, maxOffset, portsFor, isPortFree });
    if (found === null) {
      throw new Error(`No free port offset found in 1..${maxOffset}; stop other dev servers or pass --offset.`);
    }
    offset = found;
    probed = found !== preferredOffset;
    if (probed) source = 'probed';
  }

  const ports = resolvePorts({ offset, env });
  const busy = [];
  if (!(await isPortFree(ports.gamePort))) busy.push({ name: 'game', port: ports.gamePort });
  if (!(await isPortFree(ports.editorPort))) busy.push({ name: 'editor', port: ports.editorPort });

  return { ...ports, source, preferredOffset, probed, busy };
}
