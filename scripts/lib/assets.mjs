// Library behind scripts/sync-assets.mjs: turns the authored project (project/sprites, project/database.json,
// project/tilesets) into what the game loads from game/public:
//
//   graphics/sprites/<id>/<sheet>.png   copies of every sprite sheet a sprite.json refers to
//   graphics/tilesets/<name>.png        project tilesets the game does not have yet (never overwritten, see --force)
//   data/sprites.json                   SpriteManifest (shared/engine/sprites.ts): every sprite's meta + web-relative sheet URLs
//   data/database.json                  the global switches / variables
//   data/common.json                    the common events (project/common/<id>.json), sorted by id
//   data/tilesets.json                  every tileset PNG the game has (name = file stem)
//
// Planning (planSync) is pure: it reads, validates and compares, and never writes. applyPlan writes.
// Output is deterministic (sorted, no timestamps) so `--check` can guard committed output against drift.
// Maps are never touched (see export-maps.mjs).

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { readPngSize } from '../../shared/png.ts'
import {
  buildCommonManifest,
  buildDatabaseManifest,
  findCommonCycles,
  buildSpriteManifest,
  checkSpriteSheets,
  checkSpriteStructure,
  isValidSpriteId,
  normalizeSpriteMeta,
  sheetNamesOf,
  validateDatabaseStrict,
} from './assets-validate.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const STATUS = Object.freeze({
  UNCHANGED: 'unchanged',
  CREATE: 'create', // generated file missing
  UPDATE: 'update', // generated file differs from what the project produces
  STALE: 'stale', // generated file the project no longer produces
  DIFFERS: 'differs', // an existing game tileset that differs from the project copy: kept unless --force
})
const DRIFT = new Set([STATUS.CREATE, STATUS.UPDATE, STATUS.STALE])

export const SPRITES_OUT = 'graphics/sprites'
export const TILESETS_OUT = 'graphics/tilesets'

export function defaultPaths() {
  const gameDir = path.join(REPO_ROOT, 'game')
  return { projectDir: path.join(REPO_ROOT, 'project'), gameDir, publicDir: path.join(gameDir, 'public') }
}

const posix = (p) => p.split(path.sep).join('/')
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const toJson = (value) => JSON.stringify(value, null, 2) + '\n'

/** Recursive sorted listing of files below `dir` (absolute paths); missing dir -> []. Dot entries are skipped. */
export function listFilesDeep(dir, filter = () => true) {
  const out = []
  const walk = (d) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries.sort((a, b) => byName(a.name, b.name))) {
      if (e.name.startsWith('.')) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile() && filter(full)) out.push(full)
    }
  }
  walk(dir)
  return out
}

// ── sprites ────────────────────────────────────────────────────────────────

/**
 * Reads and validates every `sprite.json` below `spritesDir`.
 * Returns { assets: [{ id, dir, meta, sheets: { file: Buffer } }], errors, warnings } sorted by id.
 */
export function loadSprites(spritesDir) {
  const assets = []
  const errors = []
  const warnings = []
  for (const metaPath of listFilesDeep(spritesDir, (f) => path.basename(f) === 'sprite.json')) {
    const dir = path.dirname(metaPath)
    const id = posix(path.relative(spritesDir, dir))
    const fail = (msg) => errors.push(`sprite "${id || '.'}": ${msg}`)
    if (id === '') {
      errors.push('sprites/sprite.json: must live inside an asset directory (sprites/<id>/sprite.json)')
      continue
    }
    if (!isValidSpriteId(id)) {
      fail('invalid id (use "/"-separated names of letters, digits, "_" and "-")')
      continue
    }
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (e) {
      fail(`sprite.json is not valid JSON: ${e.message}`)
      continue
    }
    // Structural check first: only then are the sheet names safe to touch the disk with.
    const structural = checkSpriteStructure(raw)
    structural.warnings.forEach((w) => warnings.push(`sprite "${id}": ${w}`))
    if (structural.errors.length > 0) {
      structural.errors.forEach(fail)
      continue
    }
    const sheets = {}
    const sizes = {}
    for (const file of sheetNamesOf(raw)) {
      try {
        const bytes = fs.readFileSync(path.join(dir, file))
        sizes[file] = readPngSize(bytes)
        sheets[file] = bytes
      } catch (e) {
        if (e.code === 'ENOENT') continue // reported by the validator as "does not exist"
        fail(`sheet "${file}": ${e.message}`)
      }
    }
    const checked = checkSpriteSheets(raw, sizes)
    checked.warnings.forEach((w) => warnings.push(`sprite "${id}": ${w}`))
    if (checked.errors.length > 0) {
      checked.errors.forEach(fail)
      continue
    }
    const used = new Set(['sprite.json', ...Object.keys(sheets)])
    for (const f of fs.readdirSync(dir)) {
      if (!used.has(f) && !f.startsWith('.')) warnings.push(`sprite "${id}": "${f}" is not used by sprite.json (not copied)`)
    }
    assets.push({ id, dir, meta: normalizeSpriteMeta(raw, sizes), sheets })
  }
  assets.sort((a, b) => byName(a.id, b.id))
  return { assets, errors, warnings }
}

