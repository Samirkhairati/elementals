# Elementals

A 2D tile-based, Pokémon-like game plus its own desktop map/event editor. The editor writes JSON into `project/`, an exporter turns
that into what the game loads, and both sides share one data contract in `shared/`.

| Dir | What it is |
|---|---|
| `game/` | Phaser 3 + TypeScript + Vite web game (ECS runtime) |
| `editor/` | React + Dockview + react-konva + Electron editor (also runs in a plain browser, see the harness) |
| `shared/` | The data contract used by both: `engine/` (components, commands, graphs, validation, migration), `mapExport.ts`, `mapSchema.ts`, `mapTypes.ts`, `sceneTree.ts` (the map as a tree of nodes), `png.ts` |
| `project/` | The author's data: `maps/`, `tilesets/`, `graphics/`, `database/`, `database.json` (editor reads/writes it) |
| `scripts/` | Dev runner (`dev.mjs`), worktree launcher (`wt.mjs`), `export-maps.mjs`, `sync-assets.mjs` |
| `docs/` | Design docs, read the matching one before changing a system (index at the bottom) |

## Setup and commands

Node **24** (`.nvmrc`, `engine-strict`; other versions are refused). Every checkout and every `git worktree` needs its own install:

```bash
npm install --prefix game
npm install --prefix editor
```

| Command | Does |
|---|---|
| `npm run dev` | Game + Electron editor together; if either exits, both stop. Checks installs and ports first |
| `npm run dev:game` / `npm run dev:editor` | One of them, on the default ports |
| `npm run verify` | typecheck + lint + all tests (what to run before calling something done) |
| `npm test` | game vitest + editor vitest + `test:scripts` (node `--test`) |
| `npm run typecheck`, `npm run lint` | both packages; `editor` typecheck = `tsc --noEmit` + the two electron tsconfigs |
| `npm run maps:check` / `maps:export` | compare / write `project/maps` -> `game/public/data/maps` (see Maps) |
| `npm run assets:sync` / `assets:check` | copy used graphics and write the manifests under `game/public/` |

Run one test file: `cd editor && npx vitest run src/lib/paintOps.test.ts` (same in `game/`). Tests sit next to the code (`x.ts` + `x.test.ts`).
Editor vitest has two projects, `renderer` (jsdom) and `electron` (node).

## Worktrees and ports

Ports are `base + offset * 100` (game base `5175`, editor Vite base `5174`). The main checkout is offset `0`; a linked worktree gets a stable
offset `1..99` hashed from its real path and moves to the next free one if busy (the banner says so). `npm run dev:wt` / `dev:wt2` force offset 1 / 2.
Vite uses `strictPort`, so a clash fails loudly. Useful: `node scripts/dev.mjs --list` (show ports, `--json` for machines), `--dry-run`, `--offset N`.
Overrides, highest first: `--offset`, `PORT_OFFSET`, detected; `GAME_PORT` / `PORT` set one port; `WORKTREE_NAME` sets the shown name.
Tab/window titles show `[<worktree>] (Port: n)`. `Ctrl+C` stops the whole process tree. `npm run wt` lists, creates, installs, runs and removes worktrees.
Worktree detection uses git plumbing only (`scripts/lib/worktree.mjs`); `npm run test:scripts` covers the runners.

## How data flows

```
editor  --writes-->  project/maps/*.json (editor map format, tile index keyed)
                           |  shared/mapExport.ts  (npm run maps:export, or right-click a map > Export to Game)
                           v
                     game/public/data/maps/<id>.json  (Tiled 1.10 JSON + a top-level `entities` array)
                           |  MapParser -> PhaserTilemapAdapter + hydrateMapEntities
                           v
                     game (ECS world)
```

