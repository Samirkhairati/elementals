import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  STATUS,
  applyPlan,
  defaultPaths,
  loadCharacters,
  planSync,
  runCli,
  syncAssets,
} from './assets.mjs'
import { buildCharacterManifest } from './assets-validate.mjs'
import { makePng, makeTmpDir, snapshot, writeJson } from './test-helpers.mjs'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sync-assets.mjs')

const tmpRoots = []
afterEach(() => {
  while (tmpRoots.length) fs.rmSync(tmpRoots.pop(), { recursive: true, force: true })
})

const cut = (image, frameWidth, frameHeight) => ({ image, frameWidth, frameHeight, margin: 0, spacing: 0 })
const row = (n, k) => [0, 1, 2, 3].map((i) => i * n + k)
const clipRows = (sheet, fps, loop, frames) => ({ sheet, fps, loop, directional: true, byFacing: { down: frames(0), left: frames(1), right: frames(2), up: frames(3) } })
/** A four-facing hero (walk + run sheets, 4x4 frames of 32x48) and a static ball (24x24). */
const heroDef = (over = {}) => ({
  version: 2, name: 'Hero', tags: [], facing: 'four', pivot: { x: 0.5, y: 1 },
  sheets: { walk: cut('sprites/characters/hero/walk.png', 32, 48), run: cut('sprites/characters/hero/run.png', 32, 48) },
  clips: {
    idle: clipRows('walk', 1, false, (r) => [r * 4]),
    walk: clipRows('walk', 10, true, (r) => [r * 4, r * 4 + 1, r * 4 + 2, r * 4 + 3]),
    run: clipRows('run', 15, true, (r) => [r * 4, r * 4 + 1, r * 4 + 2, r * 4 + 3]),
  },
  bindings: { idle: 'idle', walk: 'walk', run: 'run' },
  ...over,
})
const ballDef = (over = {}) => ({
  version: 2, name: 'Ball', tags: [], facing: 'none', pivot: { x: 0.5, y: 1 },
  sheets: { sheet: cut('props/ball.png', 24, 24) }, clips: {}, bindings: {}, still: { sheet: 'sheet', frame: 0 },
  ...over,
})

/** <root>/project (database/characters, graphics, tilesets, database.json) and <root>/public (the game's public dir). */
function sandbox({ database = {}, withTilesets = true } = {}) {
  const root = makeTmpDir('elementals-assets-')
  tmpRoots.push(root)
  const projectDir = path.join(root, 'project')
  const publicDir = path.join(root, 'game', 'public')
  fs.mkdirSync(path.join(projectDir, 'database', 'characters'), { recursive: true })
  fs.mkdirSync(publicDir, { recursive: true })
  writeJson(path.join(projectDir, 'database.json'), {
    version: 1,
    switches: [{ id: 'intro_done', name: 'Intro done' }],
    variables: [{ id: 'badges', name: 'Badges', initial: 0 }],
    ...database,
  })
  const sb = {
    root,
    projectDir,
    publicDir,
    args: ['--project-dir', projectDir, '--game-dir', path.join(root, 'game')],
    graphic(id, w, h) {
      const file = path.join(projectDir, 'graphics', id)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, makePng(w, h))
    },
    character(id, def, graphics = {}) {
      writeJson(path.join(projectDir, 'database', 'characters', `${id}.json`), def)
      for (const [gid, [w, h]] of Object.entries(graphics)) sb.graphic(gid, w, h)
    },
    tileset(rel, w = 32, h = 32) {
      const file = path.join(projectDir, 'tilesets', rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, makePng(w, h))
    },
    gameTileset(name, w = 16, h = 16) {
      const file = path.join(publicDir, 'graphics', 'tilesets', `${name}.png`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, makePng(w, h))
    },
    sync(opts = {}) {
      return syncAssets({ projectDir, publicDir, write: true, ...opts })
    },
    json: (rel) => JSON.parse(fs.readFileSync(path.join(publicDir, rel), 'utf8')),
    cli(argv) {
      let stdout = ''
      let stderr = ''
      const code = runCli([...sb.args, ...argv], { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s) })
      return { code, stdout, stderr }
    },
  }
  sb.character('characters/hero', heroDef(), { 'sprites/characters/hero/walk.png': [128, 192], 'sprites/characters/hero/run.png': [128, 192] })
  sb.character('objects/ball', ballDef(), { 'props/ball.png': [24, 24] })
  if (withTilesets) {
    sb.tileset('Outside/grass.png')
    sb.tileset('Inside/interior.png', 64, 64)
  }
  return sb
}

