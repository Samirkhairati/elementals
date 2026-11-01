import { Scene } from "phaser";
import { MAPS } from "@/constants/assets";
import { MANIFEST_KEYS, setGameCommonEvents, setGameDatabase, setGameTilesets } from "@/data/gameData";
import { spriteRegistry } from "@/data/spriteRegistry";
import { createPlannedAnimations, planSpriteLoads, type SpriteLoadPlan } from "@/sprites/spritePlan";

export class Preloader extends Scene {
  private plan: SpriteLoadPlan = { sheets: [], animations: [], problems: [] };

  constructor() {
    super("Preloader");
  }

  init() {
    this.cameras.main.setBackgroundColor(0xffffff);
  }

  preload() {
    // Manifests (already in the cache, loaded by Boot)
    const loaded = spriteRegistry.load(this.cache.json.get(MANIFEST_KEYS.sprites));
    for (const s of loaded.skipped) console.warn(`[Preloader] sprite "${s.id}" skipped: ${s.reason}`);
    if (loaded.loaded.length === 0) console.warn("[Preloader] no sprite assets in data/sprites.json (run `npm run assets:sync`)");
    setGameDatabase(this.cache.json.get(MANIFEST_KEYS.database));
    setGameCommonEvents(this.cache.json.get(MANIFEST_KEYS.common));
    const tilesets = setGameTilesets(this.cache.json.get(MANIFEST_KEYS.tilesets));

    this.load.on("loaderror", (file: { key: string; url: string }) => {
      console.error(`[Preloader] failed to load "${file.key}" (${file.url})`);
    });

    // Sprite sheets: sprite:<id>:<role>
    this.load.setPath("");
    this.plan = planSpriteLoads(spriteRegistry.all());
    for (const problem of this.plan.problems) console.warn(`[Preloader] ${problem}`);
    for (const sheet of this.plan.sheets) {
      this.load.spritesheet(sheet.textureKey, sheet.url, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        margin: sheet.margin,
        spacing: sheet.spacing,
      });
    }

    // Tilesets (Tiled tileset name = texture key)
    for (const tileset of tilesets) this.load.image(tileset.name, tileset.file);

    // Fonts
    this.load.bitmapFont('PokemonFont', 'fonts/PokemonFont2.png', 'fonts/PokemonFont2.xml');

    // Maps
    this.load.setPath("data/maps");
    MAPS.forEach((map) => {
      this.load.tilemapTiledJSON(map.key, `${map.key}.json`);
    });
  }

  create() {
    createPlannedAnimations(this.anims, this.plan.animations);
    this.scene.start("Game");
  }
}
