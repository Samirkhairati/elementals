import fs from 'fs';
import os from 'os';
import path from 'path';

/** Test-only helpers (excluded from the Electron build, see tsconfig.electron.json). */
export function makeTempDirTracker() {
  const dirs: string[] = [];
  return {
    create(prefix = 'elementals-test-'): string {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
      dirs.push(dir);
      return dir;
    },
    cleanup(): void {
      for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Smallest valid PNG header + some payload, enough for signature checks. */
export function fakePng(extra = 'payload'): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(extra)]);
}

export function listDir(dir: string): string[] {
  return fs.readdirSync(dir).sort();
}
