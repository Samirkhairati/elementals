import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMigration, planMigration, runCli } from './migrate-characters.mjs'
import { spriteMetaToCharacter } from '../../shared/engine/characterMigrate.ts'
import { makePng, makeTmpDir, snapshot, writeJson } from './test-helpers.mjs'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'fixtures', 'sprites-v1')
const PROJECT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'project')

const roots = []
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true })
})

const meta = (over = {}) => ({ version: 1, name: 'Hero', kind: 'character', frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1, character: { sheets: { walk: 'walk.png', run: 'run.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 10, runFps: 15 }, ...over })

function project() {
  const dir = makeTmpDir('elementals-migrate-')
  roots.push(dir)
  const add = (id, m, sheets) => {
    writeJson(path.join(dir, 'sprites', id, 'sprite.json'), m)
    for (const f of sheets) fs.writeFileSync(path.join(dir, 'sprites', id, f), makePng(128, 192))
  }
  add('characters/hero', meta(), ['walk.png', 'run.png'])
  add('objects/ball', { ...meta(), kind: 'object', frameWidth: 24, frameHeight: 24, character: undefined, sheet: 'ball.png' }, ['ball.png'])
  return dir
}

describe('assets:migrate', () => {
  test('moves records and sheets to the v2 layout without changing ids or file names', () => {
    const dir = project()
    const plan = planMigration(dir)
    assert.deepEqual(plan.errors, [])
    assert.deepEqual(plan.moves.map((m) => m.id), ['characters/hero', 'objects/ball'])
    applyMigration(dir, plan)
    assert.deepEqual(Object.keys(snapshot(dir)).sort(), [
      'database/characters/characters/hero.json',
      'database/characters/objects/ball.json',
      'graphics/sprites/characters/hero/run.png',
      'graphics/sprites/characters/hero/walk.png',
      'graphics/sprites/objects/ball/ball.png',
    ])
    assert.equal(fs.existsSync(path.join(dir, 'sprites')), false, 'emptied directories are pruned')
    const hero = JSON.parse(fs.readFileSync(path.join(dir, 'database/characters/characters/hero.json'), 'utf8'))
    assert.equal(hero.sheets.walk.image, 'sprites/characters/hero/walk.png')
    assert.deepEqual(hero.bindings, { idle: 'idle', walk: 'walk', run: 'run' })
  })

  test('is idempotent: a second run finds nothing', () => {
    const dir = project()
    applyMigration(dir, planMigration(dir))
    const before = snapshot(dir)
    const again = planMigration(dir)
    assert.deepEqual(again.moves, [])
    applyMigration(dir, again)
    assert.deepEqual(snapshot(dir), before)
  })

  test('errors stop everything: nothing is written', () => {
    const dir = project()
    writeJson(path.join(dir, 'sprites/objects/bad/sprite.json'), { version: 1, kind: 'ghost' })
    fs.mkdirSync(path.join(dir, 'database/characters/objects'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'database/characters/objects/ball.json'), '{}')
    const before = snapshot(dir)
    const plan = planMigration(dir)
    assert.match(plan.errors.join('\n'), /sprite "objects\/bad"/)
    assert.match(plan.errors.join('\n'), /objects\/ball.*already exists|ball\.json already exists/)
    assert.throws(() => applyMigration(dir, plan), /refusing/)
    assert.deepEqual(snapshot(dir), before)
  })

  test('a missing sheet is an error; unused files are left in place with a warning', () => {
    const dir = project()
    fs.rmSync(path.join(dir, 'sprites/characters/hero/run.png'))
    fs.writeFileSync(path.join(dir, 'sprites/objects/ball/notes.txt'), 'x')
    const plan = planMigration(dir)
    assert.match(plan.errors.join(), /sheet "run.png" does not exist/)
    assert.match(plan.warnings.join(), /notes\.txt/)
  })

  test('CLI: --dry-run writes nothing, a real run migrates, usage errors', () => {
    const dir = project()
    let out = ''
    const before = snapshot(dir)
    assert.equal(runCli(['--project-dir', dir, '--dry-run'], { stdout: (s) => (out += s) }), 0)
    assert.match(out, /would migrate characters\/hero/)
    assert.deepEqual(snapshot(dir), before)
    assert.equal(runCli(['--project-dir', dir], { stdout: () => {} }), 0)
    assert.equal(fs.existsSync(path.join(dir, 'database/characters/characters/hero.json')), true)
    assert.equal(runCli(['--nope'], { stderr: () => {} }), 2)
    assert.equal(runCli(['--project-dir', path.join(dir, 'missing')], { stderr: () => {} }), 2)
  })
})

describe('the committed project', () => {
  test('every committed character is the migration of its v1 fixture, and its graphics exist', () => {
    const ids = fs.readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('sprite.json')).map((f) => path.dirname(f).split(path.sep).join('/'))
    assert.ok(ids.length >= 10)
    for (const id of ids) {
      const v1 = JSON.parse(fs.readFileSync(path.join(FIXTURES, id, 'sprite.json'), 'utf8'))
      const committed = JSON.parse(fs.readFileSync(path.join(PROJECT, 'database/characters', `${id}.json`), 'utf8'))
      assert.deepEqual(committed, spriteMetaToCharacter(id, v1), id)
      for (const sheet of Object.values(committed.sheets)) assert.ok(fs.existsSync(path.join(PROJECT, 'graphics', sheet.image)), sheet.image)
    }
  })
})