const find = (plan, rel) => plan.actions.find((a) => a.rel === rel)
const errorsOf = (sb) => planSync({ projectDir: sb.projectDir, publicDir: sb.publicDir }).errors.join('\n')

describe('loadCharacters / manifest', () => {
  test('loads sorted, validated characters; the manifest has web-relative URLs per sheet key', () => {
    const sb = sandbox()
    const { characters, graphics, errors, warnings } = loadCharacters(sb.projectDir)
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
    assert.deepEqual(characters.map((c) => c.id), ['characters/hero', 'objects/ball'])
    assert.deepEqual(Object.keys(graphics).sort(), ['props/ball.png', 'sprites/characters/hero/run.png', 'sprites/characters/hero/walk.png'])
    const manifest = buildCharacterManifest(characters)
    assert.equal(manifest.version, 2)
    assert.deepEqual(manifest.characters[0].files, {
      walk: 'graphics/sprites/characters/hero/walk.png',
      run: 'graphics/sprites/characters/hero/run.png',
    })
    assert.equal(manifest.characters[1].def.sheets.sheet.frameWidth, 24)
  })

  test('only graphics that characters use are loaded', () => {
    const sb = sandbox()
    sb.graphic('unused/thing.png', 8, 8)
    assert.ok(!('unused/thing.png' in loadCharacters(sb.projectDir).graphics))
  })

  test('warns about frames beyond the sheet', () => {
    const sb = sandbox()
    sb.character('objects/ball', ballDef({ clips: { spin: { sheet: 'sheet', fps: 4, loop: true, directional: false, frames: [0, 5] } } }), { 'props/ball.png': [24, 24] })
    assert.match(loadCharacters(sb.projectDir).warnings.join(), /frame 5/)
  })

  test('a missing characters directory is just empty', () => {
    const root = makeTmpDir()
    tmpRoots.push(root)
    assert.deepEqual(loadCharacters(root), { characters: [], graphics: {}, errors: [], warnings: [] })
  })
})

