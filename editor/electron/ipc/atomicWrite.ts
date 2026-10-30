import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function bestEffort(fn: () => void): void {
  try {
    fn();
  } catch {
    // Best-effort cleanup / durability step; the primary error (if any) is what matters.
  }
}

/**
 * Write `data` to `filePath` atomically: the content goes to a temp file in the same
 * directory, is fsync'ed, and is then renamed over the target. A crash or error at any
 * point leaves the previous file contents untouched and no temp file behind.
 */
export function atomicWriteFileSync(filePath: string, data: string | Uint8Array): void {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );

  let fd: number | undefined;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o644);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmpPath, filePath);
  } catch (error: unknown) {
    if (fd !== undefined) {
      const openFd = fd;
      bestEffort(() => fs.closeSync(openFd));
    }
    bestEffort(() => fs.rmSync(tmpPath, { force: true }));
    throw error;
  }

  // Persist the rename itself (not supported on Windows directories).
  if (process.platform !== 'win32') {
    bestEffort(() => {
      const dirFd = fs.openSync(dir, 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    });
  }
}

/** Atomically write `value` as pretty-printed JSON. */
export function atomicWriteJsonSync(filePath: string, value: unknown): void {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) throw new TypeError('Value is not JSON serializable');
  atomicWriteFileSync(filePath, json);
}
