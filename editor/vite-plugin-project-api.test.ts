import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makePng, makeTempDirTracker } from './electron/__testutils__/helpers';
import { API_PREFIX, createApiHandler, type ApiHandler } from './vite-plugin-project-api';

const tmp = makeTempDirTracker();
let projectDir: string;
let handler: ApiHandler;
let server: http.Server;
let base: string;
let port: number;

beforeEach(async () => {
  projectDir = path.join(tmp.create(), 'project');
  fs.mkdirSync(projectDir);
  handler = createApiHandler({ projectDir });
  server = http.createServer((req, res) =>
    handler.handle(req, res, () => {
      res.statusCode = 299; // "fell through to the next middleware"
      res.end('next');
    })
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  server.closeAllConnections?.();
  handler.dispose();
  tmp.cleanup();
});

interface CallOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}
async function call(channel: string, args: unknown[] = [], options: CallOptions = {}) {
  const res = await fetch(`${base}${API_PREFIX}${channel}`, {
    method: options.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.method === 'GET' ? undefined : (options.body ?? JSON.stringify({ args })),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('serving the project channels', () => {
  it('serves every channel of the Electron table plus the browser stand-ins', () => {
    expect(handler.channels).toEqual(
      expect.arrayContaining(['get-maps', 'get-tilesets', 'get-sprites', 'get-database', 'save-map', 'import-sprite', 'export-map', 'stage-upload'])
    );
  });

  it('falls through for URLs outside /__api/', async () => {
    const res = await fetch(`${base}/index.html`);
    expect(res.status).toBe(299);
  });

  it('reads and writes real files below projectDir', async () => {
    expect((await call('get-maps')).body).toMatchObject({ success: true, maps: [], folders: [] });
    const created = await call('create-map', ['Town', 10, 8, null]);
    expect(created.status).toBe(200);
    const fileName = (created.body.map as { fileName: string }).fileName;
    expect(fs.existsSync(path.join(projectDir, 'maps', fileName))).toBe(true);
    const saved = await call('save-map', [null, fileName, { name: 'Town', width: 10, height: 8, layers: [], entities: [] }]);
    expect(saved.body).toEqual({ success: true });
    expect(JSON.parse(fs.readFileSync(path.join(projectDir, 'maps', fileName), 'utf8')).name).toBe('Town');
    expect((await call('get-maps')).body.maps).toHaveLength(1);
  });

  it('stores errors come back as success:false (HTTP 200)', async () => {
    const r = await call('save-database', [{ version: 1, switches: [{ id: 'a', name: '' }], variables: [] }]);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: false, error: expect.stringMatching(/name/) });
  });

  it('round-trips the database', async () => {
    const db = { version: 1, switches: [{ id: 'intro', name: 'Intro' }], variables: [] };
    expect((await call('save-database', [db])).body.success).toBe(true);
    expect((await call('get-database')).body.database).toEqual(db);
  });

  it('export-map hands the JSON back for the browser to download', async () => {
    expect((await call('export-map', ['{"a":1}', 'town.json'])).body).toEqual({ success: true, json: '{"a":1}', fileName: 'town.json' });
    expect((await call('export-map', [42, 'x'])).body).toMatchObject({ success: false });
  });
});

describe('path traversal is refused exactly like in the stores', () => {
  it.each([
    ['save-map', [null, '../evil.json', {}]],
    ['save-map', ['../..', 'a.json', {}]],
    ['save-map', ['/etc', 'a.json', {}]],
    ['delete-map', ['..', 'a.json']],
    ['create-map', ['x', 10, 10, '../escape']],
    ['create-folder', [null, '../up']],
    ['rename-map-folder', ['../x', 'y']],
    ['delete-sprite', ['../x']],
    ['rename-sprite', ['a', '../b']],
    ['save-sprite-meta', ['../x', {}]],
  ])('%s %j', async (channel, args) => {
    const parent = path.dirname(projectDir);
    const before = fs.readdirSync(parent);
    const r = await call(channel, args as unknown[]);
    expect(r.body.success).toBe(false);
    expect(fs.readdirSync(parent)).toEqual(before);
  });
});

describe('request guard rails', () => {
  it('rejects non-POST, wrong content type and unknown channels', async () => {
    expect((await call('get-maps', [], { method: 'GET' })).status).toBe(405);
    expect((await call('get-maps', [], { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
    const unknown = await call('format-disk');
    expect(unknown.status).toBe(404);
    expect(unknown.body.success).toBe(false);
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect((await call(name)).status).toBe(404);
  });

  it('rejects malformed bodies', async () => {
    expect((await call('get-maps', [], { body: '{nope' })).status).toBe(400);
    expect((await call('get-maps', [], { body: '{"args":"x"}' })).status).toBe(400);
  });

  it('rejects non-loopback Host headers and cross-origin requests', async () => {
    const hostile = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: `${API_PREFIX}get-maps`, method: 'POST', headers: { Host: 'evil.example.com', 'Content-Type': 'application/json' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on('error', reject);
      req.end('{}');
    });
    expect(hostile).toBe(403);
    const cross = await call('get-maps', [], { headers: { Origin: 'https://evil.example.com' } });
    expect(cross.status).toBe(403);
    const same = await call('get-maps', [], { headers: { Origin: `http://127.0.0.1:${port}` } });
    expect(same.status).toBe(200);
  });

  it('refuses oversized bodies', async () => {
    const big = JSON.stringify({ args: ['x'.repeat(65 * 1024 * 1024)] });
    const r = await call('get-maps', [], { body: big }).catch(() => ({ status: 413 }));
    expect(r.status).toBe(413);
  }, 30_000);
});

describe('uploads and imports', () => {
  const b64 = (b: Buffer) => b.toString('base64');

  it('stages an upload and imports it as a sprite and as a tileset', async () => {
    const staged = await call('stage-upload', ['../../ball.png', b64(makePng(24, 24))]);
    expect(staged.body).toMatchObject({ success: true, defaultName: 'ball' });
    const sourcePath = staged.body.sourcePath as string;
    expect(path.basename(sourcePath)).toBe('ball.png');

    const sprite = await call('import-sprite', [sourcePath, { name: 'Ball', kind: 'object' }]);
    expect(sprite.body).toMatchObject({ success: true, asset: { id: 'objects/ball' } });
    expect(fs.existsSync(path.join(projectDir, 'sprites/objects/ball/sprite.json'))).toBe(true);
    expect(((await call('get-sprites')).body.assets as unknown[]).length).toBe(1);

    const tileset = await call('import-tileset', [sourcePath, 'Ball tiles', null]);
    expect(tileset.body).toMatchObject({ success: true });
    expect(fs.existsSync(path.join(projectDir, 'tilesets/ball.png'))).toBe(true);
  });

  it('refuses to import files that were not staged', async () => {
    const outside = path.join(tmp.create(), 'secret.png');
    fs.writeFileSync(outside, makePng(8, 8));
    for (const channel of ['import-sprite', 'import-tileset']) {
      const r = await call(channel, [outside, channel === 'import-sprite' ? { name: 'x', kind: 'object' } : 'x']);
      expect(r.body).toMatchObject({ success: false, error: expect.stringMatching(/staged/) });
    }
    expect((await call('import-sprite', ['relative.png', { name: 'x', kind: 'object' }])).body.success).toBe(false);
    expect(fs.existsSync(path.join(projectDir, 'sprites'))).toBe(false);
  });

  it('refuses a symlink in the staging area that points outside of it', async () => {
    const staged = await call('stage-upload', ['a.png', b64(makePng(8, 8))]);
    const dir = path.dirname(staged.body.sourcePath as string);
    const secret = path.join(tmp.create(), 'secret.png');
    fs.writeFileSync(secret, makePng(8, 8));
    fs.symlinkSync(secret, path.join(dir, 'link.png'));
    const r = await call('import-sprite', [path.join(dir, 'link.png'), { name: 'x', kind: 'object' }]);
    expect(r.body).toMatchObject({ success: false, error: expect.stringMatching(/staged/) });
  });

  it('validates upload payloads and cleans up after itself', async () => {
    expect((await call('stage-upload', ['a.png', 42])).body.success).toBe(false);
    expect((await call('stage-upload', ['a.png', ''])).body.success).toBe(false);
    const ok = await call('stage-upload', [{ nope: 1 }, b64(makePng(8, 8))]);
    expect(path.basename(ok.body.sourcePath as string)).toBe('upload.png');
    const dir = path.dirname(path.dirname(ok.body.sourcePath as string));
    expect(fs.existsSync(dir)).toBe(true);
    handler.dispose();
    expect(fs.existsSync(dir)).toBe(false);
  });
});
