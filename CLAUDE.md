# Elementals

A 2D tile-based, Pokémon-like game plus its own desktop map/event editor. The editor writes JSON into `project/`, an exporter turns
that into what the game loads, and both sides share one data contract in `shared/`.

| Dir | What it is |
|---|---|
| `game/` | Phaser 3 + TypeScript + Vite web game (ECS runtime) |
| `editor/` | React + Dockview + react-konva + Electron editor (also runs in a plain browser, see the harness) |
| `shared/` | The data contract used by both: `engine/` (components, commands, graphs, validation, migration), `mapExport.ts`, `mapSchema.ts`, `mapTypes.ts`, `png.ts` |
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
                           |  shared/mapExport.ts  (npm run maps:export, or the editor's Export button)
                           v
                     game/public/data/maps/<id>.json  (Tiled 1.10 JSON + a top-level `entities` array)
                           |  MapParser -> PhaserTilemapAdapter + hydrateMapEntities
                           v
                     game (ECS world)
```

* The game **never reads `project/`**; the committed copies in `game/public/data/` are what ships. Editing in the editor does not update the game
  until you export. `maps:check` reports `IN SYNC | DRIFTED | MISSING_IN_GAME | INVALID`; `--write` only creates missing maps unless you pass
  `--only <name> --force`. Map id = source file name, lower-cased, non `a-z0-9` runs -> `-` (the Export button names its file after the map's internal `name`, which can differ).
* `shared/` is imported by the editor with relative paths and by Node scripts with explicit `.ts` extensions (type stripping), and by the game via `@shared/*`.
  Keep it **free of enums, namespaces, parameter properties and DOM/Node imports**. If a doc and `shared/engine/types.ts` disagree, fix the types first.
* Maps carry `schemaVersion` (current 4: events stored as graphs). Old data is migrated on load by pure, idempotent functions in `shared/engine/migrate.ts`
  (editor on load, exporter on export, game defensively); nothing is written back until the author edits. Existing user data is never "fixed".
* Tilesets and sprites: PNGs under `project/`; `assets:sync` copies the ones in use to `game/public/graphics/` and writes manifests. The tileset/layer named `collision` is data, never drawn.

## Engine model (`shared/engine`, see docs/engine-design.md)

* An entity is a bag of **six components**: Transform, Sprite, Collider, Movement, Event, Tag. The game expands them into runtime components (`game/src/ecs/expand.ts`).
* Tile = **32 px**. `Transform` is the **anchor**: bottom-centre of the entity's tile (`x = col*32+16`, `y = (row+1)*32`). Colliders are bottom-centred on the anchor
  (default one tile); sprites draw with their pivot on the anchor. Grid snapping in the editor snaps to this anchor.
* Events are state machines (states with conditions) whose body is a **node graph** (`shared/engine/graph.ts`, `docs/event-graph-spec.md`). New interpreter command:
  catalog entry in `shared/engine/commands.ts`, handler in `game/src/events/commands/*.ts`, test with `makeRig()`.
* Characters (sprites) are v2 `CharacterDef`s in `project/database/characters/`; ids look like `characters/player`, `objects/chest`.
* Global switches / variables / stages live in `project/database.json`.

## Game (`game/src`, see docs/game-runtime.md)

* Scenes: `Boot` -> `Preloader` -> `Game` (+ `UIScene` for HUD). `ecs/` (World, systems by priority), `events/` (interpreter, triggers, routes), `sprites/`, `world/` (map + tilemap),
  `components/` (HUDs: dialogue, choices, debug), `core/` (GameState, settings, boot params). The `@/` alias is `game/src`.
* URL params: `?map=<id>`, `?renderer=canvas|webgl|auto`, `?debug=1` (debug HUD + `window.__game`). Dialogue / choice HUDs are driven through the `EventBus`.
* Tile-layer depth comes from the layer's `z` property (Phaser depth). Layers are created in file order.
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
  Adding editor state means: manager hook -> `EditorContext` type -> the `contextValue` object **and its deps array** in `editor.tsx` -> a wrapper selector.
* Pure logic lives in `src/lib/` (`paintOps`, `layerOrder`, `layerSelection`, `history`, ...) and is unit-tested; hooks are thin wrappers around it. Alias `@/` = `editor/src`.
* UI conventions: `ed-*` classes in `src/index.css` (rows, badges, buttons), controls in `components/editor/ui/controls.tsx`, native `title` attributes as tooltips,
  lucide icons. Canvas is react-konva (`components/editor/canvas/konva/`).

### Layers and the canvas

* The layer list is **top first** and the canvas draws it **bottom-up in list order**: what the list shows is what you see. Reordering only changes order.
* A layer's `z` is a separate property (shown as a badge, exported as a Tiled property, used by the **game** as depth). The editor does not sort by it. Dragging layers never edits `z`.
* Types: `tile`, `image`, and the gameplay layers `collision`, `terrain`, `encounters`, `objects`. Collision/terrain/encounters are singletons per map.
* The **Entities row** is part of the stack: its position is the map field `entitiesIndex` (how many layers are above it; missing = on top). Entity sprites draw there,
  entity areas/labels/selection always draw on top. Editor-only, not exported.
* **Image layers** hold freely placed sprite assets (`images[]`: anchor `x/y`, `z`, `scale`, `flipX/flipY`, `opacity`); they never take tile paint. Placement and dragging snap to the
  tile anchor when the top-toolbar magnet (`snapToGrid`) is on, and are free otherwise. Exported as a Tiled `objectgroup` with property `kind=image`; **the game does not draw these yet**.
* **Pin** (Active Selection panel): Ctrl/Cmd+click layers, then right-drag samples all of them; painting writes each part back to its own layer (`lib/layerSelection.ts`, `usePaintTools`).
* Collision layers paint a `__collision__` marker tile; `fitSelectionToLayer` keeps that marker off tile layers and tile selections off collision layers.

## Conventions

* TypeScript everywhere, no `any` in new code unless the surrounding file already does it. Match the neighbouring code's comment density and naming.
* Commits use conventional prefixes seen in history: `feat(editor):`, `fix(game):`, `style(editor):`, `test(game):`, `chore:`. Small, focused, imperative. No AI attribution lines.
* Add or update tests with the change (colocated). Before saying something is done run `npm run verify`; UI changes also deserve a look in the editor (harness above).
* Do not hand-edit generated or synced files (`game/public/data/*`, `game/public/graphics/*`); use the scripts. Do not edit `project/` data by hand while an editor is open on it.
* Keep `shared/` pure and dependency-free; put new contract types there, not in one app.

## Docs

`docs/engine-design.md` (components, migration, sprites) · `docs/game-runtime.md` (boot, events, animation, loading) · `docs/event-graph-spec.md` (graph events) ·
`docs/database-and-characters-spec.md` (database + characters v2) · `docs/maps.md` (formats, export, image layers) · `docs/editor-harness.md` (browser harness) ·
`roadmaps/event-editor.md` · `game/refactor_game.md` (ECS migration plan) · `README.md` (quick start, worktree launcher).
