# Elementals engine design

Goal: an RPG-Maker-XP-style engine for Pokémon-like games with a modern setup (TypeScript, ECS, data in
JSON, an editor that is pleasant to use). The editor and the game must always agree on the data, so
everything below is defined once in `shared/engine/` and consumed by both.

Contract types: [`shared/engine/types.ts`](../shared/engine/types.ts). If this document and the types ever
disagree, fix the types first, then this document.

## 1. Entities and components

An entity is a bag of components. A map holds a list of entities. There are **six** components; each one
answers one question about the entity:

| Component | Question it answers | Replaces (schemaVersion 1) |
|---|---|---|
| **Transform** | Where is it, and what draws on top of what? | Transform |
| **Sprite** | What does it look like (and how does it animate)? | SpriteView + CharacterAnimation |
| **Collider** | What space does it occupy / what area does it cover? | Collider |
| **Movement** | Does it move, and who drives it? | GridMovement + FreeMovement + PlayerControl + AIWander |
| **Event** | What happens when the player interacts with it? | Interactable |
| **Tag** | Free-form label for lookups (`npc`, `chest`) | Tag |

### Why the old set was confusing
* *SpriteView vs CharacterAnimation*: one drew a single frame, the other picked animations by name.
  Authors had to add both and keep texture/character keys in sync. Now there is one **Sprite** that points
  at a **sprite asset**; whether and how it animates is a property of the asset (`kind: character` assets
  have 4-direction walk/run/idle that the engine drives from movement and facing automatically).
* *GridMovement / FreeMovement / PlayerControl / AIWander*: whether the world moves tile-by-tile or freely
  is a **game-wide setting**, not a per-entity choice, and "player control" and "wander" are just two ways
  to drive movement. Now there is one **Movement** with a `controller`: `none | player | wander`.
* *Interactable*: a hard-coded message/warp. Now it is an **Event** with states and commands.

### Coordinates
* Pixels in map space, tile = 32px. `Transform` is the **anchor**: bottom-centre of the entity's tile
  (`x = col*32 + 16`, `y = (row+1)*32`). Placing on the grid snaps to this.
* Collider box is bottom-centred on the anchor, then shifted by `offsetX/offsetY` (+y is down).
* Sprite is drawn with its pivot (asset `pivotX/pivotY`, default bottom-centre) on the anchor, then shifted
  by the Sprite `offsetX/offsetY`.
* **Default collider = one tile** (32×32, offset 0,0, solid). The old 16×8 default was a player "feet"
  box and looked wrong for placed objects. The editor offers "Fit to tile" and "Fit to sprite".

### Migration
Legacy maps (no `schemaVersion`, or components named in `LegacyComponentType`) are converted by
`migrateEntity` / `migrateMap` in `shared/engine/migrate.ts` (pure, idempotent, never mutate their input, return
`{ value, changed }`; `value` is the very same object when nothing changed). The editor migrates on load
(`useMapManager.loadMaps` / `onSelectMap`, nothing is written back until the author edits), the exporter migrates
on export (Tiled JSON always has canonical `entities` and `schemaVersion: 2`), and the game migrates defensively on
load. Rules:

| Legacy | Becomes |
|---|---|
| `SpriteView` + `CharacterAnimation` | `Sprite`. `asset`: `characterKey` -> `characters/<key>`; else texture `<key>-walk` / `<key>-run` -> `characters/<key>`; any other texture -> `objects/<texture>`. `facing` = `CharacterAnimation.direction` (else Grid/FreeMovement direction, else `down`). `frame`, `flipX`, `visible` kept; `alpha` -> `opacity`; numeric `tint` -> `#rrggbb` (white = none). `originX/Y` and `movementType` are dropped. |
| `GridMovement`, `FreeMovement`, `PlayerControl`, `AIWander` | `Movement`. `controller`: PlayerControl -> `player`, else AIWander -> `wander`, else `none`. `speed`: AIWander's own speed for `wander`, else Grid/FreeMovement speed (default 100). Wander radius/interval come from AIWander. `isMovementLocked` is dropped. |
| `Interactable` | `Event` with one state. `on_step` -> trigger `playerTouch`, anything else -> `action`. Commands, in this order and only when set: `message` -> `showText`; `targetMap` -> `warp` (`targetX/targetY` are tile coordinates, a trailing `.json` is removed from the map id); `eventKey` -> `emit`. |
| `Transform`, `Collider`, `Tag`, unknown components | kept untouched. A missing `Transform` is created from `entity.x/y`; if both exist the Transform position wins and `entity.x/y` follow it. |

