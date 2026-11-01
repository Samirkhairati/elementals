// `npm run assets:migrate`: moves the v1 sprite assets (project/sprites/<id>/sprite.json + sheets) into the v2
// layout (docs/database-and-characters-spec.md §4 and §6):
//   project/sprites/<id>/<sheet>.png  ->  project/graphics/sprites/<id>/<sheet>.png
//   project/sprites/<id>/sprite.json  ->  project/database/characters/<id>.json   (a Character v2)
// Character ids stay as they are, so no map, prefab or event changes. Idempotent: already-migrated assets are
// gone from project/sprites, so a second run does nothing. Maps are never touched.

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { spriteMetaToCharacter } from '../../shared/engine/characterMigrate.ts'
import { validateCharacter } from '../../shared/engine/characters.ts'
import { validateSpriteMeta, spriteSheetRoles } from '../../shared/engine/sprites.ts'
import { isValidCharacterId } from '../../shared/engine/graphics.ts'
import { listFilesDeep } from './assets.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const posix = (p) => p.split(path.sep).join('/')

export const CHARACTERS_DIR = path.join('database', 'characters')
export const GRAPHICS_DIR = 'graphics'

/**
 * Plans the migration of `<projectDir>/sprites`. Pure: nothing is written.
 * Returns { moves: [{ id, record, def, sheets: [{ from, to }], removes }], errors, warnings }.
 */
export function planMigration(projectDir) {
  const spritesDir = path.join(projectDir, 'sprites')
  const moves = []
  const errors = []
  const warnings = []
  for (const metaPath of listFilesDeep(spritesDir, (f) => path.basename(f) === 'sprite.json')) {
    const dir = path.dirname(metaPath)
    const id = posix(path.relative(spritesDir, dir))
    const fail = (m) => errors.push(`sprite "${id || '.'}": ${m}`)
    if (id === '' || !isValidCharacterId(id)) {
      fail('invalid id (a sprite.json must live in sprites/<id>/ with an id of letters, digits, "_" and "-")')
      continue
    }
    let meta
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (e) {
      fail(`sprite.json is not valid JSON: ${e.message}`)
      continue
    }
    const check = validateSpriteMeta(meta)
    if (!check.ok) {
      check.errors.forEach(fail)
      continue
    }
    const def = spriteMetaToCharacter(id, meta)
    const verdict = validateCharacter(def)
    if (!verdict.ok) {
      verdict.errors.forEach(fail)
      continue
    }
    const sheets = spriteSheetRoles(meta).map(({ file }) => ({
      from: path.join(dir, file),
      to: path.join(projectDir, GRAPHICS_DIR, 'sprites', id, file),
    }))
    for (const s of sheets) if (!fs.existsSync(s.from)) fail(`sheet "${path.basename(s.from)}" does not exist`)
    for (const f of fs.readdirSync(dir)) {
      if (f !== 'sprite.json' && !sheets.some((s) => path.basename(s.from) === f) && !f.startsWith('.')) warnings.push(`sprite "${id}": "${f}" is not used by sprite.json (left in place)`)
    }
    const record = path.join(projectDir, CHARACTERS_DIR, `${id}.json`)
    if (fs.existsSync(record)) fail(`${posix(path.relative(projectDir, record))} already exists`)
    for (const s of sheets) if (fs.existsSync(s.to)) fail(`${posix(path.relative(projectDir, s.to))} already exists`)
    moves.push({ id, record, def, sheets, metaPath, dir })
  }
  return { moves, errors, warnings }
}

function pruneEmpty(root, start) {
  for (let d = start; d !== root && d.startsWith(root + path.sep); d = path.dirname(d)) {
    try {
      if (fs.readdirSync(d).length > 0) return
      fs.rmdirSync(d)
    } catch {
      return
    }
  }
}

/** Writes the plan: graphics are copied first, then the record, then the originals are removed. */
export function applyMigration(projectDir, plan) {
  if (plan.errors.length > 0) throw new Error('refusing to migrate: the project has errors')
  for (const m of plan.moves) {
    for (const s of m.sheets) {
      fs.mkdirSync(path.dirname(s.to), { recursive: true })
      fs.copyFileSync(s.from, s.to, fs.constants.COPYFILE_EXCL)
    }
    fs.mkdirSync(path.dirname(m.record), { recursive: true })
    fs.writeFileSync(m.record, JSON.stringify(m.def, null, 2) + '\n', { flag: 'wx' })
    for (const s of m.sheets) fs.rmSync(s.from)
    fs.rmSync(m.metaPath)
    pruneEmpty(path.join(projectDir, 'sprites'), m.dir)
  }
  try {
    fs.rmdirSync(path.join(projectDir, 'sprites')) // the root goes too once nothing is left
  } catch {
    /* not empty (or already gone) */
  }
}

export const HELP = `Usage: node scripts/migrate-characters.mjs [--dry-run] [--project-dir <d>]

Moves project/sprites/<id>/{sprite.json,*.png} to project/database/characters/<id>.json (Character v2)
and project/graphics/sprites/<id>/*.png. Ids and sheet file names are kept. Run \`npm run assets:sync\` afterwards.`

export function runCli(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(s))
  const err = io.stderr || ((s) => process.stderr.write(s))
  let values
  try {
    ;({ values } = parseArgs({ args: argv, options: { 'dry-run': { type: 'boolean' }, 'project-dir': { type: 'string' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: false }))
  } catch (e) {
    err(`${e.message}\n\n${HELP}\n`)
    return 2
  }
  if (values.help) {
    out(HELP + '\n')
    return 0
  }
  const projectDir = path.resolve(values['project-dir'] || path.join(REPO_ROOT, 'project'))
  if (!fs.existsSync(projectDir)) {
    err(`project directory not found: ${projectDir}\n`)
    return 2
  }
  const plan = planMigration(projectDir)
  for (const w of plan.warnings) out(`warning: ${w}\n`)
  if (plan.errors.length > 0) {
    plan.errors.forEach((e) => err(`error: ${e}\n`))
    return 1
  }
  for (const m of plan.moves) out(`${values['dry-run'] ? 'would migrate' : 'migrate'} ${m.id}\n`)
  if (!values['dry-run']) applyMigration(projectDir, plan)
  out(`${plan.moves.length} sprite(s) ${values['dry-run'] ? 'to migrate' : 'migrated'}${plan.moves.length === 0 ? ' (nothing to do)' : ''}\n`)
  return 0
}