// ── tilesets ───────────────────────────────────────────────────────────────

/** Project tilesets: every .png below dir (the game folder is flat, so the file stem is the name). */
export function loadProjectTilesets(tilesetsDir) {
  return listFilesDeep(tilesetsDir, (f) => f.toLowerCase().endsWith('.png')).map((full) => ({
    name: path.basename(full, path.extname(full)),
    source: posix(path.relative(tilesetsDir, full)),
    full,
  }))
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

// ── planning ───────────────────────────────────────────────────────────────

/**
 * Computes every output file and compares it with what is on disk. Pure: nothing is written.
 * Returns { actions: [{ rel, kind, status, content }], errors, warnings }.
 */
export function planSync({ projectDir, publicDir, force = false }) {
  const errors = []
  const warnings = []
  const actions = []
  const expected = new Set()

  const add = (rel, kind, content, { protectExisting = false } = {}) => {
    expected.add(rel)
    const existing = readIfExists(path.join(publicDir, rel))
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    let status
    if (existing === null) status = STATUS.CREATE
    else if (existing.equals(buf)) status = STATUS.UNCHANGED
    else status = protectExisting && !force ? STATUS.DIFFERS : STATUS.UPDATE
    actions.push({ rel, kind, status, content: buf })
  }

  // sprites
  const sprites = loadSprites(path.join(projectDir, 'sprites'))
  errors.push(...sprites.errors)
  warnings.push(...sprites.warnings)
  for (const a of sprites.assets) {
    for (const [file, bytes] of Object.entries(a.sheets)) add(`${SPRITES_OUT}/${a.id}/${file}`, 'sprite-sheet', bytes)
  }

  // database
  let database = { version: 1, switches: [], variables: [] }
  const dbBytes = readIfExists(path.join(projectDir, 'database.json'))
  if (dbBytes !== null) {
    try {
      const parsed = JSON.parse(dbBytes.toString('utf8'))
      const problems = validateDatabaseStrict(parsed)
      if (problems.length > 0) problems.forEach((p) => errors.push(`database.json: ${p}`))
      else database = buildDatabaseManifest(parsed)
    } catch (e) {
      errors.push(`database.json: not valid JSON: ${e.message}`)
    }
  } else {
    warnings.push('database.json not found in the project: generating an empty database')
  }

  // common events: one project/common/<id>.json each, bundled into data/common.json
  const commonRaw = []
  const commonDir = path.join(projectDir, 'common')
  for (const full of listFilesDeep(commonDir, (f) => f.endsWith('.json'))) {
    const rel = posix(path.relative(projectDir, full))
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
      if (typeof parsed?.id !== 'string' || parsed.id === '') errors.push(`${rel}: missing "id"`)
      else if (path.basename(full, '.json') !== parsed.id) errors.push(`${rel}: id "${parsed.id}" does not match the file name`)
      else commonRaw.push(parsed)
    } catch (e) {
      errors.push(`${rel}: not valid JSON: ${e.message}`)
    }
  }
  const common = buildCommonManifest(commonRaw)
  for (const id of findCommonCycles(common.events)) errors.push(`common/${id}.json: common events call each other in a loop`)

  // tilesets: copy the ones the game lacks, then list everything the game has
  const gameTilesetsDir = path.join(publicDir, TILESETS_OUT)
  const gameStems = new Set(
    fs.existsSync(gameTilesetsDir)
      ? fs
          .readdirSync(gameTilesetsDir)
          .filter((f) => f.toLowerCase().endsWith('.png'))
          .map((f) => path.basename(f, path.extname(f)))
      : []
  )
  const sourceOf = new Map()
  for (const t of loadProjectTilesets(path.join(projectDir, 'tilesets'))) {
    if (sourceOf.has(t.name)) {
      errors.push(`tilesets: "${t.source}" and "${sourceOf.get(t.name)}" share the game name "${t.name}"`)
      continue
    }
    sourceOf.set(t.name, t.source)
    gameStems.add(t.name)
    add(`${TILESETS_OUT}/${t.name}.png`, 'tileset', fs.readFileSync(t.full), { protectExisting: true })
  }

  // manifests
  add('data/sprites.json', 'manifest', toJson(buildSpriteManifest(sprites.assets)))
  add('data/database.json', 'manifest', toJson(database))
  add('data/common.json', 'manifest', toJson(common))
  add(
    'data/tilesets.json',
    'manifest',
    toJson({
      version: 1,
      tilesets: [...gameStems].sort(byName).map((name) => ({ name, file: `${TILESETS_OUT}/${name}.png` })),
    })
  )

  // generated sprite files nobody produces any more
  for (const full of listFilesDeep(path.join(publicDir, SPRITES_OUT))) {
    const rel = posix(path.relative(publicDir, full))
    if (!expected.has(rel)) actions.push({ rel, kind: 'sprite-sheet', status: STATUS.STALE, content: null })
  }

  return { actions, errors, warnings }
}

