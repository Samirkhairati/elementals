// Library behind scripts/export-maps.mjs: converts the editor's maps (project/maps) to the Tiled
// JSON the game loads (game/public/data/maps), validates both sides and reports drift.
// The conversion itself lives in shared/ (the same code the editor's Export button runs).

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { convertEditorMapToTiled, serializeTiledMap } from '../../shared/mapExport.ts'
import { validateEditorMap, validateTiledMap } from '../../shared/mapSchema.ts'
import { readPngSize } from '../../shared/png.ts'

export const STATUS = Object.freeze({
  IN_SYNC: 'IN_SYNC',
  DRIFTED: 'DRIFTED',
  MISSING_IN_GAME: 'MISSING_IN_GAME',
  INVALID: 'INVALID',
})

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function defaultPaths() {
  return {
    mapsDir: path.join(REPO_ROOT, 'project', 'maps'),
    tilesetsDir: path.join(REPO_ROOT, 'project', 'tilesets'),
    gameDir: path.join(REPO_ROOT, 'game', 'public', 'data', 'maps'),
  }
}

/** `City Map (2).json` -> `city-map-2`. This is the game file name (without `.json`) for a source map. */
export function slugify(fileName) {
  return path
    .basename(fileName)
    .replace(/\.json$/i, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Recursive, sorted (deterministic) list of files with the given extension. Paths are absolute. */
export function listFiles(dir, ext) {
  const out = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) out.push(full)
    }
  }
  walk(dir)
  return out
}

/**
 * Tilesets as the editor sees them (see electron/ipc/tilesetHandlers.ts): every .png below `dir`,
 * `fileName` = base name, display `name` = sibling .json `name` or the file name without extension.
 * Size comes from the PNG header; an unreadable PNG gets width/height 0.
 */
export function loadTilesets(dir) {
  return listFiles(dir, '.png').map((png) => {
    const fileName = path.basename(png)
    let name = path.parse(fileName).name
    const metaPath = png.replace(/\.png$/i, '.json')
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        if (meta && meta.name) name = meta.name
      } catch {
        /* keep default name */
      }
    }
    let width = 0
    let height = 0
    try {
      ;({ width, height } = readPngSize(fs.readFileSync(png)))
    } catch {
      /* leave 0x0: validation reports it */
    }
    return { name, fileName, width, height }
  })
}

// ── comparison ─────────────────────────────────────────────────────────────

/** Deep copy with object keys sorted, so two JSON values compare equal regardless of key order. */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k])
    return out
  }
  return value
}

const same = (a, b) => JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b))

/** Short human-readable reasons why `converted` (from the editor map) differs from `existing` (game copy). */
export function describeDrift(converted, existing) {
  const notes = []
  if (!existing || typeof existing !== 'object') return ['game file is not a JSON object']

  for (const key of ['width', 'height', 'tilewidth', 'tileheight']) {
    if (!same(converted[key], existing[key])) notes.push(`${key}: ${JSON.stringify(converted[key])} vs ${JSON.stringify(existing[key])} in game`)
  }

  const tsNames = (m) => (Array.isArray(m.tilesets) ? m.tilesets.map((t) => t.name).join(',') : '?')
  if (!same(converted.tilesets, existing.tilesets)) {
    notes.push(tsNames(converted) === tsNames(existing) ? 'tileset fields differ' : `tilesets [${tsNames(converted)}] vs [${tsNames(existing)}] in game`)
  }

  const cl = converted.layers || []
  const el = Array.isArray(existing.layers) ? existing.layers : []
  const layerNames = (ls) => ls.map((l) => l && l.name).join(',')
  if (cl.length !== el.length || layerNames(cl) !== layerNames(el)) {
    notes.push(`layers [${layerNames(cl)}] vs [${layerNames(el)}] in game`)
  } else {
    cl.forEach((layer, i) => {
      if (same(layer, el[i])) return
      const a = layer.data || []
      const b = (el[i] && el[i].data) || []
      let cells = 0
      for (let n = 0; n < Math.max(a.length, b.length); n++) if (a[n] !== b[n]) cells++
      notes.push(cells > 0 ? `layer "${layer.name}": ${cells} cells differ` : `layer "${layer.name}": properties differ`)
    })
  }

  const ce = converted.entities || []
  const ee = existing.entities || []
  if (!same(ce, ee)) notes.push(ce.length !== ee.length ? `entities: ${ce.length} vs ${ee.length} in game` : 'entities differ')

  const handled = new Set(['width', 'height', 'tilewidth', 'tileheight', 'tilesets', 'layers', 'entities'])
  if (cl.length !== el.length) handled.add('nextlayerid')
  for (const key of [...new Set([...Object.keys(converted), ...Object.keys(existing)])].sort()) {
    if (!handled.has(key) && !same(converted[key], existing[key])) notes.push(`${key} differs`)
  }
  return notes.length > 0 ? notes : ['formatting only']
}

