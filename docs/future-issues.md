# Future issues

Things that work today but will need attention later. Add an entry whenever you notice one (what, why it is fine now, when it stops being fine, the fix idea), and remove it once it is done.

## Every map's pictures load at boot

- **What:** `game/src/scenes/Preloader.ts` (`loadPictures`) queues the picture texture of every map's image layers before the game starts, not per map.
- **Fine now:** a handful of small pictures; boot cost is negligible.
- **Stops being fine:** many maps with large pictures (long boot, memory held for maps the player never visits).
- **Idea:** load a map's pictures when it is entered (or on warp, like `charactersForMap` does for sprites) and unload the ones no longer used. `imagePictureIds(rawMapData)` already lists what a map needs.

## Sprite items on image layers are still frames

- **What:** a sprite placed on an image layer shows the character's static frame, in the editor and in the game.
- **Idea:** let an item pick an animation and play it in both places (the game side would use the sprite registry's animations).

## The game canvas ignores the screen's pixel density

- **What:** Phaser runs in `RESIZE` mode with a canvas of CSS pixels, so on a retina display the browser upscales it 2x. Sub-pixel smoothness is limited to CSS pixels.
- **Fine now:** movement is steady and the picture is sharp enough at the default 32-tile view.
- **Stops being fine:** if motion should be as fine as the screen allows or text looks soft.
- **Idea:** size the canvas to `innerWidth * devicePixelRatio` and shrink it back with CSS (`Scale.zoom = 1 / dpr`), then include the ratio in the camera zoom in `Game.handleResize`.

## A picture that no map uses is not copied to the game

- **What:** `assets:sync` (and so the automatic sync after an import) copies only pictures that characters or image layers use, and removes copies nobody uses.
- **Fine now:** the game only ever needs the used ones.
- **Stops being fine:** if something should load a picture by id from an event (e.g. a "show picture" command): it would have to be added to the used set.

## One tile size for every map

- **What:** maps can be any size in pixels, but the tile grid is always 32 px (`TILE_SIZE` in shared/engine/constants.ts and the game's `GAME_CONSTANTS.TILE_SIZE`).
- **Fine now:** tilesets, collision, tile-based movement and entity anchors all assume 32.
- **Stops being fine:** if a map should use 16 px or 48 px tiles.
- **Idea:** a per-map `tileSize` read everywhere `TILE_SIZE` is used today (painting, tileset slicing, export `tilewidth`, collision, movement, anchors), with migration defaulting to 32.

## Tile layers cannot be y-sorted

- **What:** y-sort works on pictures (image layers, folders, groups, single pictures); a tile layer is one Phaser tilemap layer drawn at one depth.
- **Idea:** draw a y-sorted tile layer as one small tilemap per row (width x 1) at `sortDepth(playerZ, (row + 1) * 32)`, or move tall tile-built objects onto image layers.

## Open collision lines and AI / sight

- **What:** wander targets and the line-of-sight blocker (`Game.ts` `setSightBlocker`) only ask `isWalkable` for a point, so closed collision shapes count but open lines do not: a wanderer can pick a target behind a wall line (its steps are still blocked) and a trigger can see through one.
- **Idea:** give the sight blocker a segment query (`shapeCrossesPath` from the viewer to the cell) and let wander reject targets whose path crosses a shape.

## A mover's own polygon collider

- **What:** a polygon collider blocks other movers, but the entity's own movement still uses the fixed 16 × 4 feet box, and so does the player.
- **Idea:** sweep the mover's own collider (box or polygon) against shapes, if non-box movers ever matter.

## Warps: the debug handle and a walkable check

- **Game debug handle drives a private method**: the browser checks for warps call `scene.warpPlayer(...)` (private) through `window.__game`. A small public `warp()` on `GameDebugHandle` would let a test or script do it without reaching into the scene.
- **Previews of a map have no per-pixel hit test**: the warp picker's free position is any pixel, including ones inside a solid building. Nothing warns; a "walkable" overlay from the collision shapes would.

## Code health (from the November 2026 review)

The shared helpers listed under "Reuse before writing" in CLAUDE.md came out of this review. Its follow-up split
`useLayerManager` (pictures moved to `useImageItems`), removed the hand-kept deps array of the editor context, turned the
dock's per-panel placement code into a table, removed dead files and fixed every lint warning (lint now fails on warnings).
Left for later:

- **`PropBag` is `Record<string, any>`** (`editor/src/types/editor.ts`, behind an eslint-disable): component props in the
  inspector are untyped. Making it `Record<string, unknown>` touches most inspector editors; worth doing together with typed
  per-component props from `shared/engine/components.ts`.
- **Still-large modules:** `routes/editor.tsx` (~680 lines, mostly the context object), `panels/ImagesPanel.tsx` (~740: the
  rows' drag-and-drop could move to a hook), `panels/DatabasePanel.tsx` (~720: one section per database kind).

## Looks (colour grading)

- **Deleted profiles leave their looks behind**: deleting a profile only removes it from `project/looks.json`; maps keep
  `look.profiles[id]` (ignored, never shown). A cleanup across all maps (like `assetOps` does for renames) would drop them.
- **Renaming / deleting a shader does not update the looks that use it**: a look then shows "Missing: <id>" and the game
  skips it with a warning.
- **Editor map look grades the whole content canvas on every draw** (one GPU pass + copy back at device pixel ratio). Fine on
  laptops; on 4K screens while panning it may cost a few ms per frame. A cheaper path would grade only while idle.
- **Every slider tick re-bakes the LUT** (32³ colour evaluations per look strip, a few ms). Debouncing the bake during a
  drag (or a 16³ draft LUT) would make slow machines smoother.
- **Picture looks are cached per placement**: dragging a picture with its own look re-grades it every frame of the drag.
- **Look panel width**: the mask component rows and shader headers crowd below ~280px.
- **Game tile-layer shadows bake every chunk at map load** (a canvas blur per 16 × 16-tile chunk and profile shadow). Fine
  for town-sized maps; a very large map with soft layer shadows would want to bake chunks as the camera reaches them.
- **Shadow silhouettes are read with `getImageData`**: one small `drawnPixels` helper exists in both the editor
  (`lib/look/shadowDraw.ts`) and the game (`look/LookShadows.ts`) because `shared/` stays DOM-free.