describe('validation errors (nothing is written)', () => {
  const charFile = (sb, id) => path.join(sb.projectDir, 'database/characters', `${id}.json`)
  const cases = [
    ['missing graphic', (sb) => fs.rmSync(path.join(sb.projectDir, 'graphics/sprites/characters/hero/run.png')), /character "characters\/hero": .*not in the graphics library/],
    ['invalid character', (sb) => writeJson(charFile(sb, 'objects/ball'), ballDef({ facing: 'eight' })), /character "objects\/ball": Facing must be/],
    ['directional clip on a facing-none character', (sb) => writeJson(charFile(sb, 'objects/ball'), ballDef({ clips: { a: { sheet: 'sheet', fps: 1, loop: true, directional: true, byFacing: {} } } })), /no facing/],
    ['invalid JSON', (sb) => fs.writeFileSync(charFile(sb, 'objects/ball'), '{nope'), /not valid JSON/],
    ['graphic is not a PNG', (sb) => fs.writeFileSync(path.join(sb.projectDir, 'graphics/props/ball.png'), 'text, not a png at all!!'), /graphic "props\/ball.png": Not a PNG/],
    ['graphic path escapes', (sb) => writeJson(charFile(sb, 'objects/ball'), ballDef({ sheets: { sheet: cut('../secret.png', 24, 24) } })), /not a valid graphic id/],
    ['invalid id', (sb) => sb.character('bad name', ballDef(), { 'props/ball.png': [24, 24] }), /invalid id/],
    ['unmigrated v1 sprite', (sb) => writeJson(charFile(sb, 'objects/ball'), { version: 1, name: 'x', kind: 'object' }), /assets:migrate/],
    ['v1 sprites left in project/sprites', (sb) => writeJson(path.join(sb.projectDir, 'sprites/objects/old/sprite.json'), { version: 1 }), /project\/sprites still holds/],
    ['broken database', (sb) => writeJson(path.join(sb.projectDir, 'database.json'), { version: 1, switches: [{ id: 'a', name: '' }], variables: [] }), /database\.json: switches\[0\]\.name/],
    ['database JSON', (sb) => fs.writeFileSync(path.join(sb.projectDir, 'database.json'), '{'), /database\.json: not valid JSON/],
    ['tileset name clash', (sb) => sb.tileset('Other/grass.png'), /share the game name "grass"/],
  ]
  for (const [label, mutate, pattern] of cases) {
    test(label, () => {
      const sb = sandbox()
      mutate(sb)
      assert.match(errorsOf(sb), pattern)
      const before = snapshot(sb.publicDir)
      const r = sb.cli(['--write'])
      assert.equal(r.code, 1)
      assert.match(r.stdout + r.stderr, pattern)
      assert.deepEqual(snapshot(sb.publicDir), before, 'no file written')
      assert.throws(() => applyPlan(planSync({ projectDir: sb.projectDir, publicDir: sb.publicDir }), { publicDir: sb.publicDir }), /refusing to write/)
    })
  }
})

