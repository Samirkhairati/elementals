import { Scene, GameObjects, type Types } from "phaser";
import { CONFIG } from "../config";

export class Player extends GameObjects.Sprite {
  private cursors: Types.Input.Keyboard.CursorKeys;
  private isMoving: boolean = false;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, "player");

    scene.add.existing(this);
    this.setOrigin(0.5, 1);

    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  update() {
    // Only handle input if we aren't currently middle-tween
    if (!this.isMoving) {
      this.handleInput();
    }
  }

  private handleInput() {
    const { tileSize, playerSpeed } = CONFIG;
    let direction = { x: 0, y: 0 };

    if (this.cursors.left.isDown) {
      direction.x = -1;
    } else if (this.cursors.right.isDown) {
      direction.x = 1;
    } else if (this.cursors.up.isDown) {
      direction.y = -1;
    } else if (this.cursors.down.isDown) {
      direction.y = 1;
    }

    if (direction.x !== 0 || direction.y !== 0) {
      const nextX = this.x + direction.x * tileSize;
      const nextY = this.y + direction.y * tileSize;

      // Check if within bounds
      if (
        nextX >= 0 &&
        nextX <= CONFIG.width &&
        nextY >= CONFIG.tileSize &&
        nextY <= CONFIG.height
      ) {
        this.isMoving = true;

        // Use built-in Tween for movement
        this.scene.tweens.add({
          targets: this,
          x: nextX,
          y: nextY,
          duration: (tileSize / playerSpeed) * 1000,
          onComplete: () => {
            this.isMoving = false;
            // Check immediately if another key is held for fluid motion
            this.handleInput();
          },
        });
      }
    }
  }

  getGridPosition() {
    return {
      x: Math.floor(this.x / CONFIG.tileSize),
      y: Math.floor((this.y - CONFIG.tileSize) / CONFIG.tileSize),
    };
  }
}
