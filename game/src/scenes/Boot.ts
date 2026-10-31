import { Scene } from "phaser";
import { MANIFEST_KEYS, MANIFEST_URLS } from "@/data/gameData";

export class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    // The Boot scene loads the generated manifests (written by `npm run assets:sync`); the Preloader
    // then queues every texture they describe.
    this.load.setPath("");
    this.load.json(MANIFEST_KEYS.sprites, MANIFEST_URLS.sprites);
    this.load.json(MANIFEST_KEYS.database, MANIFEST_URLS.database);
    this.load.json(MANIFEST_KEYS.tilesets, MANIFEST_URLS.tilesets);
    this.load.on("loaderror", (file: { key: string; url: string }) => {
      console.error(`[Boot] failed to load "${file.key}" (${file.url})`);
    });
  }

  create() {
    this.scene.start("Preloader");
  }
}