// ── check ──────────────────────────────────────────────────────────────────

/**
 * Converts and validates every map under mapsDir and compares it with `<gameDir>/<slug>.json`.
 * Returns { results, gameOnly } (both sorted); never writes anything.
 */
export function checkMaps({ mapsDir, tilesetsDir, gameDir }) {
  const tilesets = loadTilesets(tilesetsDir)
  const sources = listFiles(mapsDir, '.json')
  const results = []
  const bySlug = new Map()

  for (const file of sources) {
    const source = path.relative(mapsDir, file).split(path.sep).join('/')
    const slug = slugify(file)
    const result = { source, name: slug, status: STATUS.INVALID, errors: [], warnings: [], notes: [], drift: [], tiled: null }
    results.push(result)
    bySlug.set(slug, [...(bySlug.get(slug) || []), result])

    let editorMap
    try {
      editorMap = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      result.errors.push(`cannot read JSON: ${e.message}`)
      continue
    }
    if (!slug) {
      result.errors.push('file name produces an empty game map name')
      continue
    }
    const editorCheck = validateEditorMap(editorMap, { tilesets })
    result.errors.push(...editorCheck.errors)
    result.warnings.push(...editorCheck.warnings)
    if (!editorCheck.ok) continue

    const tiled = convertEditorMapToTiled(editorMap, tilesets)
    const tiledCheck = validateTiledMap(tiled)
    result.warnings.push(...tiledCheck.warnings)
    if (!tiledCheck.ok) {
      result.errors.push(...tiledCheck.errors.map((e) => `converted map: ${e}`))
      continue
    }
    result.tiled = tiled
    result.mapName = typeof editorMap.name === 'string' ? editorMap.name : ''
  }

  for (const group of bySlug.values()) {
    if (group.length < 2) continue
    for (const r of group) {
      r.tiled = null
      r.errors.push(`game name "${r.name}" is produced by several maps: ${group.map((g) => g.source).join(', ')}`)
    }
  }

  for (const r of results) {
    if (r.errors.length > 0) {
      r.status = STATUS.INVALID
      continue
    }
    const gameFile = path.join(gameDir, `${r.name}.json`)
    // The editor's Export button names its file after the map's internal `name`, not the file name.
    const nameSlug = slugify(r.mapName || '')
    if (nameSlug && nameSlug !== r.name) {
      r.notes.push(`internal map name is "${r.mapName}": the editor's Export button would produce ${nameSlug}.json${fs.existsSync(path.join(gameDir, `${nameSlug}.json`)) ? ' (which exists in the game)' : ''}`)
    }
    if (!fs.existsSync(gameFile)) {
      r.status = STATUS.MISSING_IN_GAME
      continue
    }
    let existing
    try {
      existing = JSON.parse(fs.readFileSync(gameFile, 'utf8'))
    } catch (e) {
      r.status = STATUS.DRIFTED
      r.notes.push(`game file is not valid JSON: ${e.message}`)
      continue
    }
    const gameCheck = validateTiledMap(existing)
    if (!gameCheck.ok) r.notes.push(`game copy fails validation (${gameCheck.errors.length} errors, first: ${gameCheck.errors[0]})`)
    if (same(r.tiled, existing)) {
      r.status = STATUS.IN_SYNC
    } else {
      r.status = STATUS.DRIFTED
      r.drift.push(...describeDrift(r.tiled, existing))
    }
  }

  results.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.source < b.source ? -1 : 1))

  const known = new Set(results.map((r) => r.name))
  const gameOnly = fs.existsSync(gameDir)
    ? fs
        .readdirSync(gameDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -'.json'.length))
        .filter((n) => !known.has(n))
        .sort()
    : []
  return { results, gameOnly }
}