* The game **never reads `project/`**; the committed copies in `game/public/data/` are what ships. Editing in the editor does not update the game
  until you export. `maps:check` reports `IN SYNC | DRIFTED | MISSING_IN_GAME | INVALID`; `--write` only creates missing maps unless you pass
  `--only <name> --force`. Map id = source file name, lower-cased, non `a-z0-9` runs -> `-` (Export to Game uses the file name and also runs the asset sync into `game/public` when the repo scripts are beside the project; "Export as File…" uses the map's internal `name`, which can differ). Right-click a map > Resize… crops/grows it (`editor/src/lib/mapResize.ts`, see docs/maps.md).
* `shared/` is imported by the editor with relative paths and by Node scripts with explicit `.ts` extensions (type stripping), and by the game via `@shared/*`.
  Keep it **free of enums, namespaces, parameter properties and DOM/Node imports**. If a doc and `shared/engine/types.ts` disagree, fix the types first.
* Maps carry `schemaVersion` (current 8: a map is one tree of Godot-style `nodes`, YSort a child node, see docs/maps.md; events stored as graphs, trigger = start kind + `blocks`). Old data is migrated on load by pure, idempotent functions in `shared/engine/migrate.ts`
  (editor on load, exporter on export, game defensively); nothing is written back until the author edits. Existing user data is never "fixed".
* Tilesets and sprites: PNGs under `project/`; `assets:sync` copies the ones in use to `game/public/graphics/` and writes manifests. The tileset/layer named `collision` is data, never drawn. The editor runs this sync itself when you import a picture or tileset, save the game settings or Export to Game (`withAssetSync` in `editor/electron/ipc/projectApi.ts`; it runs the repo script in a child `node` because Electron's own Node cannot load the `shared/*.ts` it imports, so Node 24 must be on the PATH; skipped for project copies and packaged editors).
* **Looks** (colour grading of the map, a layer or a picture, per profile, with masks, user shaders and drop shadows) are `shared/look/`, drawn by the same GLSL in the game and the editor; profiles in `project/looks.json`, shaders in `project/shaders/`; see docs/looks.md.
* **Game settings** (view size, camera, movement) are `shared/gameSettings.ts`: the schema is the one source (the editor's **Game Settings** page in the main sidebar builds its form from it, the sync and the game clean values with `normalizeGameSettings`). Stored in `project/game-settings.json`, synced to `game/public/data/settings.json`, loaded by Boot/Preloader into `settingsStore`. New setting = one schema row + read it from `settingsStore`.
* Graphics (`project/graphics`) and tilesets (`project/tilesets`) are imported (several files at once, or a whole folder: **Import folder…** or a folder dragged in from the OS brings every PNG below it with its nested folders, under the destination folder; picked, dragged in from the OS or pasted with Ctrl/Cmd+V from the clipboard; the folder clicked last is the destination; all go through the same naming dialog), organised in folders, renamed, moved and deleted in **Database › Graphics / Tilesets** (`editor/src/lib/assetOps.ts` plans the change and rewrites
  sprites and maps); the Map Editor only browses and picks them. A tileset's id is its file name (folders do not matter to maps); a graphic's id is its path. Image-layer items point at a sprite (`assetId`) or a picture (`graphicId`).

## Engine model (`shared/engine`, see docs/engine-design.md)

* An entity is a bag of **seven components**: Transform, Sprite, Collider, Area, Movement, Event, Tag. The game expands them into runtime components (`game/src/ecs/expand.ts`). In a map they are the entity node's **child nodes** (AnimatedSprite, StaticBody / Area with a CollisionShape, Wander / PlayerController / Mover, Event; Transform and Tag stay in `components`): read the bag with `componentsOfEntity` / `engineEntityOf` (`shared/sceneEntity.ts`) or `entityView` in the editor, write it with `entityWithComponents`. Area = where events trigger when a solid body is the Collider (`triggerArea`).
* Tile = **32 px**. `Transform` is the **anchor**: bottom-centre of the entity's tile (`x = col*32+16`, `y = (row+1)*32`). Colliders are bottom-centred on the anchor
  (default one tile); sprites draw with their pivot on the anchor. There is **one kind of entity**: its area is its
  Collider box (default one tile; no Collider = one tile), resized with handles on the map and snapped with the top-toolbar magnet like pictures (area edges on grid lines; off = whole pixels).
  `Transform.free` is derived from the position, never chosen (`withDerivedFree`, `shared/engine/placement.ts`): off the tile grid = the game keeps its pixel position and steps from it. See docs/engine-design.md.
* Events are state machines (states with conditions) whose body is a **node graph** (`shared/engine/graph.ts`, `docs/event-graph-spec.md`). New interpreter command:
  catalog entry in `shared/engine/commands.ts`, handler in `game/src/events/commands/*.ts`, test with `makeRig()`.
* Characters (sprites) are v2 `CharacterDef`s in `project/database/characters/`; ids look like `characters/player`, `objects/chest`. A sheet's picture can be a **GIF** graphic (`x.gif`): the editor decodes it (`shared/gif.ts`), the sync writes its frames as a PNG sheet `graphics/x.gif.png` that the game plays like any sheet, the fps is the clip's; see docs/database-and-characters-spec.md §4. `editor/electron/ipc/{gif,pngEncode,gifSheet}.ts` are pinned copies of the `shared/` files (the main process cannot import `shared/`).
* Global switches / variables / stages live in `project/database.json`.

## Game (`game/src`, see docs/game-runtime.md)

* Scenes: `Boot` -> `Preloader` -> `Game` (+ `UIScene` for HUD). `ecs/` (World, systems by priority), `events/` (interpreter, triggers, routes), `sprites/`, `world/` (map + tilemap),
  `components/` (HUDs: dialogue, choices, debug), `core/` (GameState, settings, boot params). The `@/` alias is `game/src`.
* URL params: `?map=<id>`, `?renderer=canvas|webgl|auto`, `?debug=1` (debug HUD + `window.__game`). Dialogue / choice HUDs are driven through the `EventBus`.
* The view is **16:9, 32 x 18 tiles by default** (`settingsStore.view`, from the game settings), fitted to the window at any zoom (whole-number zoom is a setting). Movement and the camera are frame-rate independent and sub-pixel (pixel snapping is a setting): do not add `Math.round`/`floor` to positions or camera scroll. Smaller maps are centred on the screen.
* Tile and image layer depth is the layer's `z` (Phaser depth), nudged by `layerDepth` (`ecs/depth.ts`) so layers of equal `z` draw in the editor's list order (the export lists layers top first).
* The game needs WebGL (or `?renderer=canvas`); some embedded browser panes cannot create the framebuffer and show a blank canvas.

## Editor (`editor/`)

* **Electron main** (`electron/`) owns file access through `electron/ipc/*Store.ts` (atomic writes, `resolveInside` path safety). The renderer gets `window.electronAPI`.
* **Browser harness** (docs/editor-harness.md): `vite-plugin-project-api.ts` serves the same IPC channels at `/__api/<channel>` so the whole UI runs in a normal browser.
  **The editor autosaves, so run it against a copy** when you will click around: `cp -R project /tmp/project-copy && cd editor &&
  ELEMENTALS_PROJECT_DIR=/tmp/project-copy PORT=5199 npx vite --port 5199 --strictPort`, then open `http://localhost:5199/#/editor`.
  Against the real `project/` only when you mean to edit it, and check `git diff project/` afterwards.
* **State shape**: one `EditorPage` (`src/routes/editor.tsx`) composes the managers in `src/hooks/editor/` (`useMapManager`, `useLayerManager`, `useEntityManager`,
  `useGridSettings`, `useTilesetManager`...) plus `usePaintTools`, `useHistory`, `useMapAutosave`. It puts everything into one memoised context
  (`components/editor/layout/EditorContext.tsx`); Dockview panels read slices through `useEditorSelector` in `layout/dockview/PanelWrappers.tsx`.
  Adding editor state means: manager hook -> `EditorContext` type -> a field of the `contextValue` object in `editor.tsx` (kept stable by `useShallowStable`, so there is no deps array) -> a wrapper selector.
  The map's **scene tree** (`MapData.nodes`) is the one source of truth: `useSceneTree` holds the tree commits and the selection, `useLayerManager` (layers, groups, collision items; composes `useImageItems` for pictures) and `useEntityManager` are thin wrappers over its pure operations (`lib/sceneOps.ts`); read-only views come from `sceneIndex(nodes)` (`lib/sceneIndex.ts`, cached per tree identity: lookups, inherited shown/locked, layers in draw / list order, the canvas `drawPlan`) and the selection views from `lib/sceneSelection.ts`.
* Pure logic lives in `src/lib/` (`paintOps`, `sceneOps`, `sceneIndex`, `sceneSelection`, `layerSelection`, `history`, ...) and is unit-tested; hooks are thin wrappers around it. Alias `@/` = `editor/src`.
* **Dialogs**: Esc closes (Radix). Enter presses the button marked `data-dialog-confirm` (handled once in `components/ui/dialog.tsx`; fields inside a `<form>`, buttons and text areas keep their own Enter). Confirm dialogs use `ConfirmFooter`/`DangerHeader` (`dialogs/ConfirmParts.tsx`): the Delete button takes focus and shows its key. Inline "Delete anyway / Cancel" boxes are `<InlineConfirm>` (`ui/InlineConfirm.tsx`, which mounts `<ConfirmKeys>`). New dialogs: mark the confirm button.
* **Help text goes in an info icon**: explanations, how-it-works notes and tips are an `InfoTip` (`ui/controls.tsx`, the little "i" that opens on click, or `info=` on `Field`/`Section`) next to the label or title they explain, never a standing paragraph (`ed-hint`) in the layout. Only state ("No images yet", errors, live readouts) stays as visible text.
* UI conventions: `ed-*` classes in `src/index.css` (rows, badges, buttons), controls in `components/editor/ui/controls.tsx`, native `title` attributes as tooltips,
  lucide icons. Canvas is react-konva (`components/editor/canvas/konva/`).
* **Reuse before writing** (each replaced several hand-written copies): a small 2D canvas is set up with `prepareCanvas` and thumbnails fit with
  `fitZoom`/`centredRect` (`lib/canvas2d.ts`); a map preview draws through `drawMapScenery` (`lib/mapScenery.ts`); a mouse drag that leaves the
  element uses `trackWindowDrag`/`trackWindowPan` (`lib/windowDrag.ts`); a hand-made popover closes with `useDismiss` (`hooks/useDismiss.ts`); a
  CSS-transform preview pans and zooms with `usePanZoom`. Game code reading raw map JSON uses `game/src/world/tiledRaw.ts`; `isRecord` comes
  from `shared/engine/util.ts`; scripts write files with `scripts/lib/atomicWrite.mjs`. A list row being renamed shows `<RenameInput>` (`ui/RenameInput.tsx`);
  an object handed to a context or a dependency list is kept stable with `useShallowStable`; where a dock panel opens is the `PANEL_PLACEMENT` table
  (`layout/dockview/panelPlacement.ts`). `npm run lint` fails on any warning, so fix them as they appear.

### The scene tree and the canvas

* A map is **one tree of Godot-style nodes** (`shared/sceneTree.ts`, schema 8, table in docs/node-tree-plan.md "Schema 7" and "Schema 8"; labels have no "2D"): Node (`group`), YSort (`ySort`, a leaf child of a Node like its Look: shown = everything in the Node sorts, `sortsBelow`), TileMap (`tile`), `terrain` / `encounters` / `objects`, Sprite (`picture`, only inside a Node), Look (`look`, one per TileMap / Sprite / Node), the map's StaticBody (`collision`, holding `collisionTiles` / `collisionShape`), and Entity with its component nodes. There are no image layers. `NODE_TYPES` gives each type its label, lucide icon and colour; `childTypesOf` / `canHold` / `canPlace` are the placement rules with slots (one Look per node, one of each component and one movement node per entity, one shape per body or area, one terrain and one encounters per map). Children are stored in **draw order** (first child at the back). Old trees are retyped on load by `typedNodes` (`shared/sceneTreeMigrate.ts`). Sprite runs (`shared/sceneLayers.ts`) are what export as `kind=image` object groups.
* The **Scene panel** (`panels/SceneTree.tsx`, dock panel id `layers`, titled SCENE; a saved layout's old title is replaced by `RENAMED_PANELS`) has the map as its top row (selected while nothing else is, so the Look panel edits the map look; drops on it use `SCENE_ROOT_ID`) and lists the whole tree **top first** (a container's children last-first), so the top row is drawn on top and what the list shows is what you see. One row component and one right-click menu (`RowMenu`) serve every type: click / Ctrl-Cmd+click / Shift+click select, double-click renames, Godot-style connector lines (`Guides`), eye and lock on every row (inherited: a node is hidden or locked when an ancestor is; a hidden collision item is hidden in the editor only), a chevron only on nodes with children opens and closes them (`collapsed`, not an undo step), drag and drop between any places the rules allow (`dropWhere`, `canDrop` / `moveNodesTo`: lower half of a container = inside). Menus: Edit event, **Add Child Node** (what the node may hold, Prefab included; Sprite opens the picture browser; the legacy `objects` type is not offered), Save as Prefab… (Nodes), Place more copies (Sprite), Rename / Copy / Paste (inside) / Duplicate, Group / Ungroup, Delete (asks first for layers and groups). The root row's menu: Add Child Node, Add Look and Paste; the map's look is a Look row under the root. A Node's z, opacity and pick-as-one are in the Properties panel. New layers go on top of their container, below the collision / terrain / encounters layers (`defaultIndex`).
* A layer's `z` is a separate property (shown as a badge, exported as a Tiled property, used by the **game** as depth). The editor does not sort by it. Moving nodes never edits `z` (a moved picture only takes its neighbour's picture `z`, see `settlePictureZ`).
* **One kind of Node** (docs/node-tree-plan.md "One kind of Node"): every Node (`group`, `entity`, `picture`) has an anchor (`nodeAnchor`; a `group` may carry `x`/`y`/`rotation`), moving or turning one carries what it holds (`translateSubtree` / `rotateSubtree`; editor `placeNode` / `rotateNode`, Alt = anchor only), a `group` that gets a component node becomes an `entity` on commit (`promoteNodes`), and a Node shows only its anchor on the map: a box comes from a StaticBody / Area holding a CollisionShape. **Prefabs** are saved node trees (`shared/prefabs.ts`, `project/prefabs.json`, `lib/prefabLibrary.ts`, `dialogs/PrefabDialogs.tsx`; built-ins until the project saves its own). The **Properties** panel (dock id `inspector`) is always at the top of the right sidebar: node, tag, transform (rotation, a Sprite's origin), drawing, components; a Look node shows the look editor there.
* **Entities** sit in the tree where they draw (any group; migrated maps put them in a group named "Entities" where the old Entities row was). The canvas draws the tree bottom-up (`drawPlan`): runs of neighbouring entities sort among themselves; entity areas, labels and the selection always draw on top. There is no separate Entities panel or `entitiesIndex` (an old saved layout's `entities` panel is closed on load).
* **Collision layers** hold their items as children: sets of painted tiles (`collisionTiles`; the cells are the layer's `data`, `tile.group` names the item) and single shapes (`collisionShape`, closed polygons or open lines), see docs/maps.md. While one is active the **Collision panel** (`panels/CollisionPanel.tsx`, dock panel `collision`, `collisionFocus`) replaces the tileset panels: items, **Tiles** / **Shape** brush (`lib/polygonEditStore.ts`). Painting puts new cells into the picked tiles item (`paintCollision`). All collision layers export into the one `collision` tile layer the game reads, plus one `kind=collision` object group per layer with shapes.
* **Sprites** (`picture` nodes: anchor `x/y`, `z`, `scale`, `flipX/flipY`, `opacity`, `crop`, `name`) sit in a Node (what an image layer was); they never take tile paint. Lock always freezes; a Node with **`pickAsOne`** is picked as a whole when one of its sprites is clicked (`expandPictureClick`). Sprites are picked on the canvas only while their own Node is the active node (the top-toolbar **Lock pictures to their layer**, on by default). Entities always win over pictures: their handles (`KonvaEntities part="hits"`) are stacked above the picture handles. Placement and dragging snap to the
  tile anchor when the top-toolbar magnet (`snapToGrid`) is on, and are free otherwise. Exported as a Tiled `objectgroup` with property `kind=image` (inherited visibility and y-sort folded in); the game draws them (`game/src/world/imageLayers.ts`, one texture per picture, crops as frames; `assets:sync` copies the pictures).
  While a Node is active the **Images panel** (`panels/ImagesPanel.tsx`, dock panel `images`) replaces the tileset panels on the right (`useDockviewLayout` `imageFocus`; an entity selection still wins): the picture browser (opened by Add Child Node › Sprite through `openPicturePicker`), the picture being placed, and the inspector of the picked picture: preview, **Crop…** (`dialogs/CropImageDialog.tsx`, maths in `lib/cropRect.ts`), **Resize** (corner handles on the canvas, `konva/KonvaImageResize.tsx`, maths in `lib/imageResize.ts`), fields; Ctrl+G / Ctrl+Shift+G group and ungroup. The picture rows themselves are in the Scene panel. Crops are regions of the one shared picture (`lib/imageItems.ts` draws sub-rectangles), never copies.
* **Navigation**: the canvas has the zoom bar bottom-left (slider 10%-800%, +/-, 1:1, **reset** = fit the whole map) and a minimap bottom-right (one pixel per tile, frame = visible area; click or drag to move the view, collapsible).
  The stage is driven imperatively; `useCanvasViewport` exposes its scale/position through a small external store (`viewStore`) so only the navigator re-renders while panning. Maths in `hooks/editor/canvas/viewMath.ts`.
* **Pin** (Active Selection panel): Ctrl/Cmd+click layers, then right-drag samples all of them; painting writes each part back to its own layer (`lib/layerSelection.ts`, `usePaintTools`).
* Collision layers paint a `__collision__` marker tile (with or without a tileset tile picked); `fitSelectionToLayer` keeps that marker off tile layers and tile selections off collision layers.

## Conventions

* TypeScript everywhere, no `any` in new code unless the surrounding file already does it. Match the neighbouring code's comment density and naming.
* Commits use conventional prefixes seen in history: `feat(editor):`, `fix(game):`, `style(editor):`, `test(game):`, `chore:`. Small, focused, imperative. No AI attribution lines.
* Add or update tests with the change (colocated). Before saying something is done run `npm run verify`; UI changes also deserve a look in the editor (harness above).
* Do not hand-edit generated or synced files (`game/public/data/*`, `game/public/graphics/*`); use the scripts. Do not edit `project/` data by hand while an editor is open on it.
* Keep `shared/` pure and dependency-free; put new contract types there, not in one app.

## Docs

`docs/engine-design.md` (components, migration, sprites) · `docs/game-runtime.md` (boot, events, animation, loading) · `docs/event-graph-spec.md` (graph events) ·
`docs/database-and-characters-spec.md` (database + characters v2) · `docs/maps.md` (formats, export, image layers) · `docs/looks.md` (colour grading, masks, profiles, shaders) · `docs/future-issues.md` (known scaling/cleanup items to look at later; **add to it whenever you notice one**) · `docs/editor-harness.md` (browser harness) ·
`docs/event-triggers-proposal.md` (implemented; the design and why) and `docs/picture-drawing-proposal.md` (proposal awaiting a decision) · `docs/node-tree-plan.md` (phases 1–4 implemented: the scene tree of schema 6 maps; phases 5–6 open) · `roadmaps/event-editor.md` · `game/refactor_game.md` (ECS migration plan) · `README.md` (quick start, worktree launcher).
