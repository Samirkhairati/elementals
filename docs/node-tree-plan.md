# One node tree for maps: migration plan

Status: **phases 1–4 implemented on `feat/node-tree`, and the tree is fully node based (schema 7)**: see "Implementation decisions" and "Schema 7: Godot-style nodes" at the end, which win where they differ from the text above (the later section wins over the earlier). Phase 5 (generalised properties) and phase 6 (game node paths) are not started. Goal: replace the map's mix of layers, folders, picture groups, the
Entities row, entity folders and collision items with **one tree of nodes**, the way Godot's scene tree works. Every
node type gets the same treatment: one row, one menu, one inspector, one selection, and the same inherited properties.

## Why

A map holds seven kinds of container today, each with its own rules:

| Container | Where it lives | Nesting | Its code |
|---|---|---|---|
| Layer (tile, image, collision, terrain, encounters, objects) | `map.layers[]` (flat, top first) | in one folder | `useLayerManager`, `layerOrder.ts` |
| Folder | a `folder` layer + `folderId` on the layers below it | one level, layers only | `layerFolders.ts` |
| Picture | `layer.images[]` | in one picture group | `useImageItems`, `imageLayerEdit.ts` |
| Picture group | `layer.groups[]` + `groupId` on pictures | one level, pictures only | `imageGroups.ts` |
| Entities row | `map.entitiesIndex` (a position among the layers) | — | `entityDepth.ts` |
| Entity, entity folder | `map.entities[]`, `map.entityFolders[]` + `folder` | one level, entities only | `useEntityManager`, `EntityTree.tsx` |
| Collision item | `layer.tileGroups[]`, `layer.shapes[]` | none | `collisionLayers.ts`, `CollisionPanel.tsx` |

The properties are not the same everywhere, and neither are the menus. For example:

* Eye and lock exist on layers, folders, picture groups, entities and entity folders. Pictures and collision items have neither.
* Y-sort lives on image layers, folders, picture groups and pictures.
* A look lives on the map, tile and image layers, and pictures. Groups and entities have none.
* The drop shadow follows the look.
* Opacity exists only on pictures. `z` exists on layers and pictures.
* Each container has its own rename, copy and paste, drag and drop, and right-click menu.
* There are five panels that list things: Layers, Entities (inside Layers), Images, Collision and Properties.

The result is that the same idea works differently depending on what you click, and every new feature has to be added in
several places. Drop shadows are a recent example: they needed entries in three menus.

## Target model

```
Map (root: size, settings, look)
├─ Group "Town"                    ← replaces folders, picture groups and entity folders; nests freely
│  ├─ TileLayer "Ground"
│  ├─ Group "Trees"   (y-sort, shadow)
│  │  ├─ Picture "Oak"
│  │  └─ Picture "Pine"
│  ├─ Entity "Shopkeeper"           ← entities sit wherever they draw; no Entities row
│  └─ CollisionLayer "Walls"
│     ├─ CollisionTiles "Houses"
│     └─ CollisionShape "Fence"
├─ Terrain                          (one per map)
└─ Encounters                       (one per map)
```

**Node** (in `shared/sceneTree.ts`, pure). Every node has:

* `id`, `type`, `name`, `children[]`
* `visible?`, `locked?`
* `props` that depend on its type

Each node type is declared once, in a table like the component registry (`NODE_TYPES`). The table gives:

* label, icon and accent colour
* which children the type may hold (a TileLayer holds none; a Group holds anything; a CollisionLayer holds collision items)
* its property schema, which the inspector builds its form from (the same pattern as `shared/gameSettings.ts`)
* which common sections apply to it
* its menu actions

**Common sections.** These are shared by every drawable node, and each is written once:

