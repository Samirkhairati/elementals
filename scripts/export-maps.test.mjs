// End-to-end tests of the CLI through child_process (temp directories only; the real
// game/public/data/maps is only ever read).
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertEditorMapToTiled, serializeTiledMap } from '../shared/mapExport.ts'
import { loadTilesets } from './lib/maps.mjs'
import { makeSandbox, sampleEditorMap, snapshot, writeJson } from './lib/test-helpers.mjs'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'export-maps.mjs')
const REPO = path.resolve(path.dirname(CLI), '..')

function run(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: REPO })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const sandboxes = []
function sandbox(maps) {
  const sb = makeSandbox(maps)
  sandboxes.push(sb)
  return sb
}
afterEach(() => {
  while (sandboxes.length) sandboxes.pop().cleanup()
})

function sandboxWithAllStatuses() {
  const sb = sandbox({
    'missing.json': sampleEditorMap({ name: 'missing' }),
    'synced.json': sampleEditorMap({ name: 'synced' }),
    'drifted.json': sampleEditorMap({ name: 'drifted' }),
  })
  const tilesets = loadTilesets(sb.tilesetsDir)
  writeJson(path.join(sb.gameDir, 'synced.json'), convertEditorMapToTiled(sampleEditorMap({ name: 'synced' }), tilesets))
  writeJson(path.join(sb.gameDir, 'drifted.json'), { ...convertEditorMapToTiled(sampleEditorMap(), tilesets), width: 99 })
  return sb
}

describe('--check', () => {
  test('is the default; prints the table; drift and missing are warnings (exit 0)', () => {
    const sb = sandboxWithAllStatuses()
    const before = snapshot(sb.gameDir)
    const explicit = run(['--check', ...sb.cliArgs])
    const implicit = run(sb.cliArgs)
    assert.equal(implicit.code, 0, implicit.err)
    assert.equal(implicit.out, explicit.out)
    assert.match(implicit.out, /DRIFTED\s+drifted\s+drifted\.json\s+drifted\.json/)
    assert.match(implicit.out, /MISSING_IN_GAME\s+missing\s+missing\.json\s+\(none\)/)
    assert.match(implicit.out, /IN SYNC\s+synced\s+synced\.json\s+synced\.json/)
    assert.match(implicit.out, /differs: width: 3 vs 99 in game/)
    assert.match(implicit.out, /3 map\(s\): 1 in sync, 1 drifted, 1 missing in game, 0 invalid/)
    assert.deepEqual(snapshot(sb.gameDir), before, 'check never writes')
  })

  test('exits 1 when a map is INVALID', () => {
    const sb = sandbox({ 'bad.json': sampleEditorMap({ width: -3 }), 'ok.json': sampleEditorMap() })
    const r = run(sb.cliArgs)
    assert.equal(r.code, 1)
    assert.match(r.out, /INVALID\s+bad/)
    assert.match(r.out, /error: map\.width must be a positive integer/)
  })

  test('--strict turns DRIFTED and MISSING_IN_GAME into failures', () => {
    const sb = sandboxWithAllStatuses()
    const r = run(['--strict', ...sb.cliArgs])
    assert.equal(r.code, 1)
    assert.match(r.err, /--strict/)
    const onlySynced = sandbox({ 'synced.json': sampleEditorMap({ name: 'synced' }) })
    writeJson(path.join(onlySynced.gameDir, 'synced.json'), convertEditorMapToTiled(sampleEditorMap({ name: 'synced' }), loadTilesets(onlySynced.tilesetsDir)))
    assert.equal(run(['--strict', ...onlySynced.cliArgs]).code, 0)
  })

  test('output is deterministic', () => {
    const sb = sandboxWithAllStatuses()
    assert.equal(run(sb.cliArgs).out, run(sb.cliArgs).out)
  })

  test('usage errors exit 2', () => {
    const sb = sandbox()
    assert.equal(run(['--check', '--write', ...sb.cliArgs]).code, 2)
    assert.equal(run(['--bogus', ...sb.cliArgs]).code, 2)
    assert.equal(run(['--force', ...sb.cliArgs]).code, 2)
    assert.equal(run(['--write', '--only', 'nope', ...sb.cliArgs]).code, 2)
    assert.equal(run(['--maps-dir', path.join(sb.root, 'does-not-exist'), '--tilesets-dir', sb.tilesetsDir]).code, 2)
    assert.equal(run(['--help']).code, 0)
  })
})

