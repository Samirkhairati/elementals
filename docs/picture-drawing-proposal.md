# Drawing pictures: everything, or only what is visible?

Status: **proposal, needs a decision** (issue #40). Nothing in this note is implemented. Numbers marked *measured* come from the project's
files; timings were **not** measured (no GPU in the automated environment), so the performance statements are reasoned from the code.

## What happens today

**Editor** (`components/editor/canvas/konva/KonvaTilemapLayer.tsx`): each visible image layer is one Konva `Shape`. Its `sceneFunc` runs on
every redraw (pan, zoom, drag) and, for every picture of the layer, sorts the list, resolves the picture and draws it with
`drawImage`. There is no check against the visible area and the sort happens on every redraw.

**Game** (`game/src/world/imageLayers.ts`): one Phaser `Image` per picture, one texture per *file* (crops are frames of it). Phaser skips
objects outside the camera when it builds the render list, so off-screen pictures cost no draw call. The cost that remains is loading:
`Preloader.loadPictures` loads the pictures of **every map** at boot, whether or not the player ever goes there (also noted in
`docs/future-issues.md`).

**Measured** (the city map, 4128 × 3872 px, 16 pictures): 4 files, 12.9 MB of GPU texture memory in total (the 1600 × 1600 pavement
alone is 9.8 MB; it is used twice and shared). Per-picture overhead is small; texture memory is what grows.

## Options

| | Editor | Game |
|---|---|---|
| **A. Do nothing** | fine up to a few hundred small pictures | fine; boot grows with the number of maps |
| **B. Cull by the camera** | skip pictures whose box is outside the visible area; cache the sorted list per layer (`useMemo` on `layer.images`) | already done by Phaser |
| **C. Load per map** | not needed | load a map's pictures when it is entered, release those no map in memory uses; `imagePictureIds(raw)` already lists what a map needs |
| **D. Bake static layers** | cache a layer that is not being edited to an offscreen canvas and blit it; invalidate on edit | not worth it before there are thousands of items |
| **E. Atlas the crops** | not needed (crops are frames of one decoded picture already) | only if draw calls become the bottleneck |

## Events must be able to change pictures and layers later

This is the requirement that shapes the design, and it argues *against* anything that bakes or merges pictures at export time:

- A picture needs a **stable key**, not only a generated id, so an event can name it: an optional `key` on the item (unique per map, e.g.
  `dam-wall-left`), shown in the Images panel and validated.
- The game keeps `key -> Phaser image` in `ImageLayerRenderer` (it already holds the objects) and layers get the same (`layerKey -> objects`).
- New event commands: *Show / Hide picture*, *Move picture*, *Change picture* (swap picture or crop), *Set picture opacity*, *Show / Hide layer*.
  They go through the command catalog like any other (`shared/engine/commands.ts` + a handler in `game/src/events/commands/`).
- Culling (B) and per-map loading (C) are compatible with this: a hidden or moved picture is just a property of an existing object.
  Option D is not, for layers events can change (the game would need to re-bake), so it stays editor-only.

## Recommendation

1. **B in the editor now**: cull to the viewport and memoize the sorted list. Small change, removes the only avoidable per-frame cost.
2. **C in the game when there is a second large map**: it is already listed in `docs/future-issues.md`; the data to do it exists.
3. **Add the `key` and the picture commands together**, as the first step of "events change pictures", so nothing built now has to be
   redone. Do not bake or merge pictures in the export.
4. Skip D and E until a measurement shows draw time or draw calls, not memory, is the problem.

## Before building

Measure first, in a browser with a GPU: a stress map with a few hundred pictures (the city pictures repeated), frame time while panning in the
editor and while walking in the game, with and without culling. That decides whether B is urgent or only tidy.

## Decisions needed

1. Approve B now, C later, and the `key` + commands as the way events reach pictures?
2. Should layers be addressable by event commands too (same `key` idea), or only individual pictures?
3. Is a stress map and a measurement pass wanted before any of this, or is B small enough to just do?