| Section | Properties | How it inherits |
|---|---|---|
| Node | name, visible, locked | Visibility and lock: the node is hidden or locked if any ancestor is (Godot) |
| Drawing | opacity, `z` (game depth), y-sort | Opacity multiplies down the tree. `z`: the nearest set value. Y-sort: the nearest set value (as folders do today) |
| Look | `look` (grade, masks, shaders), `shadow` | Look: a stack of all ancestors' looks, inner first (today's picture → layer rule, generalised). Shadow: the nearest one; `off` stops it |
| Transform (later) | offset of a Group | Adds up down the tree (Godot's `position`) |

**Draw order is tree order.** The canvas walks the tree depth first. Entities draw where they sit in the tree, so the
Entities row and `entitiesIndex` go away. Grid, handles and entity areas stay on the overlay, as now.

**One selection.** The selection is a set of node ids across all types. The inspector shows the sections those nodes
share, and editing changes all of them (the way the Look panel edits one subject today).

**One row, one menu.** `SceneTree.tsx` draws every row with the same component: icon, name, badges, eye and lock.

The right-click menu comes from an action registry (`nodeActions.ts`). Each action declares which node types it
applies to, and the same registry serves the canvas menu. It covers:

* Add child (from the type table)
* Group selection
* Copy, paste and duplicate
* Rename
* Y-sort
* Add drop shadow
* Export
* Delete (destructive)

The Images and Collision panels become the inspectors of a picture node and a collision node. Their tools (crop, the
tiles/shape brush) remain as sections of those inspectors.

## Storage and export

* **Map file:** maps move to schema version 6, which adds `nodes: Node[]` (the root's children) in place of `layers`,
  `entities`, `entityFolders` and `entitiesIndex`.
* **Migration:** `migrateToNodeTree` in `shared/engine/migrate.ts` converts v5 to v6. Like every migration, it is pure and
  idempotent, and runs on load. It converts:
  * folders and their `folderId` layers → Groups
  * pictures → Picture children
  * picture groups → Groups
  * entity folders → Groups
  * entities → a Group named "Entities", placed where `entitiesIndex` was, so nothing moves on screen
  * `tileGroups` and `shapes` → collision children

  Nothing is written back until the author edits.
* **Export:** the exporter walks the tree and writes the same flat Tiled output as today. Tile layers in draw order;
  `kind=image` object groups holding pictures, with each picture's inherited look, shadow, opacity and y-sort folded in;
  the collision layer; the `entities` array. **The game does not change in this migration.** A golden test exports
  every map in `project/maps` before and after, and the two outputs must match byte for byte.
* **Later:** Tiled group layers (Phaser flattens them) could carry group offsets and group looks into the game.
  That is a separate decision.

## Phases

Each phase can ship on its own and ends with `npm run verify` and a look in the harness.

1. **Model and operations (no UI change).** Add these to `shared/sceneTree.ts`, with tests:
   * the node types and the `NODE_TYPES` table
   * the pure operations: walk, find, ancestors, insert, move, reparent with the rules (`canHold`), remove, duplicate
     with new ids
   * `inherited(node, key)` for the common sections

   Also add `mapToTree` and `treeToMap` for v5 maps, and round-trip tests over `project/maps`.
2. **Scene panel, read and select.** `SceneTree.tsx` shows the tree built from the current map (`mapToTree`), behind
   a setting, beside the old panels. It covers selection, eye and lock, open and close, and the shared menu with the
   actions that already exist. One menu registry replaces the five menu builders as they move over.
3. **Tree as the editor's source of truth.**
   * `useLayerManager`, `useImageItems` and `useEntityManager` become thin wrappers over tree operations
     (`useSceneTree`).
   * The history snapshots the tree.
   * The canvas renders by walking the tree: one `drawNode` per type. The tile, picture, shadow and look code from
     `KonvaTilemapLayer` moves in unchanged.
   * Drag and drop works between any nodes the rules allow.
4. **Storage v6.** Add the migration, save `nodes`, make the exporter walk the tree, and add the golden export test.
   Remove `layerFolders.ts`, `imageGroups.ts`, entity folders, `entitiesIndex`, and the separate row components.
5. **Generalised properties.**
   * Opacity, `z`, y-sort, look and shadow on every drawable node, resolved through `inherited` (one resolver
     replaces `inheritedLayerYSort`, `inheritedItemYSort`, `shadowFor` and `pictureStack`).
   * The inspector is built from the schemas.
   * Groups nest without a depth limit.
   * Group offset.
6. **Game (optional).** Node paths for events (`Town/Trees/Oak`: show, hide or move a group from an event). Group
   looks as one pass per group instead of being folded into each picture.

## Risks and how to handle them

* **Moving existing data:** the migration must not move anything on screen. Phase 4 ships only with the golden export
  test passing. Migrated maps also get a pixel test of the editor canvas, using `drawMapScenery` on the old and the new
  model.
* **Performance:** the canvas walks the tree on every draw. Flatten the tree once per change (memoised by the tree's
  identity), not once per frame. The per-layer caches (looks, shadows) are keyed by node id and keep working.
* **Undo history size:** snapshots of a whole tree are the same size as today's (`layers` + `entities`). Nothing new.
* **Saved dock layouts:** the `images` and `collision` panels close on load, as the retired `entities` panel does today.
* **Muscle memory:** keep today's shortcuts (`layer.new`, `layer.newFolder` → New Group) and the order in which the panel
  lists things.

## Decisions to make before phase 2

1. **List order.** Today the top row is drawn on top, like Photoshop. Godot draws the first child first, which puts the
   top row at the back. Recommendation: keep the current order. Only the panel shows it differently from Godot; the data
   is stored in draw order.
2. **Entities in groups.** Should an entity be allowed in any group, so that it draws there, or only in entity groups
   (gameplay grouping only)? Recommendation: any group. This is the point of the change.
3. **Terrain and encounters.** Keep them as one-per-map nodes, or turn them into properties of the map root?
   Recommendation: nodes, so they get the eye, lock and order like everything else.

## Implementation decisions (feat/node-tree)

The three questions above are settled with the recommendations: the panel keeps today's order (top row drawn on top),
entities may sit in any group, terrain and encounters are one-per-map nodes. Where this section differs from the text
above, this section wins.

### Node shape

* Fields live **on the node** (a discriminated union on `type`), not in a `props` bag, so a tile node is shaped like
  today's tile layer (`data`, `z`, `look`) and paint code keeps working on it.
* Common to every node: `id`, `type`, `name`, `visible?` (absent = shown), `locked?`. Containers also have
  `children: SceneNode[]` and `collapsed?` (list view state, not an undo step, as folders today).
* Children are stored **in draw order: the first child draws first** (at the back). The panel lists a container's
  children last-first, so the top row is the one drawn on top, exactly as the layer list is today.
* Types (`SceneNodeType`):

| type | holds | own fields |
|---|---|---|
| `group` | anything its place allows (see rules) | `ySort?`, later `opacity?`, `look?` |
| `tile` | — | `data`, `z?`, `look?` |
| `image` (image layer) | `picture`, `group` | `z?`, `ySort?`, `look?` |
| `picture` | — | today's image item fields: `assetId?` / `graphicId?`, `crop?`, `x`, `y`, `z?`, `scale?`, `flipX?`, `flipY?`, `opacity?`, `ySort?`, `look?` |
| `collision` | `collisionTiles`, `collisionShape` | `data` (cells, `group` = a `collisionTiles` id, as today), `z?` |
| `collisionTiles` | — | (its cells are the parent's `data` cells whose `group` is its id) |
| `collisionShape` | — | today's `CollisionShape` fields (`points`, `closed`, ...) |
| `terrain`, `encounters` | — | `data`, `z?` (one of each per map) |
| `objects` | — | `data`, `z?` (kept for old maps) |
| `entity` | — | `x`, `y`, `components` (the node id is the entity id; `visible` is the node's) |

* **Image layers stay a node type.** Pictures only live inside an image layer (directly or in groups below it); a group
  inside an image layer holds only pictures and groups. This keeps the export (one `kind=image` object group per image
  layer) and the game unchanged.
* **Placement rules** (`canHold(parentPath, childType)`): root and groups that are not inside an image or collision
  layer hold every type but `picture`, `collisionTiles` and `collisionShape`; an image layer (and groups below it) hold
  `picture` and `group`; a collision layer holds `collisionTiles` and `collisionShape`; leaves hold nothing; at most one
  `terrain` and one `encounters` per map.
* The map root is the map itself: `map.nodes` are its children; the map keeps `name`, size, `settings`, `look`.

### Storage

* `SCHEMA_VERSION` becomes 6. A v6 map has `nodes` and no `layers`, `entities`, `entityFolders`, `entitiesIndex`.
* `migrateToNodeTree` (pure, idempotent, deterministic ids for anything it creates) converts v5 and older:
  layers (top first) become root nodes in draw order (reversed); a folder becomes a group holding its `folderId`
  layers; an image layer's `images` become `picture` children and its `groups` become groups holding their members
  (a group sits where its first member was in draw order; empty groups go to the front); collision `tileGroups` and
  `shapes` become children; all entities go into one group named "Entities" placed so that `entitiesIndex` layers are
  above it (missing = on top); entity folders become groups inside it (`expanded: false` = collapsed), in the old
  entity order. The editor-only entity field `folder` is dropped.
* The exporter walks the tree and writes the same Tiled JSON as before: inherited visibility and y-sort folded into
  each exported layer / picture. A golden test exports every map in `project/maps` and `shared/fixtures` through the
  v5 exporter (fixtures captured before the change) and through migration + the new exporter: the outputs must be
  equal except the stamped `schemaVersion` (5 → 6) and the dropped editor-only `folder` key of entities.

### Editor

* `MapData.nodes` is the source of truth; managers, history snapshots, autosave and the canvas work on it.
  Flat read-only views (all entities, the layer nodes in list order, all pictures of an image layer) are derived and
  memoised by the tree's identity, never stored.
* The canvas walks the tree: tile, image and collision layers draw as today, entity sprites draw where the entity sits
  in the tree (a run of neighbouring entities is sorted among itself as the Entities row sorts today).
* One Scene panel (`SceneTree.tsx`) replaces the Layers list, the Entities rows and the picture/collision item lists;
  the Images and Collision panels keep their tools as the inspectors of the selected picture / collision node.
* Old saved dock layouts: `images` / `collision` list panels that no longer exist close on load, like `entities` today.

## Schema 7: Godot-style nodes

Schema 6 kept image layers and entity component bags. Schema 7 (`SCHEMA_VERSION = 7`) makes everything a node, named
after Godot's types (the `type` keys stay short; the labels and lucide icons are `NODE_TYPES` in `shared/sceneTree.ts`):

| type | label | holds | notes |
|---|---|---|---|
| `group` | Node2D | scene nodes, `picture`, one `look` | `z`, `opacity`, `pickAsOne` (picked and dragged as one) pass down |
| `ySort` | YSort | as Node2D | everything below it draws sorted by its feet among the characters |
| `tile` | TileMap | one `look` | `data`, `z` |
| `terrain`, `encounters`, `objects` | unchanged | — | terrain and encounters one per map |
| `picture` | Sprite2D | one `look` | a sprite inside a sprite is refused; only inside a Node2D / YSort, never at the root |
| `look` | Look | — | the colour grading and drop shadow of its parent (`look` field) |
| `collision` | StaticBody2D (map) | `collisionTiles`, `collisionShape` | the map's collision, as before |
| `entity` | Entity | its component nodes | keeps `x`, `y` and its `Transform` / `Tag` (and unknown components) in `components` |
| `animatedSprite` | AnimatedSprite2D | — | the `Sprite` component (`props`; the eye is `Sprite.visible`) |
| `body` | StaticBody2D (entity) | one `collisionShape` | the solid `Collider` (no shape = one tile) |
| `area` | Area2D | one `collisionShape` | where events trigger: the `Area` component next to a body, else a non-solid `Collider` |
| `wander`, `playerController`, `mover` | movement | — | the `Movement` component (`controller` wander / player / none); one per entity |
| `event` | Event | — | the `Event` component (states and graphs) |

* **Placement** is `childTypesOf` + slots (`canHold`, `canPlace`): one Look per node, one of each component and one
  movement node per entity, one shape per body or area. The Add Node menu, paste, drag and drop and the importers all
  go through it, so a tree that breaks the rules cannot be built.
* **Entities**: `shared/sceneEntity.ts` maps an entity node to its bag of components (`componentsOfEntity`, cached per
  node) and writes a bag back (`entityWithComponents`, which keeps unchanged child nodes and returns the same node when
  nothing changed). The game, the exporter and the database read `engineEntityOf(node)`; the editor's entity code reads
  `entityView(node)` (`editor/src/lib/sceneIndex.ts`). New ECS component **Area** (`game/src/ecs/components/AreaComponent.ts`):
  `triggerArea` (`game/src/events/footprint.ts`) uses it before the Collider.
* **Sprites draw in runs**: `shared/sceneLayers.ts` lists the layers in draw order: layer nodes, plus each run of
  neighbouring Sprite2Ds of one host. A run exports as one Tiled `kind=image` objectgroup named after its host (what an
  image layer was). A Node2D / YSort with no z or Look of its own inside a branch that holds sprites itself stays in that
  branch's run (as a picture group stayed in its image layer's object group); a branch holding only other nodes is like
  a folder, each branch in it its own run; a YSort around one sprite counts as that sprite. So migrated maps export byte
  for byte as before (but for empty image layers, which became empty Node2Ds and export nothing). The canvas draws the
  same runs.
* **Migration** (`typedNodes` in `shared/sceneTreeMigrate.ts`, pure, idempotent, cached per array; run on load for
  schema 6 trees and after `migrateToNodeTree` for older maps): an image layer becomes a Node2D; a `look` field on a
  TileMap, Sprite2D or branch becomes a Look child (`<id>:look`); a locked picture group becomes `pickAsOne` (lock now
  always freezes); y-sort: a sorted branch becomes a YSort unless something below it opts out (`ySort: false`), in
  which case it stays a Node2D and its sorting children become YSorts; a sorted picture outside a YSort is wrapped in
  one (`<id>:ysort`); an entity's component bag is split into child nodes. The export is unchanged: the golden test
  compares every fixture byte for byte with the schema 5 output.
