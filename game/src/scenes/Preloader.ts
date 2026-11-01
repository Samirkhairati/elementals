import { Scene } from "phaser";
import { MAPS } from "@/constants/assets";
import { MANIFEST_KEYS, setGameCommonEvents, setGameDatabase, setGameTilesets } from "@/data/gameData";
import { spriteRegistry } from "@/data/spriteRegistry";
import { CharacterLoader } from "@/sprites/characterLoader";
import { phaserLoaderPort } from "@/sprites/phaserLoaderPort";
import { charactersForMap } from "@/sprites/preloadSets";
import { bootParams } from "@/core/bootParams";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {
    this.cameras.main.setBackgroundColor(0xffffff);
  }

  preload() {
    // Manifests (already in the cache, loaded by Boot)
    const loaded = spriteRegistry.load(this.cache.json.get(MANIFEST_KEYS.characters));
    for (const s of loaded.skipped) console.warn(`[Preloader] character "${s.id}" skipped: ${s.reason}`);
    if (loaded.loaded.length === 0) console.warn("[Preloader] no characters in data/characters.json (run `npm run assets:sync`)");
    setGameDatabase(this.cache.json.get(MANIFEST_KEYS.database));
    setGameCommonEvents(this.cache.json.get(MANIFEST_KEYS.common));
    const tilesets = setGameTilesets(this.cache.json.get(MANIFEST_KEYS.tilesets));

    this.load.on("loaderror", (file: { key: string; url: string }) => {
      console.error(`[Preloader] failed to load "${file.key}" (${file.url})`);
    });

    // Character sheets are not queued here: only the characters of the first map load before the game starts
    // (create below); the others load per map or when an event first swaps to them (CharacterLoader).
    this.load.setPath("");

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

  async create() {
    const requested = bootParams.map && MAPS.some((m) => m.key === bootParams.map) ? bootParams.map : undefined;
    const first = requested ?? MAPS[0].key;
    const raw = this.cache.tilemap.get(first)?.data;
    await new CharacterLoader(spriteRegistry, phaserLoaderPort(this)).ensure(charactersForMap(raw));
    this.scene.start("Game");
  }
}
