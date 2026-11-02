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
