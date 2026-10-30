// Shared fixtures for the map pipeline tests (not a test file itself).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

/** Minimal valid PNG header + IHDR chunk of the given size (enough for readPngSize). */
export function makePng(width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const type = Buffer.from('IHDR')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(ihdr.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, ihdr])))
  return Buffer.concat([sig, len, type, ihdr, crc])
}

export function makeTmpDir(prefix = 'elementals-maps-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

export function tile(tilesetId, x = 0, y = 0) {
  return { tilesetId, x, y }
}

/** A small valid editor map using grass.png (2x2 tiles) and the collision pseudo tileset. */
export function sampleEditorMap(overrides = {}) {
  return {
    name: 'sample',
    width: 3,
    height: 2,
    layers: [
      { id: 'c', name: 'collisions', type: 'collision', visible: true, locked: false, data: { 0: tile('__collision__') } },
      { id: 'g', name: 'ground', type: 'tile', visible: true, locked: false, z: 1, data: { 1: tile('grass.png', 1, 1), 5: tile('grass.png', 0, 0) } },
    ],
    entities: [{ id: 'e1', name: 'Sign', x: 32, y: 32, components: { Transform: { x: 32, y: 32 } } }],
    ...overrides,
  }
}

/**
 * Builds a sandbox: <root>/maps, <root>/tilesets (grass.png 64x64 + Inside/outside.png 256x256 with
 * meta name), <root>/game and <root>/out. `maps` is { 'relative/path.json': editorMap }.
 */
export function makeSandbox(maps = { 'sample.json': sampleEditorMap() }) {
  const root = makeTmpDir()
  const dirs = {
    root,
    mapsDir: path.join(root, 'maps'),
    tilesetsDir: path.join(root, 'tilesets'),
    gameDir: path.join(root, 'game'),
    outDir: path.join(root, 'out'),
  }
  fs.mkdirSync(dirs.gameDir, { recursive: true })
  fs.mkdirSync(path.join(dirs.tilesetsDir, 'Inside'), { recursive: true })
  fs.writeFileSync(path.join(dirs.tilesetsDir, 'grass.png'), makePng(64, 64))
  fs.writeFileSync(path.join(dirs.tilesetsDir, 'Inside', 'outside.png'), makePng(256, 256))
  writeJson(path.join(dirs.tilesetsDir, 'Inside', 'outside.json'), { name: 'Outside Tiles' })
  for (const [rel, map] of Object.entries(maps)) writeJson(path.join(dirs.mapsDir, rel), map)
  fs.mkdirSync(dirs.mapsDir, { recursive: true })
  return {
    ...dirs,
    cliArgs: ['--maps-dir', dirs.mapsDir, '--tilesets-dir', dirs.tilesetsDir, '--game-dir', dirs.gameDir],
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

/** Lists files below dir as { relativePath: content } for before/after comparisons. */
export function snapshot(dir) {
  const out = {}
  if (!fs.existsSync(dir)) return out
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf8')
    }
  }
  walk(dir)
  return out
}
