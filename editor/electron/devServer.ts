import path from 'path';
import { fileURLToPath } from 'url';

export const DEFAULT_PORT = 5174;

/** Parse the `PORT` env value; anything that is not an integer in 1-65535 falls back to `fallback`. */
export function parsePort(value: string | undefined, fallback: number = DEFAULT_PORT): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const port = Number(trimmed);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

export interface NavigationPolicy {
  isPackaged: boolean;
  port: number;
  /** Absolute directory the packaged renderer is loaded from. */
  distDir: string;
}

/** Whether the app window may navigate to `rawUrl` (dev server origin, or the packaged dist folder). */
export function isAllowedNavigation(rawUrl: string, policy: NavigationPolicy): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!policy.isPackaged) {
    return url.origin === `http://localhost:${policy.port}`;
  }

  if (url.protocol !== 'file:') return false;
  try {
    const filePath = path.resolve(fileURLToPath(url));
    const dist = path.resolve(policy.distDir);
    return filePath === dist || filePath.startsWith(dist + path.sep);
  } catch {
    return false;
  }
}
