import { execFileSync } from 'child_process';
import path from 'path';

export type ExecFn = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number }
) => string;

export interface WorktreeNameDeps {
  env?: Record<string, string | undefined>;
  exec?: ExecFn;
}

const defaultExec: ExecFn = (file, args, options) =>
  execFileSync(file, args, {
    cwd: options.cwd,
    timeout: options.timeout,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

/**
 * Window title: worktree, port and the project folder maps are saved to (home shown as `~`), so a
 * second checkout can never be mistaken for the first.
 */
export function formatWindowTitle(worktree: string, port: number, projectDir: string, home?: string): string {
  const shown = home && (projectDir === home || projectDir.startsWith(`${home}${path.sep}`)) ? `~${projectDir.slice(home.length)}` : projectDir;
  return `Elementals Editor — [${worktree}] (Port: ${port}) — ${shown}`;
}

/**
 * Name shown in the window title: `WORKTREE_NAME` (set by the dev script) first, then the
 * current git branch (`detached@<sha>` on a detached HEAD), then the repo folder name.
 * Never throws.
 */
export function getWorktreeName(repoRoot: string, deps: WorktreeNameDeps = {}): string {
  const env = deps.env ?? process.env;
  const exec = deps.exec ?? defaultExec;

  const fromEnv = env.WORKTREE_NAME?.trim();
  if (fromEnv) return fromEnv;

  const git = (args: string[]): string => exec('git', args, { cwd: repoRoot, timeout: 2000 }).trim();

  try {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch && branch !== 'HEAD') return branch;
    if (branch === 'HEAD') {
      const sha = git(['rev-parse', '--short', 'HEAD']);
      if (sha) return `detached@${sha}`;
    }
  } catch {
    // git missing, not a repository, timed out, ...: fall through to the folder name
  }

  return path.basename(repoRoot) || 'main';
}
