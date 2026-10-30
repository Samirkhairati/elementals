import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  STATUS,
  atomicWriteFile,
  canonicalize,
  checkMaps,
  defaultPaths,
  describeDrift,
  listFiles,
  loadTilesets,
  slugify,
  writeMaps,
} from './maps.mjs'
import { convertEditorMapToTiled, serializeTiledMap } from '../../shared/mapExport.ts'
import { readPngSize } from '../../shared/png.ts'
import { makePng, makeSandbox, makeTmpDir, sampleEditorMap, snapshot, tile, writeJson } from './test-helpers.mjs'

const sandboxes = []
function sandbox(maps) {
  const sb = makeSandbox(maps)
  sandboxes.push(sb)
  return sb
}
afterEach(() => {
  while (sandboxes.length) sandboxes.pop().cleanup()
})

const statusOf = (results, name) => results.find((r) => r.name === name)?.status

describe('slugify', () => {
  test('maps file names to game map names', () => {
    assert.equal(slugify('market.json'), 'market')
    assert.equal(slugify('Map 2.json'), 'map-2')
    assert.equal(slugify('sub/dir/City_Center (v2).JSON'), 'city-center-v2')
    assert.equal(slugify('Café.json'), 'cafe')
    assert.equal(slugify('---.json'), '')
  })
})

describe('readPngSize', () => {
  test('reads width and height from the IHDR chunk', () => {
    assert.deepEqual(readPngSize(makePng(256, 96)), { width: 256, height: 96 })
  })
  test('works on a Uint8Array view with a byte offset', () => {
    const png = makePng(32, 64)
    const padded = Buffer.concat([Buffer.from([1, 2, 3]), png])
    assert.deepEqual(readPngSize(new Uint8Array(padded.buffer, padded.byteOffset + 3, png.length)), { width: 32, height: 64 })
  })
  test('rejects garbage, truncated and non-IHDR input', () => {
    assert.throws(() => readPngSize(Buffer.from('not a png at all, definitely not')), /bad signature/)
    assert.throws(() => readPngSize(makePng(1, 1).subarray(0, 10)), /too short/)
    const broken = makePng(1, 1)
    broken.write('XXXX', 12)
    assert.throws(() => readPngSize(broken), /IHDR/)
  })
  test('reads the real project tilesets', () => {
    for (const file of listFiles(defaultPaths().tilesetsDir, '.png')) {
      const { width, height } = readPngSize(fs.readFileSync(file))
      assert.ok(width > 0 && height > 0, file)
    }
  })
})

describe('loadTilesets', () => {
  test('is recursive, sorted, uses sibling json names and PNG sizes', () => {
    const sb = sandbox()
    fs.writeFileSync(path.join(sb.tilesetsDir, 'broken.png'), 'nope')
    fs.writeFileSync(path.join(sb.tilesetsDir, 'ignored.txt'), 'x')
    assert.deepEqual(loadTilesets(sb.tilesetsDir), [
      { name: 'Outside Tiles', fileName: 'outside.png', width: 256, height: 256 }, // "Inside/" sorts first
      { name: 'broken', fileName: 'broken.png', width: 0, height: 0 },
      { name: 'grass', fileName: 'grass.png', width: 64, height: 64 },
    ])
  })
})