// ── applying ───────────────────────────────────────────────────────────────

/** Writes `content` to `target` through a temp file in the same directory + rename. */
export function atomicWriteFile(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, content, { flag: 'wx' })
    fs.renameSync(tmp, target)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}

function pruneEmptyDirs(root, start) {
  for (let d = start; d !== root && d.startsWith(root + path.sep); d = path.dirname(d)) {
    try {
      if (fs.readdirSync(d).length > 0) return
      fs.rmdirSync(d)
    } catch {
      return
    }
  }
}

/**
 * Performs the create / update / stale actions (never `differs` or `unchanged`). Refuses to write
 * anything when the plan has errors. Manifests are written after the files they reference.
 * Returns the actions that were applied.
 */
export function applyPlan(plan, { publicDir }) {
  if (plan.errors.length > 0) throw new Error('refusing to write: the project has errors')
  const applied = []
  const order = (a) => (a.kind === 'manifest' ? 1 : 0)
  for (const action of [...plan.actions].sort((a, b) => order(a) - order(b))) {
    const target = path.join(publicDir, action.rel)
    if (action.status === STATUS.CREATE || action.status === STATUS.UPDATE) {
      atomicWriteFile(target, action.content)
      applied.push(action)
    } else if (action.status === STATUS.STALE) {
      fs.rmSync(target, { force: true })
      pruneEmptyDirs(path.join(publicDir, SPRITES_OUT), path.dirname(target))
      applied.push(action)
    }
  }
  return applied
}

/** Plan + (optionally) write. Used by the CLI and scripts/dev.mjs. */
export function syncAssets({ projectDir, publicDir, write = false, force = false }) {
  const plan = planSync({ projectDir, publicDir, force })
  const drift = plan.actions.filter((a) => DRIFT.has(a.status))
  const differs = plan.actions.filter((a) => a.status === STATUS.DIFFERS)
  const applied = write && plan.errors.length === 0 ? applyPlan(plan, { publicDir }) : []
  return { plan, drift, differs, applied, ok: plan.errors.length === 0 && (write || drift.length === 0) }
}

// ── CLI ────────────────────────────────────────────────────────────────────