// ── write ──────────────────────────────────────────────────────────────────

/** Writes `content` to `target` through a temp file in the same directory + rename. */
export function atomicWriteFile(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(tmp, target)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}

/**
 * Decides and performs the writes for `--write`.
 *  - default selection: maps MISSING_IN_GAME; with `only`: exactly the named maps.
 *  - INVALID maps are never written; an existing target is never replaced unless `force`.
 * Returns one entry per selected map: { name, target, action: 'written'|'unchanged'|'refused'|'skipped', reason? }.
 */
export function writeMaps(results, { gameDir, outDir, only, force = false }) {
  const targetDir = outDir || gameDir
  const selected = only && only.length > 0 ? results.filter((r) => only.includes(r.name)) : results.filter((r) => r.status === STATUS.MISSING_IN_GAME)
  const actions = []

  for (const r of selected) {
    const target = path.join(targetDir, `${r.name}.json`)
    if (r.status === STATUS.INVALID || !r.tiled) {
      actions.push({ name: r.name, target, action: 'refused', reason: 'map is INVALID' })
      continue
    }
    const content = serializeTiledMap(r.tiled)
    if (fs.existsSync(target)) {
      if (fs.readFileSync(target, 'utf8') === content) {
        actions.push({ name: r.name, target, action: 'unchanged' })
        continue
      }
      if (!force) {
        actions.push({ name: r.name, target, action: 'refused', reason: 'file exists, pass --force to overwrite' })
        continue
      }
    }
    atomicWriteFile(target, content)
    actions.push({ name: r.name, target, action: 'written' })
  }
  return actions
}

// ── output ─────────────────────────────────────────────────────────────────

export function formatTable(results, { verbose = false } = {}) {
  const label = (s) => (s === STATUS.IN_SYNC ? 'IN SYNC' : s)
  const rows = [['STATUS', 'MAP', 'SOURCE', 'GAME FILE']]
  for (const r of results) {
    rows.push([label(r.status), r.name, r.source, r.status === STATUS.MISSING_IN_GAME ? '(none)' : `${r.name}.json`])
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => row[c].length)))
  const lines = rows.map((row) => row.map((cell, c) => cell.padEnd(widths[c])).join('  ').trimEnd())
  lines.splice(1, 0, widths.map((w) => '-'.repeat(w)).join('  '))

  const details = []
  for (const r of results) {
    const items = [
      ...r.errors.map((e) => `error: ${e}`),
      ...r.drift.map((n) => `differs: ${n}`),
      ...r.notes.map((n) => `note: ${n}`),
      ...(verbose || r.status === STATUS.INVALID ? r.warnings.map((w) => `warning: ${w}`) : []),
    ]
    if (items.length === 0) continue
    const shown = verbose ? items : items.slice(0, 6)
    details.push(`${r.name} (${r.source}):`, ...shown.map((i) => `  - ${i}`))
    if (shown.length < items.length) details.push(`  - ... ${items.length - shown.length} more (use --verbose)`)
  }
  return [...lines, ...(details.length > 0 ? ['', ...details] : [])].join('\n')
}

const HELP = `Usage: node scripts/export-maps.mjs [--check | --write] [options]

Converts the editor maps in project/maps/** to Tiled JSON, validates them and compares them with
game/public/data/maps/<slug>.json (slug = file name, lower-cased, non-alphanumerics -> "-").

  --check            (default) report IN SYNC / DRIFTED / MISSING_IN_GAME / INVALID per map
  --write            write converted maps that are MISSING_IN_GAME (or exactly those given with --only)
  --only <name>      restrict --write to this game map name (repeatable, or comma separated)
  --force            allow --write to replace an existing file
  --strict           exit 1 on DRIFTED / MISSING_IN_GAME maps too
  --out-dir <dir>    write into <dir> instead of the game maps directory
  --maps-dir <dir>   editor maps (default project/maps)
  --tilesets-dir <dir>  tileset PNGs (default project/tilesets)
  --game-dir <dir>   committed game maps (default game/public/data/maps)
  --verbose          show every difference and warning

Exit codes: 0 ok, 1 an INVALID map / refused write / --strict failure, 2 usage error.`

