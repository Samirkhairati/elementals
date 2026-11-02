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

## Image layers

An editor layer of type `image` holds freely placed pictures (`images[]`: `assetId` for a sprite or `graphicId` for a picture from the graphics library, never both; pixel `x`/`y` = the sprite anchor, optional `z`, `scale`, `flipX`, `opacity`)
instead of tile cells. In the editor they are drawn in layer `z` order (equal `z` keeps the list order) and placed with or without grid snapping.
The converter writes them as a Tiled `objectgroup` with the layer property `kind = image` (and `z` when set); each image is an object with type `image`,
`x`/`y` and the property `sprite` (asset id) or `graphic` (graphic id) plus `z`, `scale`, `flipX`, `opacity` when set, sorted by draw order.
**The game does not draw these layers yet**: `PhaserTilemapAdapter` still only logs object groups.

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
DRIFTED  market  market.json  market.json
```

- `market` is the only map. It is DRIFTED because the editor copy has been edited since the last export; re-export with
  `node scripts/export-maps.mjs --write --only market --force` when you want the game to pick the changes up.
- The older game-only maps (`city`, `map1`..`map5`) were removed from `game/public/data/maps/`; every game map now has an editor source.

Tests: `npm run test:scripts` (CLI and library), `cd editor && npm test` (shared module, incl. a golden test against the previous export implementation).