Generated ids (state, commands) are deterministic (`deterministicId(entityId/...)`), so exporting the same legacy map
twice gives byte-identical output and `npm run maps:check` has no spurious drift. Existing user data is never
"fixed" (e.g. a 16x8 collider stays 16x8).

## 2. Sprite assets

Directory per asset under `project/sprites/<id>/` with `sprite.json` (`SpriteAssetMeta`) and its sheet PNGs.
Ids are the directory path (`characters/player`, `objects/chest`).

* `character`: sheets `walk` (+ optional `run`); rows = down, left, right, up; `framesPerDirection` frames
  per row; idle = `idleFrame` of the row for the current facing (from the walk sheet).
* `object` / `animated`: one `sheet`, optional named `animations` (`frames`, `fps`, `loop`).
* Pivot defaults to bottom-centre so a sprite "stands" on the anchor.

`scripts/sync-assets.mjs` (`npm run assets:sync`) turns `project/` into what the game loads:
`game/public/graphics/sprites/<id>/*`, `game/public/graphics/tilesets/*`, and generated JSON manifests under
`game/public/data/` (`sprites.json`, `database.json`). The game never hard-codes asset lists.

Editor and game share the frame maths in `shared/engine/sprites.ts` so the editor preview shows exactly the
frame the game will show (`previewFrame`). Character sheets must be exactly `framesPerDirection` frames wide; a frame
index is `row * framesPerDirection + column`, `tick` is elapsed milliseconds.

Naming contract (the game registers exactly these keys; the sheet role is `walk`/`run` for characters, `sheet` otherwise):
`spriteTextureKey(id, role)` = `sprite:<id>:<role>`, `characterAnimKey(id, phase, facing)` = `sprite:<id>:<phase>-<facing>`
(phase `idle|walk|run`), `objectAnimKey(id, name)` = `sprite:<id>:<name>`. `buildAnimationRegistrations(id, meta)` lists every
animation to create. `buildSpriteManifest(assets)` produces `data/sprites.json`
(`{ version: 1, sprites: [{ id, meta, files: { 'walk.png': 'graphics/sprites/<id>/walk.png' } }] }`, sorted by id) and
`buildDatabaseManifest(db)` produces `data/database.json`.

## 3. Events

An **Event** component holds **states** (RPG Maker calls them pages). The active state is the *last* state whose
conditions all hold. A state has: conditions, a trigger, optional appearance override, and a **node graph**
(`graph`) that runs when it is triggered.

* Triggers: `action`, `playerTouch`, `eventTouch`, `autorun`, `parallel`.
* Conditions: `switch`, `variable`, `stage`, `selfSwitch`, `hasItem`. A `stage` condition compares the stage's current value with
  another value of the same stage by the ORDER of the stage's values (`>=` "Found" holds from Found onwards).
* Targets (`CommandTarget`): `'self'`, `'player'` or `{ entity: <editor id> }`.
* The graph (schemaVersion 4): `EventGraph { nodes, frames }`. A node is `{ id, type, params, out, x, y }`: a
  command from the catalog (or the structural `start` / `end` / `junction`), its canvas position, and `out`, a map
  from output port to the id of the next node. Every graph has exactly one `start`; a port with no wire ends the
  run. `conditional` has ports `then` / `else`, `showChoices` one port per option (+ `cancel`), `branchStage` one per
  chosen stage value (+ `default`); every other command has a single `next` port. A loop is a wire back to an
  earlier node (validation rejects a loop that never waits). `frames` are comment boxes, ignored by the game.
  Before schemaVersion 4 a state stored a command TREE (`commands`, with nested `branches`); it is converted on
  load (`commandsToGraph`, node ids = old command ids). See `docs/event-graph-spec.md`.