export const HELP = `Usage: node scripts/sync-assets.mjs [--check | --write] [options]

Generates what the game loads from the authored project data:
  game/public/graphics/sprites/<id>/*.png   sprite sheets (copies of project/sprites/<id>/*.png)
  game/public/graphics/tilesets/*.png       project tilesets the game lacks (existing files are kept)
  game/public/data/sprites.json             sprite manifest (ids, metas, sheet URLs)
  game/public/data/database.json            global switches and variables
  game/public/data/common.json              common events (project/common/<id>.json)
  game/public/data/tilesets.json            every tileset PNG the game has

  --check            (default) report drift; exit 1 when generated output is missing or stale
  --write            write missing / changed output and remove stale generated sprite files
  --force            with --write: also overwrite existing game tilesets that differ from the project
  --strict           with --check: exit 1 for game tilesets that differ from the project, too
  --project-dir <d>  authored project (default project/)
  --game-dir <d>     game package (default game/; output goes to <game-dir>/public)
  --out-dir <d>      write/compare in <d> instead of <game-dir>/public (tests, previews)
  --verbose          list unchanged files and warnings
  -h, --help         this text

Exit codes: 0 ok, 1 errors / drift / (--strict) differing tilesets, 2 usage error.`

export function formatReport(result, { verbose = false, write = false } = {}) {
  const { plan } = result
  const lines = []
  for (const e of plan.errors) lines.push(`error: ${e}`)
  const wrote = new Set(result.applied)
  for (const a of plan.actions) {
    if (!verbose && a.status === STATUS.UNCHANGED) continue
    const label = write && wrote.has(a) ? (a.status === STATUS.STALE ? 'removed' : 'wrote') : a.status
    lines.push(`${label.padEnd(9)} ${a.rel}${a.status === STATUS.DIFFERS ? '  (differs from project; kept, use --force)' : ''}`)
  }
  if (verbose) for (const w of plan.warnings) lines.push(`warning: ${w}`)
  const count = (s) => plan.actions.filter((a) => a.status === s).length
  lines.push(
    `${plan.actions.length - count(STATUS.STALE)} file(s): ${count(STATUS.UNCHANGED)} up to date, ` +
      `${count(STATUS.CREATE)} missing, ${count(STATUS.UPDATE)} outdated, ${count(STATUS.STALE)} stale, ` +
      `${count(STATUS.DIFFERS)} differing tileset(s) kept`
  )
  return lines.join('\n')
}

/** Runs the CLI. Returns the process exit code; output goes through `io` (defaults to the console). */
export function runCli(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(s))
  const err = io.stderr || ((s) => process.stderr.write(s))
  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        check: { type: 'boolean' },
        write: { type: 'boolean' },
        force: { type: 'boolean' },
        strict: { type: 'boolean' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        'project-dir': { type: 'string' },
        'game-dir': { type: 'string' },
        'out-dir': { type: 'string' },
      },
      allowPositionals: false,
    }))
  } catch (e) {
    err(`${e.message}\n\n${HELP}\n`)
    return 2
  }
  if (values.help) {
    out(HELP + '\n')
    return 0
  }
  if (values.check && values.write) {
    err('--check and --write are mutually exclusive\n')
    return 2
  }
  if (values.force && !values.write) {
    err('--force only makes sense with --write\n')
    return 2
  }
  if (values.strict && values.write) {
    err('--strict only makes sense with --check\n')
    return 2
  }

  const defaults = defaultPaths()
  const projectDir = path.resolve(values['project-dir'] || defaults.projectDir)
  const gameDir = path.resolve(values['game-dir'] || defaults.gameDir)
  const publicDir = path.resolve(values['out-dir'] || path.join(gameDir, 'public'))
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    err(`project directory not found: ${projectDir}\n`)
    return 2
  }

  const write = Boolean(values.write)
  let result
  try {
    result = syncAssets({ projectDir, publicDir, write, force: Boolean(values.force) })
  } catch (e) {
    err(`sync failed: ${e.message}\n`)
    return 1
  }
  out(formatReport(result, { verbose: values.verbose, write }) + '\n')

  if (result.plan.errors.length > 0) {
    err(`${result.plan.errors.length} error(s) in the project; nothing was written.\n`)
    return 1
  }
  if (!write && result.drift.length > 0) {
    err('Generated game assets are out of date. Run: npm run assets:sync\n')
    return 1
  }
  if (!write && values.strict && result.differs.length > 0) {
    err('--strict: some game tilesets differ from the project (use assets:sync -- --force to overwrite them)\n')
    return 1
  }
  return 0
}
