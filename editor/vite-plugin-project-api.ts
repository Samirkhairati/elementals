/**
 * Browser harness: lets the editor run in a plain browser (Vite dev server, no Electron) against the REAL
 * project files. Serves `POST /__api/<channel>` by calling the very same electron-free channel table the
 * Electron main process registers (electron/ipc/projectApi.ts), rooted at `projectDir`
 * (ELEMENTALS_PROJECT_DIR, default <repo>/project). The browser side is src/lib/browserElectronApi.ts.
 *
 * Guard rails
 *  - `apply: 'serve'`: the plugin does not exist in `vite build` output.
 *  - Only mounted when the dev server listens on loopback (no `--host`), otherwise it logs why and stays off.
 *  - Requests must be POST + `Content-Type: application/json` (cross-origin pages cannot send that without a
 *    CORS preflight, which is never answered), carry a loopback `Host`, and any `Origin` must equal the Host.
 *  - All paths go through the stores (`resolveInside`): traversal, absolute paths and symlink escapes are refused.
 *  - Imports (`import-tileset`, `import-sprite`) may only read files this harness staged itself
 *    (`stage-upload`), never arbitrary paths on disk.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';
import { createProjectChannels, type ChannelFn } from './electron/ipc/projectApi';
import { isWithin } from './electron/ipc/pathSafety';
import { errorMessage } from './electron/ipc/result';

export const API_PREFIX = '/__api/';
export const MAX_BODY_BYTES = 64 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface ApiHandlerOptions {
  /** Project directory (maps/, tilesets/, sprites/, database.json). */
  projectDir: string;
  /** Where staged uploads live. Default: a fresh directory under os.tmpdir(), created on first upload. */
  stagingDir?: string;
}

export interface ApiHandler {
  /** Connect-style middleware. Calls `next()` for URLs outside `/__api/`. */
  handle: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  /** Names of every served channel. */
  channels: string[];
  /** Remove staged uploads. */
  dispose: () => void;
}

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const m = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(hostHeader.trim());
  return m ? m[1].toLowerCase() : null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(text);
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** `../../etc/x.png` -> `x.png`; anything unusable -> `upload.png`. */
function safeUploadName(name: unknown): string {
  const base = typeof name === 'string' ? path.basename(name.replace(/\\/g, '/')) : '';
  const clean = base.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '');
  return clean.toLowerCase().endsWith('.png') && clean.length > 4 ? clean.slice(0, 120) : 'upload.png';
}

export function createApiHandler(options: ApiHandlerOptions): ApiHandler {
  const projectChannels = createProjectChannels(options.projectDir);
  let stagingDir = options.stagingDir;
  const staged = (): string => {
    if (!stagingDir) stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elementals-harness-'));
    fs.mkdirSync(stagingDir, { recursive: true });
    return fs.realpathSync(stagingDir);
  };

  /** A path argument of an import call must point into the staging directory. */
  const assertStaged = (sourcePath: unknown): void => {
    if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
      throw new Error('Import source must be a file staged through stage-upload');
    }
    let real: string;
    try {
      real = fs.realpathSync(sourcePath);
    } catch {
      throw new Error('Import source does not exist');
    }
    if (!isWithin(staged(), real)) throw new Error('Import source must be a file staged through stage-upload');
  };

  const guarded = (fn: ChannelFn): ChannelFn => (sourcePath: unknown, ...rest: unknown[]) => {
    try {
      assertStaged(sourcePath);
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
    return fn(sourcePath, ...rest);
  };

  const channels: Record<string, ChannelFn> = {
    ...projectChannels,
    'import-tileset': guarded(projectChannels['import-tileset']),
    'import-sprite': guarded(projectChannels['import-sprite']),
    // The browser has no save dialog: hand the JSON back and let the page download it.
    'export-map': (jsonData: unknown, defaultName: unknown) =>
      typeof jsonData === 'string'
        ? { success: true, json: jsonData, fileName: typeof defaultName === 'string' && defaultName ? defaultName : 'map.json' }
        : { success: false, error: 'Export data must be a string' },
    // Browser stand-in for the native file picker: the page uploads the chosen file, imports then read the copy.
    'stage-upload': (name: unknown, base64: unknown) => {
      try {
        if (typeof base64 !== 'string') throw new Error('Upload data must be a base64 string');
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.length === 0) throw new Error('Upload is empty');
        if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('Upload is too large');
        const fileName = safeUploadName(name);
        const dir = path.join(staged(), crypto.randomBytes(6).toString('hex'));
        fs.mkdirSync(dir, { recursive: true });
        const sourcePath = path.join(dir, fileName);
        fs.writeFileSync(sourcePath, bytes);
        return { success: true, sourcePath, defaultName: path.parse(fileName).name };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  };

  const handle: ApiHandler['handle'] = (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith(API_PREFIX)) return next();

    const fail = (status: number, error: string) => sendJson(res, status, { success: false, error });

    const hostname = hostnameOf(req.headers.host);
    if (!hostname || !LOOPBACK_HOSTS.has(hostname)) return fail(403, 'The project API only answers on localhost');
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        /* rejected below */
      }
      if (originHost !== req.headers.host?.toLowerCase()) return fail(403, 'Cross-origin requests are not allowed');
    }
    if (req.method !== 'POST') return fail(405, 'Use POST');
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return fail(415, 'Content-Type must be application/json');

    const channel = decodeURIComponent(url.slice(API_PREFIX.length).split('?')[0]);
    if (!Object.prototype.hasOwnProperty.call(channels, channel)) return fail(404, `Unknown channel "${channel}"`);

    readBody(req, MAX_BODY_BYTES)
      .then(async (raw) => {
        let args: unknown[] = [];
        if (raw.length > 0) {
          const body: unknown = JSON.parse(raw.toString('utf8'));
          const given = typeof body === 'object' && body !== null ? (body as { args?: unknown }).args : undefined;
          if (given !== undefined && !Array.isArray(given)) throw Object.assign(new Error('"args" must be an array'), { status: 400 });
          args = given ?? [];
        }
        // JSON has no `undefined`: a missing trailing argument arrives as nothing, like in the Electron call.
        sendJson(res, 200, await channels[channel](...args));
      })
      .catch((error: unknown) => {
        const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : error instanceof SyntaxError ? 400 : 500;
        if (!res.headersSent) fail(status, errorMessage(error));
      });
  };

  return {
    handle,
    channels: Object.keys(channels),
    dispose: () => {
      if (stagingDir) fs.rmSync(stagingDir, { recursive: true, force: true });
    },
  };
}

/** Vite plugin: dev server only. */
export function projectApiPlugin(options: { projectDir: string }): Plugin {
  return {
    name: 'elementals-project-api',
    apply: 'serve',
    configureServer(server) {
      const host = server.config.server.host;
      const loopback = host === undefined || host === false || host === 'localhost' || host === '127.0.0.1' || host === '::1';
      if (!loopback) {
        server.config.logger.warn(
          `[project-api] not mounted: the dev server listens on ${String(host)}, and the project API only runs on localhost.`
        );
        return;
      }
      const api = createApiHandler({ projectDir: options.projectDir });
      server.config.logger.info(`[project-api] serving ${API_PREFIX}<channel> from ${options.projectDir}`);
      server.middlewares.use(api.handle);
      server.httpServer?.once('close', api.dispose);
    },
  };
}
