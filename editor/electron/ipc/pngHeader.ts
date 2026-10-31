import fs from 'fs';
import path from 'path';

/** PNG header helpers for the main process (a dependency-free twin of shared/png.ts). */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Pixel size from the IHDR chunk of a PNG held in memory. Throws on anything that is not a PNG. */
export function readPngSizeFromBytes(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) throw new Error('Not a PNG: file is too short');
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('Not a PNG: bad signature');
  }
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') {
    throw new Error('Not a PNG: first chunk is not IHDR');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

/** Pixel size of a PNG file; only the first 24 bytes are read. */
export function readPngSizeFromFile(file: string): { width: number; height: number } {
  const fd = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(24);
    const read = fs.readSync(fd, header, 0, header.length, 0);
    return readPngSizeFromBytes(header.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
}

/** Make sure `sourcePath` is an absolute path to a regular `.png` file with a valid PNG header; returns its size. */
export function assertPngFile(sourcePath: unknown, what: string): { width: number; height: number } {
  if (typeof sourcePath !== 'string' || sourcePath.includes('\0') || !path.isAbsolute(sourcePath)) {
    throw new Error(`${what} source must be an absolute file path`);
  }
  if (path.extname(sourcePath).toLowerCase() !== '.png') throw new Error(`${what} source must be a .png file`);
  if (!fs.statSync(sourcePath).isFile()) throw new Error(`${what} source is not a regular file`);
  try {
    return readPngSizeFromFile(sourcePath);
  } catch {
    throw new Error(`${what} source is not a valid PNG image`);
  }
}