describe('checkMaps statuses', () => {
  test('MISSING_IN_GAME, IN_SYNC, DRIFTED and INVALID', () => {
    const sb = sandbox({
      'missing.json': sampleEditorMap({ name: 'missing' }),
      'synced.json': sampleEditorMap({ name: 'synced' }),
      'drifted.json': sampleEditorMap({ name: 'drifted' }),
      'invalid.json': sampleEditorMap({ name: 'invalid', width: 0 }),
    })
    const tilesets = loadTilesets(sb.tilesetsDir)
    const converted = (name) => convertEditorMapToTiled(sampleEditorMap({ name }), tilesets)
    writeJson(path.join(sb.gameDir, 'synced.json'), converted('synced'))
    const stale = converted('drifted')
    stale.layers[1].data[0] = 3
    writeJson(path.join(sb.gameDir, 'drifted.json'), stale)
    writeJson(path.join(sb.gameDir, 'only-in-game.json'), converted('x'))

    const { results, gameOnly } = checkMaps(sb)
    assert.equal(statusOf(results, 'missing'), STATUS.MISSING_IN_GAME)
    assert.equal(statusOf(results, 'synced'), STATUS.IN_SYNC)
    assert.equal(statusOf(results, 'drifted'), STATUS.DRIFTED)
    assert.equal(statusOf(results, 'invalid'), STATUS.INVALID)
    assert.deepEqual(results.map((r) => r.name), ['drifted', 'invalid', 'missing', 'synced'])
    assert.deepEqual(gameOnly, ['only-in-game'])
    assert.match(results.find((r) => r.name === 'drifted').drift.join('\n'), /layer "ground": 1 cells differ/)
    assert.match(results.find((r) => r.name === 'invalid').errors.join('\n'), /width/)
  })

  test('key order and whitespace in the game copy do not cause drift', () => {
    const sb = sandbox()
    const tiled = convertEditorMapToTiled(sampleEditorMap(), loadTilesets(sb.tilesetsDir))
    fs.writeFileSync(path.join(sb.gameDir, 'sample.json'), JSON.stringify(canonicalize(tiled)))
    assert.equal(statusOf(checkMaps(sb).results, 'sample'), STATUS.IN_SYNC)
  })

  test('finds maps in sub folders; name comes from the file name only', () => {
    const sb = sandbox({ 'towns/Old Town.json': sampleEditorMap({ name: 'whatever' }) })
    const { results } = checkMaps(sb)
    assert.equal(results.length, 1)
    assert.equal(results[0].name, 'old-town')
    assert.equal(results[0].source, 'towns/Old Town.json')
    assert.match(results[0].notes.join('\n'), /internal map name is "whatever"/)
  })

  test('two sources with the same game name are INVALID', () => {
    const sb = sandbox({ 'a/town.json': sampleEditorMap(), 'b/Town.json': sampleEditorMap() })
    const { results } = checkMaps(sb)
    assert.deepEqual(results.map((r) => r.status), [STATUS.INVALID, STATUS.INVALID])
    assert.match(results[0].errors.join(), /several maps/)
  })

  test('unreadable JSON, unknown tilesets and out-of-range tiles are INVALID', () => {
    const sb = sandbox({
      'unknown-tileset.json': sampleEditorMap({ layers: [{ id: 'a', name: 'a', type: 'tile', visible: true, locked: false, data: { 0: tile('nope.png') } }] }),
      'range.json': sampleEditorMap({ layers: [{ id: 'a', name: 'a', type: 'tile', visible: true, locked: false, data: { 99: tile('grass.png') } }] }),
    })
    fs.writeFileSync(path.join(sb.mapsDir, 'garbage.json'), '{ not json')
    const { results } = checkMaps(sb)
    assert.deepEqual(results.map((r) => r.status), [STATUS.INVALID, STATUS.INVALID, STATUS.INVALID])
    assert.match(results.find((r) => r.name === 'garbage').errors[0], /cannot read JSON/)
    assert.match(results.find((r) => r.name === 'unknown-tileset').errors[0], /unknown tileset/)
    assert.match(results.find((r) => r.name === 'range').errors[0], /out of range/)
  })

  test('a corrupt game copy is DRIFTED, not a crash', () => {
    const sb = sandbox()
    fs.writeFileSync(path.join(sb.gameDir, 'sample.json'), '{ broken')
    const { results } = checkMaps(sb)
    assert.equal(results[0].status, STATUS.DRIFTED)
    assert.match(results[0].notes[0], /not valid JSON/)
  })

  test('multi tileset maps get firstgid offsets in order of first use', () => {
    const map = sampleEditorMap({
      layers: [
        { id: 'a', name: 'a', type: 'tile', visible: true, locked: false, data: { 0: tile('outside.png', 2, 1), 1: tile('grass.png', 1, 0) } },
        { id: 'c', name: 'c', type: 'collision', visible: true, locked: false, data: { 2: tile('__collision__') } },
      ],
    })
    const sb = sandbox({ 'm.json': map })
    const tiled = checkMaps(sb).results[0].tiled
    assert.deepEqual(tiled.tilesets.map((t) => [t.name, t.image, t.firstgid, t.tilecount]), [
      ['Outside Tiles', 'outside.png', 1, 64],
      ['grass', 'grass.png', 65, 4],
      ['collision_dummy', 'collision_dummy.png', 69, 1],
    ])
    assert.deepEqual(tiled.layers[0].data, [1 + 1 * 8 + 2, 65 + 1, 0, 0, 0, 0])
    assert.deepEqual(tiled.layers[1].data, [0, 0, 69, 0, 0, 0])
    assert.equal(tiled.entities.length, 1)
  })
})

describe('describeDrift', () => {
  test('summarizes tileset, layer and entity differences', () => {
    const a = { width: 1, height: 1, tilewidth: 32, tileheight: 32, tilesets: [{ name: 'a' }], layers: [{ name: 'x', data: [1, 2] }], entities: [] }
    const b = { ...a, tilesets: [{ name: 'b' }], layers: [{ name: 'x', data: [1, 3] }], entities: [{ id: 1 }] }
    const notes = describeDrift(a, b).join('\n')
    assert.match(notes, /tilesets \[a\] vs \[b\]/)
    assert.match(notes, /layer "x": 1 cells differ/)
    assert.match(notes, /entities: 0 vs 1/)
  })
})

