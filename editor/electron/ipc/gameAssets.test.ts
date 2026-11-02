import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncGameAssets } from './gameAssets.js';

const dirs: string[] = [];
function repo(script: string | null): { project: string; maps: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-sync-'));
  dirs.push(root);
  fs.mkdirSync(path.join(root, 'project'), { recursive: true });
  if (script !== null) {
    fs.mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(root, 'shared', 'num.ts'), 'export const n: number = 3\n');
    fs.writeFileSync(path.join(root, 'scripts', 'lib', 'assets.mjs'), script);
  }
  return { project: path.join(root, 'project'), maps: path.join(root, 'game', 'public', 'data', 'maps') };
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('syncGameAssets', () => {
  it('skips when the repo scripts are not beside the project', async () => {
    const { project, maps } = repo(null);
    expect((await syncGameAssets(project, maps)).skipped).toMatch(/no asset sync script/);
  });

  it('runs the script even though it imports .ts files (Electron\'s own Node could not)', async () => {
    const { project, maps } = repo(
      `import { n } from '../../shared/num.ts'\nexport const syncAssets = () => ({ plan: { errors: [] }, applied: new Array(n).fill(0) })\n`
    );
    expect(await syncGameAssets(project, maps)).toEqual({ written: 3 });
  });

  it('passes the project and public folders to the script', async () => {
    const { project, maps } = repo(`export const syncAssets = (o) => ({ plan: { errors: [] }, applied: [o.projectDir, o.publicDir, o.write] })\n`);
    const r = await syncGameAssets(project, maps);
    expect(r).toEqual({ written: 3 });
  });

  it('reports problems found by the sync instead of failing', async () => {
    const { project, maps } = repo(`export const syncAssets = () => ({ plan: { errors: ['bad picture'] }, applied: [] })\n`);
    expect((await syncGameAssets(project, maps)).skipped).toMatch(/bad picture/);
  });

  it('reports a script that throws', async () => {
    const { project, maps } = repo(`export const syncAssets = () => { throw new Error('boom') }\n`);
    expect((await syncGameAssets(project, maps)).skipped).toMatch(/asset sync failed: .*boom/);
  });
});
