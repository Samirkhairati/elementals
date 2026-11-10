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
**Export to Game** (Maps panel context menu) validates the editor map and the converted map, then writes `game/public/data/maps/<id>.json` atomically with no dialog (`export-map-to-game` channel, `mapStore.exportMapToGame`; the id is the editor file name slugified, see below). It refuses to write (notice with the first errors) when either is invalid. **Export as File…** is the old save dialog. Run against a project copy (`ELEMENTALS_PROJECT_DIR`), the game folder is the one *beside that copy*, so the real game is never touched. Export to Game also runs the asset sync (what `npm run assets:sync` does: pictures, tilesets, sprites and manifests are copied into `game/public`, `electron/ipc/gameAssets.ts`), so the pictures and tilesets a map uses reach the game with it, and the notice says how many files were copied. It needs the repo's `scripts/lib/assets.mjs` next to the project; for a project copy (the harness) or a packaged editor it is skipped, the notice says so, and you run `npm run assets:sync` yourself. A failed sync never fails the export. `npm run dev` also syncs at start.

## Layer folders

A layer of type `folder` groups tile and image layers in the editor's layer list: the layers it holds follow it in `layers[]` and carry `folderId`; the folder has `collapsed` for its open/closed state. Folders are editor-only: `convertEditorMapToTiled` leaves them out (the held layers export as normal layers, in list order) and `validateEditorMap` only warns about a `folderId` that points at no folder or sits on a layer kind that cannot be held. Logic and drag rules: `editor/src/lib/layerFolders.ts`.

## Image layers