describe('--write', () => {
  test('writes only missing maps, into --out-dir, and leaves the game dir alone', () => {
    const sb = sandboxWithAllStatuses()
    const before = snapshot(sb.gameDir)
    const r = run(['--write', '--out-dir', sb.outDir, ...sb.cliArgs])
    assert.equal(r.code, 0, r.err)
    assert.deepEqual(Object.keys(snapshot(sb.outDir)), ['missing.json'])
    assert.deepEqual(snapshot(sb.gameDir), before)
    assert.match(r.out, /wrote .*missing\.json/)
    assert.match(r.out, /Left untouched \(drifted.*: drifted/)
    const tilesets = loadTilesets(sb.tilesetsDir)
    assert.equal(snapshot(sb.outDir)['missing.json'], serializeTiledMap(convertEditorMapToTiled(sampleEditorMap({ name: 'missing' }), tilesets)))
  })

  test('without --out-dir it writes missing maps into the game dir (sandbox) and a rerun is a no-op', () => {
    const sb = sandboxWithAllStatuses()
    assert.equal(run(['--write', ...sb.cliArgs]).code, 0)
    assert.ok(fs.existsSync(path.join(sb.gameDir, 'missing.json')))
    const after = snapshot(sb.gameDir)
    const again = run(['--write', ...sb.cliArgs])
    assert.equal(again.code, 0)
    assert.match(again.out, /Nothing to write/)
    assert.deepEqual(snapshot(sb.gameDir), after)
    assert.deepEqual(fs.readdirSync(sb.gameDir).filter((f) => f.endsWith('.tmp')), [])
  })

  test('refuses to overwrite a drifted map without --force (exit 1), --only + --force overwrites', () => {
    const sb = sandboxWithAllStatuses()
    const before = snapshot(sb.gameDir)
    const refused = run(['--write', '--only', 'drifted', ...sb.cliArgs])
    assert.equal(refused.code, 1)
    assert.match(refused.err, /refused .*drifted\.json: file exists, pass --force/)
    assert.deepEqual(snapshot(sb.gameDir), before)

    const forced = run(['--write', '--only', 'drifted', '--force', ...sb.cliArgs])
    assert.equal(forced.code, 0, forced.err)
    const after = snapshot(sb.gameDir)
    assert.equal(after['synced.json'], before['synced.json'])
    assert.notEqual(after['drifted.json'], before['drifted.json'])
    assert.equal(JSON.parse(after['drifted.json']).width, 3)
    assert.equal(fs.existsSync(path.join(sb.gameDir, 'missing.json')), false, '--only restricts the selection')
  })

  test('--only accepts comma separated and repeated names', () => {
    const sb = sandbox({ 'a.json': sampleEditorMap(), 'b.json': sampleEditorMap(), 'c.json': sampleEditorMap() })
    const ok = run(['--write', '--only', 'a,b', '--out-dir', sb.outDir, ...sb.cliArgs])
    assert.equal(ok.code, 0, ok.err)
    assert.deepEqual(Object.keys(snapshot(sb.outDir)).sort(), ['a.json', 'b.json'])
    assert.equal(run(['--write', '--only', 'c', '--only', 'a', '--out-dir', sb.outDir, ...sb.cliArgs]).code, 0)
    assert.deepEqual(Object.keys(snapshot(sb.outDir)).sort(), ['a.json', 'b.json', 'c.json'])
  })

  test('never writes an INVALID map, even with --force, and exits 1', () => {
    const sb = sandbox({ 'bad.json': sampleEditorMap({ height: 0 }), 'ok.json': sampleEditorMap() })
    const r = run(['--write', '--only', 'bad', '--force', '--out-dir', sb.outDir, ...sb.cliArgs])
    assert.equal(r.code, 1)
    assert.equal(fs.existsSync(path.join(sb.outDir, 'bad.json')), false)
    // the invalid map does not stop the valid one from being exported by default
    const all = run(['--write', '--out-dir', sb.outDir, ...sb.cliArgs])
    assert.equal(all.code, 1)
    assert.deepEqual(Object.keys(snapshot(sb.outDir)), ['ok.json'])
  })

  test('a hand-edited file in --out-dir is protected without --force', () => {
    const sb = sandbox()
    assert.equal(run(['--write', '--out-dir', sb.outDir, ...sb.cliArgs]).code, 0)
    fs.writeFileSync(path.join(sb.outDir, 'sample.json'), 'hand edited')
    const r = run(['--write', '--only', 'sample', '--out-dir', sb.outDir, ...sb.cliArgs])
    assert.equal(r.code, 1)
    assert.equal(fs.readFileSync(path.join(sb.outDir, 'sample.json'), 'utf8'), 'hand edited')
  })

  test('two runs produce byte-identical files', () => {
    const sb = sandbox({ 'a.json': sampleEditorMap(), 'sub/b.json': sampleEditorMap({ name: 'b' }) })
    const one = path.join(sb.root, 'one')
    const two = path.join(sb.root, 'two')
    assert.equal(run(['--write', '--out-dir', one, ...sb.cliArgs]).code, 0)
    assert.equal(run(['--write', '--out-dir', two, ...sb.cliArgs]).code, 0)
    assert.deepEqual(snapshot(one), snapshot(two))
    assert.deepEqual(Object.keys(snapshot(one)).sort(), ['a.json', 'b.json'])
  })
})

describe('real repository', () => {
  test('--check on the real maps exits 0, prints no warnings on stderr and modifies nothing', () => {
    const gameDir = path.join(REPO, 'game', 'public', 'data', 'maps')
    const mapsDir = path.join(REPO, 'project', 'maps')
    const before = [snapshot(gameDir), snapshot(mapsDir)]
    const r = run(['--check'])
    assert.equal(r.code, 0, r.out + r.err)
    assert.equal(r.err, '')
    assert.match(r.out, /STATUS\s+MAP\s+SOURCE\s+GAME FILE/)
    assert.deepEqual([snapshot(gameDir), snapshot(mapsDir)], before)
  })
})