* Global state lives in `project/database.json` (version 2): **switches** (on/off), **variables** (numbers) and
  **stages** (progress through an ordered list of named values, e.g. Not started → Accepted → Found → Done; prefer a
  stage over several switches that must be set in order). Entries have stable ids, editable names and an optional
  `folder` path (`"Quests/Lost cat"`) that groups them in the Database panel and the pickers. Version 1 files load
  as version 2 with no stages. **Local flags** (the old self switches) belong to one event; their name is any
  non-empty text (`A`–`D` are the quick picks), stored per `mapId/entityId/name`.
* The Database panel shows where every flag is used and whether it is read or changed there, and flags the two
  usual mistakes: **never set** (something reads it, nothing changes it) and **never read**.

### Command catalog (type → params). `●` implemented in the game now, `○` planned (authorable; the game
logs and skips it until the system exists)

**Dialogue**
* ● `showText` {speaker?, text} — dialogue box; waits for the player.
* ● `showChoices` {options: [{id, label}], cancel: 'none'|'last'|'branch'} — branches per option (+ `cancel`).

**Flow**
* ● `conditional` {conditions: Condition[]} — branches `then`, `else`.
* ● `branchStage` {id, cases: valueId[]} — one branch per listed value of the stage, plus `default`.
* ○ legacy tree commands `loop` / `breakLoop` / `exitEvent`: only exist in old command trees and are converted by `commandsToGraph` (a wire back, a wire out of the cycle, an `end` node); graphs cannot contain them.
* ● `wait` {ms}; ● `comment` {text}.
* ● `callCommonEvent` {id} — runs a common event (`project/common/<id>.json`, `{ version: 1, id, name, folder?, graph }`) with the same self and local flags; its `end` returns to the caller; nesting is limited to 16 and call cycles are validation errors (`common-cycle`). The sync writes them to `data/common.json`.

**State**
* ● `setSwitch` {id, value}; ● `setVariable` {id, op: set|add|sub|mul|div|mod, operand: const|variable|random};
* ● `setStage` {id, mode: set|advance, value} — `advance` moves to the next value (the last value stays last).
* ● `setSelfSwitch` {key, value}.

**Character**
* ● `setFacing` {target, facing}; ● `moveRoute` {target, steps[], wait} (steps: up/down/left/right/forward/
  back/turn/wait/speed); ● `setVisible` {target, visible}; ● `changeSprite` {target, asset, animation?, persist?: state|map|forever};
* ● `playAnimation` {target, animation, speed?, wait?, then?}; ● `stopAnimation` {target}; ● `setAnimationSpeed` {target, value, mode, clip?};
  ● `setMoveSpeed` {target, speed}; ● `faceTowards` {target, other}.

**Map / screen**
* ● `warp` {map, x, y, facing?, fade}; ● `fadeScreen` {mode: in|out, ms}; ● `shakeScreen` {power, ms};
* ○ `tintScreen`, ○ `setWeather`.

**Audio**
* ○ `playSound` {sound}; ○ `playMusic` {track, fadeMs}; ○ `stopMusic` {fadeMs}.

**RPG**
* ● `giveItem` {item, qty}; ● `removeItem`; ○ `givePokemon` {species, level}; ○ `healParty`;
* ○ `startBattle` {kind: trainer|wild, id}; ○ `openShop` {items[]}; ○ `startQuest` / `completeQuest`.

**Advanced**
* ● `emit` {event, payload?} — fires a custom EventBus event (replaces the old `eventKey`);
* ○ `runScript` {code}.

Parameter details as built (`shared/engine/commands.ts` is authoritative):
* `showChoices.options` is `{ id, label }[]` (default Yes/No); a branch exists per option id, and a `cancel` branch only
  while `cancel` is `'branch'`. Changing options keeps old branches (reported as `orphan-branch` warnings) so no commands
  are lost silently.
* `setVariable`: `id`, `op`, `operand`, plus `value` (const), `sourceId` (variable) or `min`/`max` (random).
* `warp`: `map`, `x`, `y` (tile coordinates), `facing` (`''` = keep), `fade`. `moveRoute.steps` is `{ type, value? }[]`
  (`turn` takes a facing, `wait` ms, `speed` px/s). `conditional.conditions` is a `Condition[]`.
