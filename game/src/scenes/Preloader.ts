import { Scene } from "phaser";
import { AnimationManager, MovementType } from "@/utils/AnimationManager";
import { TILESETS, MAPS } from "@/constants/assets";

const PLAYER_KEY = "player";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {
    this.cameras.main.setBackgroundColor(0xffffff);
  }

  preload() {
    this.load.setPath("graphics");

    // Player Assets
    this.load.spritesheet(`${PLAYER_KEY}-walk`, "player/walk.png", {
      frameWidth: 32,
      frameHeight: 48,
    });

    this.load.spritesheet(`${PLAYER_KEY}-run`, "player/run.png", {
      frameWidth: 32,
      frameHeight: 48,
    });

    // Load all Tilesets
    this.load.setPath("graphics/tilesets");
    TILESETS.forEach((key) => {
      this.load.image(key, `${key}.png`);
    });

    // Reset path for fonts
    this.load.setPath("");
    this.load.bitmapFont('PokemonFont', 'fonts/PokemonFont2.png', 'fonts/PokemonFont2.xml');

    // Load all Maps
    this.load.setPath("data/maps");
    MAPS.forEach((map) => {
      this.load.tilemapTiledJSON(map.key, `${map.key}.json`);
    });
  }

  create() {
    this.initializeAnimations();
    this.scene.start("Game");
  }

  private initializeAnimations() {
    const animManager = AnimationManager.getInstance(this);

    // Order matters for idle: WALK spritesheet frames 0/4/8/12 will be used for idle poses
    animManager.createCharacterAnimations(
      PLAYER_KEY,
      MovementType.WALK,
      `${PLAYER_KEY}-walk`,
    );
    animManager.createCharacterAnimations(
      PLAYER_KEY,
      MovementType.RUN,
      `${PLAYER_KEY}-run`,
    );
  }
}