describe('sync', () => {
  test('first write creates sheets, tilesets and manifests', () => {
    const sb = sandbox()
    const { applied, ok } = sb.sync()
    assert.equal(ok, true)
    assert.deepEqual(
      applied.map((a) => a.rel).sort(),
      [
        'data/characters.json',
        'data/common.json',
        'data/database.json',
        'data/tilesets.json',
        'graphics/props/ball.png',
        'graphics/sprites/characters/hero/run.png',
        'graphics/sprites/characters/hero/walk.png',
        'graphics/tilesets/grass.png',
        'graphics/tilesets/interior.png',
      ]
    )
    assert.deepEqual(fs.readFileSync(path.join(sb.publicDir, 'graphics/props/ball.png')), makePng(24, 24))
    assert.deepEqual(sb.json('data/database.json').switches, [{ id: 'intro_done', name: 'Intro done' }])
    assert.deepEqual(sb.json('data/characters.json').characters.find((c) => c.id === 'objects/ball').files, { sheet: 'graphics/props/ball.png' })
  })

  test('is idempotent and deterministic', () => {
    const sb = sandbox()
    sb.sync()
    const first = snapshot(sb.publicDir)
    const again = sb.sync()
    assert.deepEqual(again.applied, [])
    assert.equal(again.drift.length, 0)
    assert.deepEqual(snapshot(sb.publicDir), first)
    // a second sandbox with the same inputs gives byte-identical manifests
    const other = sandbox()
    other.sync()
    for (const f of ['data/characters.json', 'data/database.json', 'data/tilesets.json', 'data/common.json']) {
      assert.equal(fs.readFileSync(path.join(other.publicDir, f), 'utf8'), fs.readFileSync(path.join(sb.publicDir, f), 'utf8'))
    }
  })

  test('manifests end with a newline and carry no timestamps', () => {
    const sb = sandbox()
    sb.sync()
    for (const f of ['data/characters.json', 'data/database.json', 'data/tilesets.json', 'data/common.json']) {
      const text = fs.readFileSync(path.join(sb.publicDir, f), 'utf8')
      assert.ok(text.endsWith('}\n'), f)
      assert.doesNotMatch(text, /20\d\d-\d\d-\d\d/)
    }
  })

  test('leaves no temp files behind', () => {
    const sb = sandbox()
    sb.sync()
    const leftovers = Object.keys(snapshot(sb.publicDir)).filter((f) => f.endsWith('.tmp'))
    assert.deepEqual(leftovers, [])
  })

  test('copies changed graphics, removes stale generated ones and empty dirs, retires data/sprites.json', () => {
    const sb = sandbox()
    sb.sync()
    fs.mkdirSync(path.join(sb.publicDir, 'data'), { recursive: true })
    fs.writeFileSync(path.join(sb.publicDir, 'data/sprites.json'), '{}')
    sb.character('objects/ball', ballDef({ sheets: { sheet: cut('props/ball.png', 48, 24) } }), { 'props/ball.png': [48, 24] })
    fs.rmSync(path.join(sb.projectDir, 'database/characters/characters'), { recursive: true })
    const r = sb.sync()
    const byRel = Object.fromEntries(r.applied.map((a) => [a.rel, a.status]))
    assert.equal(byRel['graphics/props/ball.png'], STATUS.UPDATE)
    assert.equal(byRel['graphics/sprites/characters/hero/walk.png'], STATUS.STALE)
    assert.equal(byRel['data/sprites.json'], STATUS.STALE)
    assert.equal(fs.existsSync(path.join(sb.publicDir, 'graphics/sprites/characters')), false)
    assert.equal(fs.existsSync(path.join(sb.publicDir, 'data/sprites.json')), false)
    assert.deepEqual(sb.json('data/characters.json').characters.map((c) => c.id), ['objects/ball'])
    assert.equal(sb.json('data/characters.json').characters[0].def.sheets.sheet.frameWidth, 48)
  })

  test('never touches maps or other game files', () => {
    const sb = sandbox()
    fs.mkdirSync(path.join(sb.publicDir, 'data/maps'), { recursive: true })
    fs.writeFileSync(path.join(sb.publicDir, 'data/maps/city.json'), '{"keep":true}')
    fs.mkdirSync(path.join(sb.publicDir, 'graphics/player'), { recursive: true })
    fs.writeFileSync(path.join(sb.publicDir, 'graphics/player/walk.png'), 'legacy')
    fs.mkdirSync(path.join(sb.projectDir, 'maps'), { recursive: true })
    fs.writeFileSync(path.join(sb.projectDir, 'maps/city.json'), '{"project":true}')
    const mapsBefore = snapshot(path.join(sb.projectDir, 'maps'))
    sb.sync({ force: true })
    assert.equal(fs.readFileSync(path.join(sb.publicDir, 'data/maps/city.json'), 'utf8'), '{"keep":true}')
    assert.equal(fs.readFileSync(path.join(sb.publicDir, 'graphics/player/walk.png'), 'utf8'), 'legacy')
    assert.deepEqual(snapshot(path.join(sb.projectDir, 'maps')), mapsBefore)
  })

  test('does not modify the project', () => {
    const sb = sandbox()
    const before = snapshot(sb.projectDir)
    sb.sync()
    assert.deepEqual(snapshot(sb.projectDir), before)
  })

  test('a project without database.json yields an empty database (with a warning)', () => {
    const sb = sandbox()
    fs.rmSync(path.join(sb.projectDir, 'database.json'))
    const r = sb.sync()
    assert.deepEqual(sb.json('data/database.json'), { version: 1, switches: [], variables: [] })
    assert.match(r.plan.warnings.join(), /database\.json not found/)
  })
})