describe('writeMaps / atomicWriteFile', () => {
  function prepare() {
    const sb = sandbox({ 'new.json': sampleEditorMap({ name: 'new' }), 'old.json': sampleEditorMap({ name: 'old' }), 'bad.json': sampleEditorMap({ height: -1 }) })
    writeJson(path.join(sb.gameDir, 'old.json'), { stale: true })
    return { sb, results: checkMaps(sb).results }
  }

  test('default selection writes only MISSING_IN_GAME maps and never touches existing ones', () => {
    const { sb, results } = prepare()
    const before = snapshot(sb.gameDir)
    const actions = writeMaps(results, { gameDir: sb.gameDir })
    assert.deepEqual(actions.map((a) => [a.name, a.action]), [['new', 'written']])
    const after = snapshot(sb.gameDir)
    assert.equal(after['old.json'], before['old.json'])
    assert.deepEqual(Object.keys(after).sort(), ['new.json', 'old.json'])
  })

  test('refuses to overwrite a drifted map without --force, overwrites with it', () => {
    const { sb, results } = prepare()
    const before = snapshot(sb.gameDir)
    assert.deepEqual(writeMaps(results, { gameDir: sb.gameDir, only: ['old'] }).map((a) => a.action), ['refused'])
    assert.deepEqual(snapshot(sb.gameDir), before)
    assert.deepEqual(writeMaps(results, { gameDir: sb.gameDir, only: ['old'], force: true }).map((a) => a.action), ['written'])
    assert.equal(snapshot(sb.gameDir)['old.json'], serializeTiledMap(results.find((r) => r.name === 'old').tiled))
  })

  test('INVALID maps are never written, even with force', () => {
    const { sb, results } = prepare()
    const actions = writeMaps(results, { gameDir: sb.gameDir, only: ['bad'], force: true })
    assert.equal(actions[0].action, 'refused')
    assert.equal(fs.existsSync(path.join(sb.gameDir, 'bad.json')), false)
  })

  test('outDir redirects writes and the game dir stays untouched', () => {
    const { sb, results } = prepare()
    const before = snapshot(sb.gameDir)
    writeMaps(results, { gameDir: sb.gameDir, outDir: sb.outDir, only: ['new', 'old'] })
    assert.deepEqual(snapshot(sb.gameDir), before)
    assert.deepEqual(Object.keys(snapshot(sb.outDir)).sort(), ['new.json', 'old.json'])
  })

  test('an identical existing target is reported unchanged, a different one needs --force', () => {
    const { sb, results } = prepare()
    writeMaps(results, { gameDir: sb.gameDir, outDir: sb.outDir })
    assert.equal(writeMaps(results, { gameDir: sb.gameDir, outDir: sb.outDir })[0].action, 'unchanged')
    fs.writeFileSync(path.join(sb.outDir, 'new.json'), 'edited by hand')
    assert.equal(writeMaps(results, { gameDir: sb.gameDir, outDir: sb.outDir })[0].action, 'refused')
    assert.equal(fs.readFileSync(path.join(sb.outDir, 'new.json'), 'utf8'), 'edited by hand')
  })

  test('output is deterministic: two runs produce identical bytes', () => {
    const { sb, results } = prepare()
    const again = checkMaps(sb).results
    const a = path.join(sb.root, 'out-a')
    const b = path.join(sb.root, 'out-b')
    writeMaps(results, { gameDir: sb.gameDir, outDir: a, only: ['new', 'old'] })
    writeMaps(again, { gameDir: sb.gameDir, outDir: b, only: ['new', 'old'] })
    assert.deepEqual(snapshot(a), snapshot(b))
    const text = snapshot(a)['new.json']
    assert.ok(text.startsWith('{\n  "compressionlevel": -1,\n'), '2-space indent, sorted keys')
    assert.equal(text.endsWith('\n'), false)
    assert.deepEqual(JSON.parse(text), results.find((r) => r.name === 'new').tiled)
  })

  test('atomicWriteFile leaves no temp files and keeps the old content when the write fails', () => {
    const dir = makeTmpDir()
    try {
      const target = path.join(dir, 'nested', 'map.json')
      atomicWriteFile(target, 'one')
      atomicWriteFile(target, 'two')
      assert.equal(fs.readFileSync(target, 'utf8'), 'two')
      assert.deepEqual(fs.readdirSync(path.dirname(target)), ['map.json'])

      // renaming a file over a directory fails: the temp file must be cleaned up
      const dirTarget = path.join(dir, 'is-a-dir.json')
      fs.mkdirSync(dirTarget)
      fs.writeFileSync(path.join(dirTarget, 'keep'), 'x')
      assert.throws(() => atomicWriteFile(dirTarget, 'data'))
      assert.deepEqual(fs.readdirSync(dir).sort(), ['is-a-dir.json', 'nested'])
      assert.equal(fs.readFileSync(path.join(dirTarget, 'keep'), 'utf8'), 'x')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('real repository data', () => {
  test('every map in project/maps validates and converts to a valid Tiled map', () => {
    const { results } = checkMaps(defaultPaths())
    assert.ok(results.length > 0)
    for (const r of results) {
      assert.notEqual(r.status, STATUS.INVALID, `${r.source}: ${r.errors.join('; ')}`)
    }
  })
})
