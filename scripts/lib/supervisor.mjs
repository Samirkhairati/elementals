// Process supervisor: starts children, and if ANY child exits (or a signal
// arrives) tears down ALL children - including their whole process trees.
//
// POSIX: children are spawned `detached` (own process group) and signalled via
// process.kill(-pid). Windows: `taskkill /pid <pid> /T /F`.
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import os from 'node:os';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Map a child's (code, signal) to a shell-style exit code. */
export function exitCodeFor(code, signal) {
  if (typeof code === 'number') return code;
  if (signal) return 128 + (os.constants.signals[signal] ?? 15);
  return 1;
}

/**
 * Signalling strategy for one platform. `entry` is { pid, detached }.
 *  signal(entry, sig) -> boolean (false when nothing was left to signal)
 *  alive(entry)       -> true while any process of the tree may still exist
 */
export function createTreeKiller(platform = process.platform, { kill = process.kill.bind(process), run = spawnSync } = {}) {
  if (platform === 'win32') {
    return {
      signal(entry) {
        if (!entry.pid) return false;
        run('taskkill', ['/pid', String(entry.pid), '/T', '/F'], { stdio: 'ignore' });
        return true;
      },
      alive: () => false,
    };
  }
  const target = (entry) => (entry.detached ? -entry.pid : entry.pid);
  return {
    signal(entry, sig) {
      if (!entry.pid) return false;
      try {
        kill(target(entry), sig);
        return true;
      } catch {
        return false; // ESRCH: already gone
      }
    },
    alive(entry) {
      if (!entry.pid) return false;
      try {
        kill(target(entry), 0);
        return true;
      } catch (err) {
        return err.code === 'EPERM';
      }
    },
  };
}

/**
 * options:
 *  platform, spawn, tree      injectable for tests
 *  detached                   spawn children in their own process group
 *                             (default: true except on win32). Set false when
 *                             this process already runs inside a supervised group.
 *  graceMs                    time between SIGTERM and SIGKILL (default 4000)
 *  log(msg)                   status messages
 */
export function createSupervisor({
  platform = process.platform,
  spawn = nodeSpawn,
  tree = createTreeKiller(platform),
  detached = platform !== 'win32',
  graceMs = 4000,
  pollMs = 25,
  log = () => {},
} = {}) {
  const entries = [];
  let stopping = false;
  let exitCode = 0;
  let resolveDone;
  const done = new Promise((r) => {
    resolveDone = r;
  });

  // An exited detached child may still leave group members behind; a non-detached
  // one has no group, and its pid could be reused, so it is never probed again.
  const live = (e) => !e.exited || (e.detached && tree.alive(e));

  function start(name, command, args = [], options = {}) {
    if (stopping) throw new Error('supervisor is shutting down');
    const child = spawn(command, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      ...options,
      detached,
    });
    const entry = { name, child, pid: child.pid, detached, exited: false, code: null, signal: null };
    entries.push(entry);

    child.on('error', (err) => {
      log(`[${name}] failed to start: ${err.message}`);
      entry.exited = true;
      entry.code = 1;
      if (!stopping) shutdown(1);
    });
    child.on('exit', (code, signal) => {
      entry.exited = true;
      entry.code = code;
      entry.signal = signal;
      if (!stopping) {
        const status = signal ? `signal ${signal}` : `code ${code}`;
        log(`[${name}] exited with ${status}; stopping the other processes`);
        shutdown(exitCodeFor(code, signal));
      }
    });
    return entry;
  }

  async function shutdown(code = 0) {
    if (stopping) return done;
    stopping = true;
    exitCode = code;

    for (const e of entries) {
      // Never signal a stale pid on Windows (taskkill /F could hit a reused pid).
      if (!e.exited || (platform !== 'win32' && e.detached)) tree.signal(e, 'SIGTERM');
    }
    let deadline = Date.now() + graceMs;
    while (Date.now() < deadline && entries.some(live)) await sleep(pollMs);

    for (const e of entries) if (live(e)) tree.signal(e, 'SIGKILL');
    deadline = Date.now() + 2000;
    while (Date.now() < deadline && entries.some((e) => !e.exited)) await sleep(pollMs);

    resolveDone(exitCode);
    return done;
  }

  /** Immediately SIGKILL everything (used on a repeated Ctrl-C and at process exit). */
  function forceKill() {
    for (const e of entries) if (live(e)) tree.signal(e, 'SIGKILL');
  }

  /**
   * Hook SIGINT/SIGTERM/SIGHUP, uncaught errors and process exit.
   * A second signal while shutting down force-kills. Returns an uninstall fn.
   */
  function installSignalHandlers(proc = process) {
    const onSignal = (sig) => {
      if (stopping) {
        log(`Received ${sig} again; force killing.`);
        forceKill();
        return;
      }
      log(`Received ${sig}; shutting down...`);
      shutdown(0);
    };
    const handlers = {};
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      handlers[sig] = () => onSignal(sig);
      proc.on(sig, handlers[sig]);
    }
    const onError = (err) => {
      log(`Unexpected error: ${err && err.stack ? err.stack : err}`);
      shutdown(1);
    };
    const onExit = () => forceKill();
    proc.on('uncaughtException', onError);
    proc.on('unhandledRejection', onError);
    proc.on('exit', onExit);
    return () => {
      for (const sig of Object.keys(handlers)) proc.off(sig, handlers[sig]);
      proc.off('uncaughtException', onError);
      proc.off('unhandledRejection', onError);
      proc.off('exit', onExit);
    };
  }

  return {
    start,
    shutdown,
    forceKill,
    installSignalHandlers,
    done,
    entries,
    get stopping() {
      return stopping;
    },
  };
}
