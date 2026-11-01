// Library behind scripts/sync-assets.mjs: turns the authored project (project/database/characters,
// project/graphics, project/database.json, project/tilesets, project/common) into what the game loads
// from game/public:
//
//   graphics/<graphicId>                copies of every graphic some character refers to (project/graphics/<graphicId>)
//   graphics/tilesets/<name>.png        project tilesets the game does not have yet (never overwritten, see --force)
//   data/characters.json                CharacterManifest (shared/engine/graphics.ts): every character + web-relative sheet URLs
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
  buildCharacterManifest,
  buildCommonManifest,
  buildDatabaseManifest,
  characterGraphics,
  findCommonCycles,
  isValidCharacterId,
  isValidGraphicId,
  validateCharacterSet,
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

export const GRAPHICS_OUT = 'graphics'
export const CHARACTERS_SRC = 'database/characters'
export const GRAPHICS_SRC = 'graphics'
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

// ── characters + graphics ──────────────────────────────────────────────────

/**
 * Reads and validates every character below `<projectDir>/database/characters` and the graphics they use.
 * Returns { characters: [{ id, def }], graphics: { id: Buffer }, errors, warnings } sorted by id.
 */
export function loadCharacters(projectDir) {
  const charsDir = path.join(projectDir, CHARACTERS_SRC)
  const graphicsDir = path.join(projectDir, GRAPHICS_SRC)
  const characters = []
  const errors = []
  const warnings = []
  for (const file of listFilesDeep(charsDir, (f) => f.endsWith('.json'))) {
    const id = posix(path.relative(charsDir, file)).replace(/\.json$/, '')
    let def
    try {
      def = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      errors.push(`character "${id}": not valid JSON: ${e.message}`)
      continue
    }
    if (!isValidCharacterId(id)) {
      errors.push(`character "${id}": invalid id (use "/"-separated names of letters, digits, "_" and "-")`)
      continue
    }
    if (def?.version === 1 || def?.kind !== undefined) {
      errors.push(`character "${id}": this is a v1 sprite.json; run \`npm run assets:migrate\``)
      continue
    }
    characters.push({ id, def })
  }
  characters.sort((a, b) => byName(a.id, b.id))

  // graphics: only the ones characters name (and only valid ids ever touch the disk)
  const graphics = {}
  const sizes = {}
  for (const { def } of characters) {
    const sheets = def && typeof def === 'object' && def.sheets && typeof def.sheets === 'object' ? def.sheets : {}
    for (const sheet of Object.values(sheets)) {
      const image = sheet && typeof sheet === 'object' ? sheet.image : undefined
      if (typeof image !== 'string' || graphics[image] !== undefined || !isValidGraphicId(image)) continue
      try {
        const bytes = fs.readFileSync(path.join(graphicsDir, image))
        sizes[image] = readPngSize(bytes)
        graphics[image] = bytes
      } catch (e) {
        if (e.code !== 'ENOENT') errors.push(`graphic "${image}": ${e.message}`)
      }
    }
  }
  for (const issue of validateCharacterSet(characters, sizes)) {
    if (issue.severity === 'error') errors.push(`character "${issue.id}": ${issue.message}`)
    else if (issue.severity === 'warning') warnings.push(`character "${issue.id}": ${issue.message}`)
  }
  return { characters, graphics, errors, warnings }
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

  // characters and the graphics they use
  const chars = loadCharacters(projectDir)
  errors.push(...chars.errors)
  warnings.push(...chars.warnings)
  if (fs.existsSync(path.join(projectDir, 'sprites')) && listFilesDeep(path.join(projectDir, 'sprites'), (f) => f.endsWith('sprite.json')).length > 0) {
    errors.push('project/sprites still holds v1 sprite assets; run `npm run assets:migrate`')
  }
  for (const [id, bytes] of Object.entries(chars.graphics)) add(`${GRAPHICS_OUT}/${id}`, 'graphic', bytes)

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
  add('data/characters.json', 'manifest', toJson(buildCharacterManifest(chars.characters)))
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

  // generated graphics nobody produces any more: only below the library's top-level folders (and `sprites`),
  // so the game's own graphics/tilesets, graphics/meta, ... are never touched
  const roots = new Set(['sprites'])
  const graphicsSrc = path.join(projectDir, GRAPHICS_SRC)
  if (fs.existsSync(graphicsSrc)) for (const e of fs.readdirSync(graphicsSrc, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.')) roots.add(e.name)
  roots.delete('tilesets')
  for (const root of roots) {
    for (const full of listFilesDeep(path.join(publicDir, GRAPHICS_OUT, root))) {
      const rel = posix(path.relative(publicDir, full))
      if (!expected.has(rel)) actions.push({ rel, kind: 'graphic', status: STATUS.STALE, content: null })
    }
  }
  // the v1 manifest is retired
  if (fs.existsSync(path.join(publicDir, 'data/sprites.json'))) actions.push({ rel: 'data/sprites.json', kind: 'manifest', status: STATUS.STALE, content: null })

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
      pruneEmptyDirs(path.join(publicDir, GRAPHICS_OUT), path.dirname(target))
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
  game/public/graphics/<graphicId>          the graphics characters use (copies of project/graphics/<graphicId>)
  game/public/graphics/tilesets/*.png       project tilesets the game lacks (existing files are kept)
  game/public/data/characters.json          character manifest (ids, definitions, sheet URLs)
  game/public/data/database.json            global switches and variables
  game/public/data/common.json              common events (project/common/<id>.json)
  game/public/data/tilesets.json            every tileset PNG the game has

  --check            (default) report drift; exit 1 when generated output is missing or stale
  --write            write missing / changed output and remove stale generated graphics
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
