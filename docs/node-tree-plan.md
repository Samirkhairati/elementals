# One node tree for maps: migration plan

Status: **plan, nothing implemented yet**. Goal: replace the map's mix of layers, folders, picture groups, the
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
