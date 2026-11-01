import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makePng, makeTempDirTracker } from '../__testutils__/helpers';
import { DIALOG_CHANNELS, createProjectChannels, projectDirs } from './projectApi';

const tmp = makeTempDirTracker();
let root: string;
let api: ReturnType<typeof createProjectChannels>;
const call = async (channel: string, ...args: unknown[]) => (await api[channel](...args)) as Record<string, unknown>;

beforeEach(() => {
  root = tmp.create();
  api = createProjectChannels(root);
});
afterEach(() => tmp.cleanup());

const here = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(here, '..');

describe('channel table', () => {
  it('has a preload entry for every channel (pure and dialog)', () => {
    const preload = fs.readFileSync(path.join(electronDir, 'preload.ts'), 'utf8');
    const exposed = new Set([...preload.matchAll(/ipcRenderer\.invoke\('([a-z-]+)'/g)].map((m) => m[1]));
    for (const channel of [...Object.keys(api), ...DIALOG_CHANNELS]) expect(exposed, channel).toContain(channel);
    for (const channel of exposed) {
      if (channel === 'ping') continue;
      expect([...Object.keys(api), ...DIALOG_CHANNELS], channel).toContain(channel);
    }
  });

  it('is registered by the main-process handlers (dialogs included)', () => {
    const handlers = ['mapHandlers', 'tilesetHandlers', 'spriteHandlers']
      .map((f) => fs.readFileSync(path.join(here, `${f}.ts`), 'utf8'))
      .join('\n');
    for (const channel of DIALOG_CHANNELS) expect(handlers).toContain(`'${channel}'`);
  });

  it('is typed in electron.d.ts for every preload method', () => {
    const preload = fs.readFileSync(path.join(electronDir, 'preload.ts'), 'utf8');
    const dts = fs.readFileSync(path.join(electronDir, '../src/types/electron.d.ts'), 'utf8');
    const methods = [...preload.matchAll(/^\s{2}(\w+): \(/gm)].map((m) => m[1]).filter((m) => !m.startsWith('on'));
    expect(methods.length).toBeGreaterThan(20);
    for (const m of methods) expect(dts, m).toMatch(new RegExp(`\\b${m}:`));
  });

  it('derives directories from the project directory', () => {
    expect(projectDirs(root)).toEqual({
      projectDir: root,
      mapsDir: path.join(root, 'maps'),
      tilesetsDir: path.join(root, 'tilesets'),
      charactersDir: path.join(root, 'database', 'characters'),
      graphicsDir: path.join(root, 'graphics'),
    });
  });
});

describe('channels end to end (real temp project)', () => {
  it('lists empty collections for an empty project', async () => {
    expect(await call('get-maps')).toMatchObject({ success: true, maps: [], folders: [] });
    expect(await call('get-tilesets')).toMatchObject({ success: true, tilesets: [] });
    expect(await call('get-characters')).toMatchObject({ success: true, characters: [], graphics: [] });
    expect(await call('get-database')).toMatchObject({ success: true, database: { version: 2, switches: [], variables: [], stages: [] } });
    expect(await call('get-common-events')).toMatchObject({ success: true, events: [] });
  });

  it('creates, saves and lists maps', async () => {
    const created = (await call('create-map', 'Town', 10, 8, null)) as { success: true; map: { fileName: string } };
    expect(created.success).toBe(true);
    expect((await call('save-map', null, created.map.fileName, { name: 'Town', width: 10, height: 8, layers: [], entities: [] })).success).toBe(true);
    const listed = (await call('get-maps')) as { maps: { name: string }[] };
    expect(listed.maps.map((m) => m.name)).toEqual(['Town']);
  });

  it('runs the character workflow', async () => {
    const png = path.join(root, 'ball.png');
    fs.writeFileSync(png, makePng(24, 24));
    const imported = (await call('import-graphic', png, 'props/ball.png')) as { success: true; graphic: { id: string; width: number } };
    expect(imported.graphic).toMatchObject({ id: 'props/ball.png', width: 24 });
    const def = {
      version: 2, name: 'Ball', tags: [], facing: 'none', pivot: { x: 0.5, y: 1 },
      sheets: { sheet: { image: 'props/ball.png', frameWidth: 24, frameHeight: 24, margin: 0, spacing: 0 } },
      clips: {}, bindings: {}, still: { sheet: 'sheet', frame: 0 },
    };
    expect(await call('save-character', 'objects/ball', def)).toMatchObject({ success: true, character: { id: 'objects/ball' } });
    expect(await call('rename-character', 'objects/ball', 'objects/orb')).toEqual({ success: true, id: 'objects/orb' });
    const listed = (await call('get-characters')) as { characters: { id: string; images: Record<string, string> }[]; graphics: { id: string }[] };
    expect(listed.characters.map((c) => c.id)).toEqual(['objects/orb']);
    expect(Object.keys(listed.characters[0].images)).toEqual(['props/ball.png']);
    expect(listed.graphics.map((g) => g.id)).toEqual(['props/ball.png']);
    expect(await call('delete-character', 'objects/orb')).toEqual({ success: true });
    expect(((await call('get-characters')) as { characters: unknown[] }).characters).toHaveLength(0);
  });

  it('returns errors instead of throwing', async () => {
    expect(await call('delete-character', '../x')).toMatchObject({ success: false });
    expect(await call('import-graphic', '/nope.png', 'x.png')).toMatchObject({ success: false });
    expect(await call('save-character', 'a', { version: 2, name: 'A', sheets: { s: { image: 'missing.png' } }, clips: {}, bindings: {} })).toMatchObject({ success: false, error: expect.stringMatching(/does not exist/) });
    expect(await call('save-database', { version: 1, switches: [{ id: 'a', name: '' }], variables: [] })).toMatchObject({ success: false, error: expect.stringMatching(/name/) });
    expect(await call('save-map', '../x', 'a.json', {})).toMatchObject({ success: false });
  });

  it('saves, lists and deletes common events', async () => {
    const ev = { version: 1, id: 'heal', name: 'Heal', graph: { nodes: [], frames: [] } };
    expect(await call('save-common-event', ev)).toMatchObject({ success: true, event: { id: 'heal' } });
    expect(await call('get-common-events')).toMatchObject({ success: true, events: [{ id: 'heal' }] });
    expect(await call('save-common-event', { ...ev, id: '../x' })).toMatchObject({ success: false });
    expect(await call('delete-common-event', 'heal')).toMatchObject({ success: true });
    expect(await call('get-common-events')).toMatchObject({ success: true, events: [] });
  });

  it('saves and reads the database', async () => {
    const db = { version: 2, switches: [{ id: 's', name: 'S' }], variables: [], stages: [] };
    expect(await call('save-database', db)).toMatchObject({ success: true });
    expect(await call('get-database')).toMatchObject({ success: true, database: db });
  });
});
