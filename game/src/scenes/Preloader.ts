import { Scene } from "phaser";
import { AnimationManager, MovementType } from "../utils/AnimationManager";

const PLAYER_KEY = "player";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {
    this.cameras.main.setBackgroundColor(0xffffff);
  }

  preload() {
    this.load.setPath("assets");

    // UI & Effect Assets
    this.load.image("logo", "logo.png");
    this.load.image("star", "star.png");

    // Player Assets (32x48 sprites in 4x4 grids)
    this.load.spritesheet(`${PLAYER_KEY}-walk`, "player/walk.png", {
      frameWidth: 32,
      frameHeight: 48,
    });

    this.load.spritesheet(`${PLAYER_KEY}-run`, "player/run.png", {
      frameWidth: 32,
      frameHeight: 48,
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
