import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { getWorktreeName, type ExecFn } from './worktreeName';

const ROOT = path.join('/repos', 'elementals-wt1');

function fakeExec(responses: Record<string, string | Error>): ReturnType<typeof vi.fn<ExecFn>> {
  return vi.fn<ExecFn>((_file, args) => {
    const key = args.join(' ');
    const r = responses[key];
    if (r === undefined) throw new Error(`unexpected git ${key}`);
    if (r instanceof Error) throw r;
    return r;
  });
}

describe('getWorktreeName', () => {
  it('prefers WORKTREE_NAME and does not run git', () => {
    const exec = fakeExec({});
    expect(getWorktreeName(ROOT, { env: { WORKTREE_NAME: 'feature-x' }, exec })).toBe('feature-x');
    expect(exec).not.toHaveBeenCalled();
  });

  it('trims WORKTREE_NAME and ignores blank values', () => {
    const exec = fakeExec({ 'rev-parse --abbrev-ref HEAD': 'main\n' });
    expect(getWorktreeName(ROOT, { env: { WORKTREE_NAME: '  spaced  ' }, exec })).toBe('spaced');
    expect(getWorktreeName(ROOT, { env: { WORKTREE_NAME: '   ' }, exec })).toBe('main');
    expect(getWorktreeName(ROOT, { env: { WORKTREE_NAME: '' }, exec })).toBe('main');
  });

  it('uses the git branch name with cwd and a timeout', () => {
    const exec = fakeExec({ 'rev-parse --abbrev-ref HEAD': 'feat/map-editor\n' });
    expect(getWorktreeName(ROOT, { env: {}, exec })).toBe('feat/map-editor');
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: ROOT,
      timeout: 2000,
    });
  });

  it('labels a detached HEAD with the short sha', () => {
    const exec = fakeExec({
      'rev-parse --abbrev-ref HEAD': 'HEAD\n',
      'rev-parse --short HEAD': 'abc1234\n',
    });
    expect(getWorktreeName(ROOT, { env: {}, exec })).toBe('detached@abc1234');
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenLastCalledWith('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      timeout: 2000,
    });
  });

  it('falls back to the folder name when detached and the short sha fails or is empty', () => {
    expect(
      getWorktreeName(ROOT, {
        env: {},
        exec: fakeExec({ 'rev-parse --abbrev-ref HEAD': 'HEAD', 'rev-parse --short HEAD': new Error('boom') }),
      })
    ).toBe('elementals-wt1');
    expect(
      getWorktreeName(ROOT, {
        env: {},
        exec: fakeExec({ 'rev-parse --abbrev-ref HEAD': 'HEAD', 'rev-parse --short HEAD': '\n' }),
      })
    ).toBe('elementals-wt1');
  });

  it.each([
    ['git missing', Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })],
    ['timeout', Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' })],
    ['not a repo', new Error('fatal: not a git repository')],
  ])('falls back to the folder name on error (%s) without throwing', (_label, error) => {
    const exec = fakeExec({ 'rev-parse --abbrev-ref HEAD': error });
    expect(getWorktreeName(ROOT, { env: {}, exec })).toBe('elementals-wt1');
  });

  it('falls back to the folder name for empty git output', () => {
    const exec = fakeExec({ 'rev-parse --abbrev-ref HEAD': '\n' });
    expect(getWorktreeName(ROOT, { env: {}, exec })).toBe('elementals-wt1');
  });

  it('never throws, even for non-Error throwables or a root without a basename', () => {
    const exec = vi.fn<ExecFn>(() => {
      throw 'string failure';
    });
    expect(getWorktreeName(ROOT, { env: {}, exec })).toBe('elementals-wt1');
    expect(getWorktreeName('/', { env: {}, exec })).toBe('main');
  });

  it('works against the real git binary in this repository (no injection)', () => {
    const name = getWorktreeName(path.resolve(__dirname, '../..'), { env: {} });
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });
});