An editor layer of type `image` holds freely placed pictures (`images[]`: `assetId` for a sprite or `graphicId` for a picture from the graphics library, never both; pixel `x`/`y` = the sprite anchor, optional `z`, `scale`, `flipX`, `opacity`)
instead of tile cells. In the editor they are drawn in layer `z` order (equal `z` keeps the list order) and placed with or without grid snapping. Snapping puts the picture's edges on the grid: on each axis the edge nearest to a line (left or right, top or bottom) moves onto it, using the size the game draws (`round(w * scale)`), so a picture two tiles wide is not half a tile off. The grid is the 32 px tile grid unless changed with a right-click on the grid snapping button (size X/Y and offset X/Y, an editor preference shared by every map; drawn as dashed yellow lines when it differs from the tile grid). Holding Shift while placing or dragging a picture locks it to one axis (guide lines along its edges): a drag stays in the row or column it started from, and while placing, once a picture has been placed the next Shift-locked one lines up with it (before that, the lock starts where Shift went down); **Place multiple** (menu of a right-clicked picture, the Images panel, or Ctrl/Cmd+Shift+D) keeps placing copies of a picture with the same crop, scale, flips and opacity; pictures (and entities) can be placed and dragged past the map's edge (they are never clamped to it); a one-tile picture lands exactly where an entity does (`snapImageAnchor`).
The converter writes them as a Tiled `objectgroup` with the layer property `kind = image` (and `z` when set); each image is an object with type `image`,
`x`/`y` and the property `sprite` (asset id) or `graphic` (graphic id) plus `cropX`/`cropY`/`cropW`/`cropH`, `z`, `scale`, `flipX`, `opacity` when set, sorted by draw order. The object's `name` is the item's `name` (its picture id when it has none).
**Crops.** A picture item may carry `crop` (`x, y, w, h` in the picture's pixels, whole numbers inside the picture; pictures only, sprites have their own frames).
Several items can show different parts of one picture: they all point at the same file, so nothing is cut out, copied or re-saved. The editor decodes each picture once and draws a sub-rectangle of it;
the game should do the same (one texture per picture, one frame per distinct crop, e.g. Phaser `texture.add(name, 0, x, y, w, h)`), and `assets:sync` copies the picture once however many crops use it.
While an image layer is active, the **Images panel** replaces the tileset panels on the right: the item list (everything is in the rows' right-click menus: rename, place more copies, bring forward / send backward = draw order, group, y-sort, copy, duplicate, delete), a zoomable preview of the picked item with **Crop…** (a dialog with a draggable box), and its properties. **Add** opens the picture browser: **Pictures**, **Sprites** (tiles beside a folder tree) and **New**, where a picture is uploaded, dropped or pasted (Ctrl/Cmd+V); it is added to Graphics under `pasted/<map name>/` and placed straight away (move or rename it later in Database › Graphics: the maps that use it follow). With a group selected, what is placed goes into it. The layer's own name and z stay in Properties on the left.
**Groups.** Pictures of one image layer can be put into groups, all from the Images panel's right-click menus: **New group** (right-click the list; an empty group is listed on top and its name opens for typing), **Group this picture / Group N pictures**, **Move to group**, **Take out of group** (right-click a picture), **Ungroup** (the pictures stay where they are, as loose pictures) and **Delete group** (with its pictures). Dragging a picture row onto a group row puts it in that group; dropping it onto a picture of a group puts it in that group, onto a loose picture takes it out. Ctrl/Cmd+G groups the picked pictures (one is enough), Ctrl/Cmd+Shift+G ungroups. A group is a row drawn like a layer folder (same right-click menu: rename, add picture inside, new group, copy, duplicate, paste inside, lock, y-sort, ungroup, delete), with its members under it; dragging its row moves all its pictures up or down in the draw order; it is picked, duplicated (its copies form a new "… copy" group), copied and pasted (also into another image layer) and dragged as a whole. Groups stay, empty or not, until they are ungrouped or deleted. **Lock** a group and a click on any of its pictures on the map picks the whole group; select the group's row and single pictures can be picked again until another picture is clicked. Stored as `groups: [{ id, name, locked? }]` on the layer and `groupId` on its pictures; editor view only: validation checks the shape (an unknown `groupId` is a warning), the export and the game ignore both.

**Scale.** `scale` (0.1-16) enlarges nearest neighbour: smoothing is off, so picture pixels are never blended. The editor draws the exact size (`w * scale` x `h * scale`); only the game should round to whole pixels (`round(w * scale)`, at least 1) and use nearest-neighbour filtering. **Resize** (Images panel, Ctrl/Cmd+T) shows a frame with four corner handles around the picked picture on the canvas: dragging a corner scales it (one factor, the shape is kept, `lib/imageResize.ts`) with the opposite corner fixed, drawn live and applied as one undo step when let go; the button reads **Done** while the handles show, and Done, Enter or Esc hides them; **Crop…** is bound to C; both are rebindable in Settings › Shortcuts. In the panel, typing a scale shows `W×H px → W'×H' px` and the preview at once; Enter applies it (one undo step), Esc restores the old value.
The list can be rearranged by dragging a row onto another (in front of / behind it; one undo step). With an image picked, the arrow keys move it 1 px, and Shift+arrow 8 px that doubles for every key repeat while held (up to 512; `lib/imageNudge.ts`); each press is an undo step, and nothing happens while typing in a field, in a dialog, on a locked layer or while placing a picture.
The **Clip to map** toggle in the top toolbar's View group (dashed square with an eye) hides whatever is drawn past the map's edge (pictures and sprites that run off it); it is view-only, off by default, and remembered per browser like the other View toggles.
A picture waiting to be placed follows the mouse as a translucent ghost (snapped like the placement itself).
**In the game** (`game/src/world/imageLayers.ts`): `Game.switchMap` shows every visible `kind=image` object group through `ImageLayerRenderer`. A picture item (`graphic`) is a Phaser image of ONE texture per picture file (`picture:<id>`, loaded for all maps in the Preloader from `graphics/<id>`); each distinct crop is a frame of that texture, added once. A sprite item (`sprite`) shows the character's own static frame, pivot and sheet (its character loads with the map, `charactersForMap`). Position = the bottom-centre anchor, depth = the layer's `z` (items keep their exported order), flips and opacity as set, size = `round(w * scale)` x `round(h * scale)` whole pixels, nearest-neighbour (the game runs with `pixelArt`). A missing picture or sprite, or a crop outside the picture, warns in the console and is skipped. `npm run assets:sync` copies every picture a map's image layer uses to `game/public/graphics/<id>` (once, however many crops) and removes it again when no map uses it.

## Collision shapes (polygon layers)

A **Collision Shapes** layer (`type: 'polygons'`, right-click the layer list › New Layer › Collision Shapes; any number per map, beside the tile `collision` layer) holds `shapes: [{ id, points: [{ x, y }], closed }]` in map pixels (whole pixels). **Closed** shapes are solid areas; **open** ones are lines (walls) that cannot be crossed. While the layer is active the canvas is the shape editor (`canvas/konva/KonvaShapes.tsx`, maths in `lib/polygonEdit.ts`, shared picked-shape state in `lib/polygonEditStore.ts`): click to place points, **Shift** keeps the new edge horizontal or vertical, click the first point to close, double-click / Enter / right-click finishes an open line, Backspace removes the last point, Esc cancels; drag a point or a whole shape to move it (Shift: one axis), double-click an edge to add a point, Alt+click a point to remove it, Delete removes the picked shape. While a point lines up (within 5 screen pixels) with another collider's point (any shape, any entity collider's corners or points), a cyan guide is drawn, solid when on exactly the same pixel; nothing snaps. The Properties panel shows the counts and switches the picked shape between closed and open. Entity / picture placement wins over the editor; entities are picked from the list while a shape layer is active.

Exported as a Tiled `objectgroup` with property `kind=collision`; each usable shape is an object at its first point with `polygon` (closed) or `polyline` (open) points relative to it (`shared/mapExport.ts`). Validation checks the shape fields and warns about shapes with too few points (3 closed, 2 open), which are dropped on export. The game (`game/src/world/collisionShapes.ts` → `CollisionSystem`) uses them whether the layer is shown in the editor or not: a mover's feet (16 × 4 px on its anchor) may not overlap a shape or cross one of its edges (`shapeBlocksMove` in `shared/collisionShapes.ts`, used by free movement and grid steps); a point inside a closed shape is not walkable (wander targets, line of sight). A mover already overlapping a shape can always step off it.

## Entities: tile-based and free

An entity's `components.Transform.free` is `true` for a free entity (any pixel position, any collider size) and absent or `false`
for a tile-based one (anchor `x = col*32+16`, `y = (row+1)*32`, collider of whole tiles). The map format and the Tiled export carry
it unchanged inside the entity's Transform (`convertEditorMapToTiled` never touches entities beyond migration), and a map written
before the flag keeps validating and exporting byte for byte: `schemaVersion` is still 5 and nothing is rewritten. Resizing a map
(below) moves both kinds by whole tiles. See docs/engine-design.md (Coordinates) for how the editor and the game treat the two.

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

## Map size

A map is a size in pixels with a grid of 32 px tiles over it. `width` x `height` are tiles (tile layers paint on that grid); a map that is not a whole number of tiles also stores `pixelWidth` / `pixelHeight` (at most the grid, more than one tile less). `shared/mapSize.ts` (`mapPixelSize`) is the one reading of it: the editor's map frame, the exporter (map properties `pixelWidth` / `pixelHeight`, only when not whole tiles) and the game (`world/mapProps.ts`: camera bounds and the walkable area) all use it. **New Map** takes the size in tiles or as a resolution in pixels (the grid then covers it). The tile size is 32 px for every map; a different tile size per map would touch painting, tilesets, collision and movement (see docs/future-issues.md).

## Map settings

Right-click a map > **Settings…**: `settings.playerZ`, the depth the player draws at in the game (default 20, the usual character depth); tile and image layers with a higher `z` draw over the player. Y-sorted pictures sort among the characters at this depth. Exported as the map property `playerZ`; the game spawns the player with it (`spawnPlayer(..., depth)`). The dialog also shows the size, with a Resize… button.

## Y-sorting

A y-sorted picture draws among the characters by how far down its anchor (bottom-centre) stands, like a character's feet: a character walking behind a tree is hidden by it, one in front covers its trunk. `ySort` can be set on a folder, an image layer, a picture group or a single picture (right-click › Enable / Disable Y-sort); the nearest setting wins (picture, then group, then layer, then folder; nothing set = off), so a layer inside a y-sorted folder can turn it off for itself, and turning it back on clears its own setting so it follows the folder again (`shared/ySort.ts`). Rows that draw y-sorted show a **Y** badge (faded when inherited). The exporter resolves the inheritance and writes `ySort: true` on each picture (folders and groups are editor-only). The game draws those at `sortDepth(playerZ, y)` (`ecs/depth.ts`, the same depth rule as entity sprites), and the pictures never reorder: each keeps its place in the draw order (layer z, then the layer's order) at a fixed depth inside the characters' band, and a character is put between them by comparing its own y with each picture's anchor y (`YSortField` in `ecs/depth.ts`; behind the pictures whose anchor is at or below its feet, in front of the rest; if the order and the y disagree it goes behind the first picture it should be behind); so the player (and characters at the same depth) draws on top while its feet are lower than the picture's anchor and behind it while they are higher. Y-sorting is a game setting only: the editor keeps drawing every picture in its layer, in list order (pictures that are not y-sorted draw at their layer's `z` in the game). Tile layers cannot be y-sorted (they draw as one piece).

## Resizing a map

Right-click a map > **Resize…** opens a crop-style dialog: the map is drawn small with a frame whose edges and corners are dragged, or the width, height or each side can be typed, in **Tiles** or **Pixels** (positive grows, negative crops). The left and top edges move in whole tiles so painted tiles stay on the grid; in Pixels the right and bottom edges stop on any pixel. The preview zooms (wheel, +/-, Fit) and pans (drag the background). Nothing placed is removed: pictures and entities move with the map and stay where they end up, outside it if need be. Only painted tiles that fall off the new tile grid are cropped; those cells are tinted red and the warning lists them per layer. The resize is applied to the open map (the map is opened first), saved by the normal autosave, and is one step in undo/redo (history snapshots carry the map size).

The logic is pure: `editor/src/lib/mapResize.ts` (`applyResize`, `resizeLoss`; edges in pixels) and `mapResizeView.ts` (preview geometry in tiles, fractions allowed). Tile `(x, y)` becomes `(x + left/32, y + top/32)`; tile-layer indexes are rebuilt for the new width; entity anchors and image-layer items move by `(left, top)` pixels. Map connections are not part of this yet; when they exist (they sit on map
edges) they should hook into `applyResize` / `resizeLoss`.
