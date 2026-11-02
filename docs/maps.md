# Maps

How a map gets from the editor into the game, and how to keep the two in sync.

## Formats and who owns what

| Format | Where | Written by | Read by |
| --- | --- | --- | --- |
| **Editor map** (own JSON: `layers[].data` keyed by tile index, `entities`, ...) | `project/maps/**/*.json` (folders allowed) | the editor (Electron) | the editor, `scripts/export-maps.mjs` |
| **Tiled map** (Tiled 1.10 JSON with a non-standard top-level `entities` array) | `game/public/data/maps/<name>.json` | right-click a map > **Export to Game** (writes it straight there), or `npm run maps:export` | the game (`MapParser`) |
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
**Export to Game** (Maps panel context menu) validates the editor map and the converted map, then writes `game/public/data/maps/<id>.json` atomically with no dialog (`export-map-to-game` channel, `mapStore.exportMapToGame`; the id is the editor file name slugified, see below). It refuses to write (notice with the first errors) when either is invalid. **Export as File…** is the old save dialog. Run against a project copy (`ELEMENTALS_PROJECT_DIR`), the game folder is the one *beside that copy*, so the real game is never touched. A map that uses a tileset the game does not have yet still needs `npm run assets:sync`.

## Image layers

An editor layer of type `image` holds freely placed pictures (`images[]`: `assetId` for a sprite or `graphicId` for a picture from the graphics library, never both; pixel `x`/`y` = the sprite anchor, optional `z`, `scale`, `flipX`, `opacity`)
instead of tile cells. In the editor they are drawn in layer `z` order (equal `z` keeps the list order) and placed with or without grid snapping.
The converter writes them as a Tiled `objectgroup` with the layer property `kind = image` (and `z` when set); each image is an object with type `image`,
`x`/`y` and the property `sprite` (asset id) or `graphic` (graphic id) plus `cropX`/`cropY`/`cropW`/`cropH`, `z`, `scale`, `flipX`, `opacity` when set, sorted by draw order. The object's `name` is the item's `name` (its picture id when it has none).
**Crops.** A picture item may carry `crop` (`x, y, w, h` in the picture's pixels, whole numbers inside the picture; pictures only, sprites have their own frames).
Several items can show different parts of one picture: they all point at the same file, so nothing is cut out, copied or re-saved. The editor decodes each picture once and draws a sub-rectangle of it;
the game should do the same (one texture per picture, one frame per distinct crop, e.g. Phaser `texture.add(name, 0, x, y, w, h)`), and `assets:sync` copies the picture once however many crops use it.
While an image layer is active, the **Images panel** replaces the tileset panels on the right: the item list (bring forward/send backward = draw order, duplicate, rename, delete), a zoomable preview of the picked item with **Crop…** (a dialog with a draggable box), and its properties. The layer's own name and z stay in Properties on the left.
**Scale.** `scale` (0.1-16) enlarges nearest neighbour: smoothing is off, so picture pixels are never blended. The editor draws the exact size (`w * scale` x `h * scale`); only the game should round to whole pixels (`round(w * scale)`, at least 1) and use nearest-neighbour filtering. In the panel, typing a scale shows `W×H px → W'×H' px` and the preview at once; Enter applies it (one undo step), Esc restores the old value.
A picture waiting to be placed follows the mouse as a translucent ghost (snapped like the placement itself).
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
Note that **Export as File…** names its file after the map's internal `name` field, which can differ from the file name; the script reports that.

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

## Resizing a map

Right-click a map > **Resize…** opens a crop-style dialog: the map is drawn small with a frame whose edges and corners are dragged
(tile snapped), or each side can be typed (positive grows, negative crops). Cells that would be cut are tinted red and a warning lists
the painted tiles, placed pictures and entities that disappear. The resize is applied to the open map (the map is opened first), saved by the
normal autosave, and is one step in undo/redo (history snapshots carry the map size).

The logic is pure: `editor/src/lib/mapResize.ts` (`applyResize`, `resizeLoss`) and `mapResizeView.ts` (preview geometry). Tile `(x, y)` becomes
`(x + left, y + top)`; tile-layer indexes are rebuilt for the new width, entity anchors and image-layer items move by whole tiles (32 px), and
anything whose anchor tile falls outside the new map is dropped. Map connections are not part of this yet; when they exist (they sit on map
edges) they should hook into `applyResize` / `resizeLoss`.
