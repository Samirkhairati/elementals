# Maps

How a map gets from the editor into the game, and how to keep the two in sync.

## Formats and who owns what

| Format | Where | Written by | Read by |
| --- | --- | --- | --- |
| **Editor map** (own JSON: `layers[].data` keyed by tile index, `entities`, ...) | `project/maps/**/*.json` (folders allowed) | the editor (Electron) | the editor, `scripts/export-maps.mjs` |
| **Tiled map** (Tiled 1.10 JSON with a non-standard top-level `entities` array) | `game/public/data/maps/<name>.json` | the editor's **Export** button or `npm run maps:export` | the game (`MapParser`) |
| **Tilesets** (`*.png`, optional sibling `*.json` with a display `name`) | `project/tilesets/**` | the editor | the editor and the script (image size comes from the PNG header) |

The game never reads `project/`; the committed copies in `game/public/data/maps` are what ships.
Editing a map in the editor does **not** update the game by itself.

## One converter

`shared/` is the single implementation, used by both runtimes:

- `shared/mapExport.ts` - `convertEditorMapToTiled(map, tilesets)` and `serializeTiledMap` (2-space JSON, no trailing newline).
  Legacy entities are migrated (`shared/engine/migrate.ts`) and the output always has `schemaVersion: 2`.
- `shared/mapSchema.ts` - `validateEditorMap` (also validates entities/events via `shared/engine`) and `validateTiledMap` (hand-written, no dependencies).
- `shared/png.ts` - `readPngSize`. `shared/mapTypes.ts` - types only.

The editor imports it from `src/hooks/useExportMap.ts` (relative path, no extension); Node imports it with explicit `.ts`
paths (type stripping). Keep the files free of enums, namespaces, parameter properties and DOM/Node imports.
The Export button validates the editor map and the converted map and refuses to write (alert with the first errors) when either is invalid.

## Checking and exporting

```sh
npm run maps:check     # = node scripts/export-maps.mjs --check
npm run maps:export    # = node scripts/export-maps.mjs --write
```

Recommended flow: edit in the editor -> `npm run maps:check` -> `npm run maps:export` (new maps) or
`node scripts/export-maps.mjs --write --only <name> --force` (overwrite a drifted game map after looking at the diff) -> commit.

`--check` converts every map in `project/maps/**` in memory, validates the source and the result, and compares the result
(key order and whitespace ignored) with `game/public/data/maps/<name>.json`.
**Name mapping:** `<name>` is the source *file* name without `.json`, lower-cased, runs of non `a-z0-9` replaced by `-`
(`Old Town.json` -> `old-town`), folders ignored. Two sources mapping to the same name are INVALID.
Note that the editor's Export button names its file after the map's internal `name` field, which can differ from the file name; the script reports that.

| Status | Meaning | Exit code |
| --- | --- | --- |
| `IN SYNC` | game copy equals the conversion | 0 |
| `DRIFTED` | game copy exists but differs (reasons listed) | 0 (1 with `--strict`) |
| `MISSING_IN_GAME` | no game copy yet | 0 (1 with `--strict`) |
| `INVALID` | source or converted map fails validation, unreadable JSON, duplicate name | 1 |

`--write` only ever writes `MISSING_IN_GAME` maps, or exactly the maps named with `--only` (repeatable / comma separated).
It never replaces an existing file without `--force`, never writes an `INVALID` map, and writes atomically (temp file + rename).
`--out-dir <dir>` redirects the writes; `--maps-dir`, `--tilesets-dir`, `--game-dir` override the inputs (used by the tests).
Usage errors exit 2.

## Current state (`npm run maps:check`)

```
STATUS   MAP     SOURCE       GAME FILE
-------  ------  -----------  -----------
DRIFTED  map2    map2.json    map2.json
DRIFTED  market  market.json  market.json
```

- `market`: only drifted because the exporter now writes canonical engine entities (`Event` instead of `Interactable`) and
  `schemaVersion: 2` (see `docs/engine-design.md`, Migration); the committed game copy still has the legacy entity. Re-export it with
  `node scripts/export-maps.mjs --write --only market --force`.
- `map2`: `project/maps/map2.json` has the internal name `city` and corresponds to the game's **`city.json`** (the game's `map2.json` is a different map),
  so the file-name mapping compares it with the wrong game map. Compared with `city.json` it is still DRIFTED: the editor map uses extra `interior`/`outside`
  tilesets, orders its layers differently, and (in the uncommitted working-tree edit) has one entity. Decide whether the editor or the game copy is the truth before exporting.
- `city`, `map1`, `map3`, `map4`, `map5` exist only in the game; there is no editor source for them.

Tests: `npm run test:scripts` (CLI and library), `cd editor && npm test` (shared module, incl. a golden test against the previous export implementation).