describe('tilesets', () => {
  test('copies only missing tilesets and lists every game tileset (name = file stem)', () => {
    const sb = sandbox()
    sb.gameTileset('grass', 16, 16) // exists in the game with different content
    sb.gameTileset('collision') // game-only tileset
    const r = sb.sync()
    assert.equal(find(r.plan, 'graphics/tilesets/grass.png').status, STATUS.DIFFERS)
    assert.equal(find(r.plan, 'graphics/tilesets/interior.png').status, STATUS.CREATE)
    assert.deepEqual(fs.readFileSync(path.join(sb.publicDir, 'graphics/tilesets/grass.png')), makePng(16, 16), 'existing tileset kept')
    assert.deepEqual(sb.json('data/tilesets.json').tilesets.map((t) => t.name), ['collision', 'grass', 'interior'])
    assert.deepEqual(sb.json('data/tilesets.json').tilesets[0], { name: 'collision', file: 'graphics/tilesets/collision.png' })
  })

  test('--force overwrites differing tilesets', () => {
    const sb = sandbox()
    sb.gameTileset('grass', 16, 16)
    const r = sb.sync({ force: true })
    assert.equal(find(r.plan, 'graphics/tilesets/grass.png').status, STATUS.UPDATE)
    assert.deepEqual(fs.readFileSync(path.join(sb.publicDir, 'graphics/tilesets/grass.png')), makePng(32, 32))
  })

  test('identical tilesets are up to date', () => {
    const sb = sandbox()
    sb.sync()
    const r = planSync({ projectDir: sb.projectDir, publicDir: sb.publicDir })
    assert.equal(find(r, 'graphics/tilesets/grass.png').status, STATUS.UNCHANGED)
  })

  test('no tilesets anywhere gives an empty list', () => {
    const sb = sandbox({ withTilesets: false })
    sb.sync()
    assert.deepEqual(sb.json('data/tilesets.json'), { version: 1, tilesets: [] })
  })
})

describe('CLI', () => {
  test('--check reports drift with exit 1 and writes nothing', () => {
    const sb = sandbox()
    const r = sb.cli([])
    assert.equal(r.code, 1)
    assert.match(r.stdout, /create\s+data\/characters\.json/)
    assert.match(r.stderr, /npm run assets:sync/)
    assert.deepEqual(snapshot(sb.publicDir), {})
  })

  test('--write then --check is clean (exit 0)', () => {
    const sb = sandbox()
    assert.equal(sb.cli(['--write']).code, 0)
    const r = sb.cli(['--check'])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /0 missing, 0 outdated, 0 stale/)
  })

  test('--check detects outdated and stale generated files', () => {
    const sb = sandbox()
    sb.sync()
    fs.writeFileSync(path.join(sb.publicDir, 'data/characters.json'), '{}')
    fs.mkdirSync(path.join(sb.publicDir, 'graphics/props'), { recursive: true })
    fs.writeFileSync(path.join(sb.publicDir, 'graphics/props/old.png'), 'x')
    const r = sb.cli([])
    assert.equal(r.code, 1)
    assert.match(r.stdout, /update\s+data\/characters\.json/)
    assert.match(r.stdout, /stale\s+graphics\/props\/old\.png/)
  })

  test('differing game tilesets fail --check only with --strict', () => {
    const sb = sandbox()
    sb.gameTileset('grass', 16, 16)
    sb.sync()
    assert.equal(sb.cli([]).code, 0)
    const strict = sb.cli(['--strict'])
    assert.equal(strict.code, 1)
    assert.match(strict.stdout, /differs\s+graphics\/tilesets\/grass\.png/)
  })

  test('--out-dir redirects all output', () => {
    const sb = sandbox()
    const out = path.join(sb.root, 'preview')
    assert.equal(sb.cli(['--write', '--out-dir', out]).code, 0)
    assert.ok(fs.existsSync(path.join(out, 'data/characters.json')))
    assert.deepEqual(snapshot(sb.publicDir), {})
  })

  test('usage errors', () => {
    const sb = sandbox()
    assert.equal(sb.cli(['--check', '--write']).code, 2)
    assert.equal(sb.cli(['--force']).code, 2)
    assert.equal(sb.cli(['--write', '--strict']).code, 2)
    assert.equal(sb.cli(['--nope']).code, 2)
    assert.equal(runCli(['--project-dir', path.join(sb.root, 'missing')], { stderr: () => {} }), 2)
    let help = ''
    assert.equal(runCli(['--help'], { stdout: (s) => (help += s) }), 0)
    assert.match(help, /--out-dir/)
  })

  test('runs as a real process', () => {
    const sb = sandbox()
    const run = (extra) => spawnSync(process.execPath, [SCRIPT, ...sb.args, ...extra], { encoding: 'utf8' })
    assert.equal(run(['--check']).status, 1)
    assert.equal(run(['--write']).status, 0)
    assert.equal(run(['--check']).status, 0)
  })
})

