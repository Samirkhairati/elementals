// Minimal PNG header reader (no dependencies, works on any Uint8Array incl. Node Buffers).

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Reads the pixel size from the IHDR chunk. Throws on anything that is not a PNG. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) throw new Error('Not a PNG: file is too short')
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('Not a PNG: bad signature')
  }
  // First chunk must be IHDR: 4 bytes length, then 'IHDR'
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (type !== 'IHDR') throw new Error('Not a PNG: first chunk is not IHDR')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) }
}