/** Runs the CLI. Returns the process exit code; output goes through `io` (defaults to the console). */
export function runCli(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(s))
  const err = io.stderr || ((s) => process.stderr.write(s))
  const println = (s = '') => out(s + '\n')

  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        check: { type: 'boolean' },
        write: { type: 'boolean' },
        only: { type: 'string', multiple: true },
        force: { type: 'boolean' },
        strict: { type: 'boolean' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        'out-dir': { type: 'string' },
        'maps-dir': { type: 'string' },
        'tilesets-dir': { type: 'string' },
        'game-dir': { type: 'string' },
      },
      allowPositionals: false,
    }))
  } catch (e) {
    err(`${e.message}\n\n${HELP}\n`)
    return 2
  }
  if (values.help) {
    println(HELP)
    return 0
  }
  if (values.check && values.write) {
    err('--check and --write are mutually exclusive\n')
    return 2
  }
  if (!values.write && (values.only || values.force || values['out-dir'])) {
    err('--only, --force and --out-dir only make sense with --write\n')
    return 2
  }

  const defaults = defaultPaths()
  const mapsDir = path.resolve(values['maps-dir'] || defaults.mapsDir)
  const tilesetsDir = path.resolve(values['tilesets-dir'] || defaults.tilesetsDir)
  const gameDir = path.resolve(values['game-dir'] || defaults.gameDir)
  const outDir = values['out-dir'] ? path.resolve(values['out-dir']) : undefined
  for (const [label, dir] of [['maps', mapsDir], ['tilesets', tilesetsDir]]) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      err(`${label} directory not found: ${dir}\n`)
      return 2
    }
  }

  const { results, gameOnly } = checkMaps({ mapsDir, tilesetsDir, gameDir })
  const only = values.only ? values.only.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean) : undefined
  if (only) {
    const unknown = only.filter((n) => !results.some((r) => r.name === n))
    if (unknown.length > 0) {
      err(`unknown map name(s) for --only: ${unknown.join(', ')} (known: ${results.map((r) => r.name).join(', ') || 'none'})\n`)
      return 2
    }
  }

  if (results.length === 0) println(`No maps found in ${mapsDir}`)
  else println(formatTable(results, { verbose: values.verbose }))
  if (gameOnly.length > 0) println(`\nGame maps without a source map in the project (not checked): ${gameOnly.join(', ')}`)

  let code = 0
  const written = new Set()
  if (values.write) {
    println()
    let actions
    try {
      actions = writeMaps(results, { gameDir, outDir, only, force: values.force })
    } catch (e) {
      err(`write failed: ${e.message}\n`)
      return 1
    }
    if (actions.length === 0) println('Nothing to write.')
    for (const a of actions) {
      const rel = path.relative(process.cwd(), a.target) || a.target
      if (a.action === 'written') {
        written.add(a.name)
        println(`wrote ${rel}`)
      } else if (a.action === 'unchanged') println(`unchanged ${rel}`)
      else {
        code = 1
        err(`refused ${rel}: ${a.reason}\n`)
      }
    }
    const skipped = results.filter((r) => r.status === STATUS.DRIFTED && !written.has(r.name) && !(only && only.includes(r.name)))
    if (skipped.length > 0) {
      println(`Left untouched (drifted; use --only <name> --force to overwrite): ${skipped.map((r) => r.name).join(', ')}`)
    }
  }

  const invalid = results.filter((r) => r.status === STATUS.INVALID)
  const drifted = results.filter((r) => r.status === STATUS.DRIFTED && !written.has(r.name))
  const missing = results.filter((r) => r.status === STATUS.MISSING_IN_GAME && !written.has(r.name))
  println()
  println(`${results.length} map(s): ${results.filter((r) => r.status === STATUS.IN_SYNC).length} in sync, ${drifted.length} drifted, ${missing.length} missing in game, ${invalid.length} invalid`)
  if (invalid.length > 0) code = 1
  if (values.strict && (drifted.length > 0 || missing.length > 0)) {
    err('--strict: drifted or missing maps found\n')
    code = 1
  }
  return code
}