describe('the real project', () => {
  test('default paths point at project/ and game/public', () => {
    const p = defaultPaths()
    assert.ok(p.projectDir.endsWith(path.join('elementals', 'project')) || p.projectDir.endsWith('project'))
    assert.ok(p.publicDir.endsWith(path.join('game', 'public')))
  })

  test('the committed project is valid and its generated output is current', () => {
    const { projectDir, publicDir } = defaultPaths()
    const plan = planSync({ projectDir, publicDir })
    assert.deepEqual(plan.errors, [])
    assert.deepEqual(plan.actions.filter((a) => [STATUS.CREATE, STATUS.UPDATE, STATUS.STALE].includes(a.status)).map((a) => `${a.status} ${a.rel}`), [])
  })

  test('the player matches how the game used to load it', () => {
    const { projectDir } = defaultPaths()
    const { characters } = loadCharacters(projectDir)
    const player = characters.find((c) => c.id === 'characters/player')
    assert.ok(player)
    assert.equal(player.def.facing, 'four')
    assert.deepEqual(player.def.sheets.walk, { image: 'sprites/characters/player/walk.png', frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0 })
    assert.deepEqual(player.def.bindings, { idle: 'idle', walk: 'walk', run: 'run' })
    assert.equal(player.def.clips.walk.fps, 10)
    assert.equal(player.def.clips.run.fps, 15)
  })
})

describe('common events', () => {
  const common = (id, calls = []) => ({
    version: 1,
    id,
    name: id,
    graph: {
      nodes: [
        { id: 's', type: 'start', params: {}, out: calls[0] ? { next: 'c0' } : {}, x: 0, y: 0 },
        ...calls.map((c, i) => ({ id: `c${i}`, type: 'callCommonEvent', params: { id: c }, out: calls[i + 1] ? { next: `c${i + 1}` } : {}, x: 0, y: 0 })),
      ],
      frames: [],
    },
  })

  test('are bundled into data/common.json sorted by id; no folder gives an empty list', () => {
    const sb = sandbox()
    sb.sync()
    assert.deepEqual(sb.json('data/common.json'), { version: 1, events: [] })
    writeJson(path.join(sb.projectDir, 'common', 'b.json'), common('b'))
    writeJson(path.join(sb.projectDir, 'common', 'a.json'), common('a', ['b']))
    const r = sb.sync()
    assert.equal(r.ok, true)
    assert.deepEqual(sb.json('data/common.json').events.map((e) => e.id), ['a', 'b'])
  })

  test('bad JSON, an id that differs from the file name and call cycles are errors', () => {
    const sb = sandbox()
    fs.mkdirSync(path.join(sb.projectDir, 'common'), { recursive: true })
    fs.writeFileSync(path.join(sb.projectDir, 'common', 'broken.json'), '{')
    writeJson(path.join(sb.projectDir, 'common', 'x.json'), common('y'))
    writeJson(path.join(sb.projectDir, 'common', 'p.json'), common('p', ['q']))
    writeJson(path.join(sb.projectDir, 'common', 'q.json'), common('q', ['p']))
    const r = sb.sync()
    assert.equal(r.ok, false)
    const text = r.plan.errors.join('\n')
    assert.match(text, /common\/broken\.json: not valid JSON/)
    assert.match(text, /common\/x\.json: id "y" does not match/)
    assert.match(text, /common\/p\.json: .*loop/)
    assert.match(text, /common\/q\.json: .*loop/)
  })
})