* Validation (`validateGraph`; `validateCommands` remains only for un-migrated command trees): unknown commands, wrong types, dangling switch/variable/map/sprite/entity references
  (only when the id lists are given), `breakLoop` outside a loop, empty/duplicate choices and duplicate ids are errors; unset
  required parameters (a warp without map yet) are warnings, so freshly placed prefabs validate.

Game implementation notes (where the runtime is more specific than the catalog; details in [game-runtime.md](game-runtime.md)):
* `setVariable`: `div` is an integer division (truncated), `div`/`mod` by zero leave the variable unchanged; `random` is an inclusive integer.
* `showChoices` with `cancel: 'none'` offers no cancel; `last` picks the last option; `branch` runs the `cancel` branch.
* `giveItem` / `removeItem` run against an in-memory inventory (`hasItem` reads it); all other
  planned commands log one warning per type and are skipped.
* `moveRoute`: blocked steps are skipped; `wait` false lets the route outlive the event; `speed` persists; `back` also turns the character.
* `warp`: same map = teleport (no reload); other map = load it, which cancels every running event (commands after the warp do not run). A fade
  is faded back in on the new map. Unknown maps are skipped with a warning.
* An event with no active state is hidden and not solid. State overrides are applied when the active state changes, so a `changeSprite` lasts until then.
* Trigger rules (`action` lookup order, `playerTouch` on step end/bump, `autorun` restarts, `parallel` cancellation) are listed in game-runtime.md.

Defaults for convenience (prefabs, `shared/engine/prefabs.ts`): NPC (wanders optionally, one action state with `showText`), Sign,
Chest (two states + self switch A), Door/Warp (`playerTouch` + `warp`), Trigger Zone (non-solid `playerTouch`),
Item Ball (`giveItem`, then hidden by state 2), Trainer (placeholder `startBattle`). Prefabs use the sprite assets
`characters/player`, `objects/sign`, `objects/chest` (frame 1 = open) and `objects/item-ball`; without those assets the
entity simply has no graphic until one is picked. `instantiatePrefab(prefab, { x, y })` gives fresh entity/state/command ids.

## 4. Editor UX principles
* Every placed thing is visible and legible on the canvas: real sprite preview, a clear footprint
  (collider) outline, a label on hover/selection, an icon badge for entities with an Event or Movement,
  distinct colours for solid colliders vs trigger zones, handles only on the selected entity.
* Everything snaps to the 32px grid by default; collider handles snap to 4px steps (Shift = free).
* Inspector = one card per component with a coloured header, consistent 8px spacing scale, schema-driven
  fields, and *custom editors* where a form is not enough: Sprite (asset picker + live preview + animation
  playback + pivot/offset gizmo), Collider (mini diagram + Fit buttons), Movement (controller-dependent
  fields), Event (states + command list).
* Switches/variables are managed in a Database panel and picked by name everywhere.
* All editing goes through the existing pure state layer (history/undo, autosave); nothing writes files
  directly from components.

## 5. Where things live
* `shared/engine/*` — `types` (contract), `components` (schemas, defaults, `normalizeProps`), `commands` (catalog, tree
  helpers, validation), `migrate`, `validate`, `sprites`, `database`, `prefabs`, `ids`, `constants`; `index.ts` re-exports
  everything and loads under plain Node (type stripping) as well as Vite/tsc. `shared/mapSchema.ts` validates entities
  through it (legacy maps are migrated first and only warned about) and `shared/mapExport.ts` migrates on export.
* `editor/src/lib/componentRegistry.ts` — thin adapter over `shared/engine/components`.
* `editor/src/components/editor/inspector/customEditors.tsx` — registry of custom component editors.
* `game/src/ecs/*` — runtime; `expand.ts` expands editor components into runtime components (see [game-runtime.md](game-runtime.md)).
* `game/src/events/*` — event runtime (interpreter, state selection, state, triggers).
* `scripts/sync-assets.mjs`, `scripts/export-maps.mjs` — project → game pipelines.
