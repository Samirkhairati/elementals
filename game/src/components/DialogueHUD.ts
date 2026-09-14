import { Scene, GameObjects } from "phaser";
import { EventBus, Events } from "@/utils/EventBus";

export class DialogueHUD {
  private scene: Scene;
  private container: GameObjects.Container;
  private textObject: GameObjects.BitmapText;
  private background: GameObjects.Graphics;
  private hitZone: GameObjects.Zone;
  
  public isVisible: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
    
    // Create UI elements
    this.container = this.scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(1000); // Very high depth so it sits above everything
    
    // Full screen hit zone to intercept clicks when dialogue is open
    this.hitZone = this.scene.add.zone(0, 0, this.scene.scale.width, this.scene.scale.height);
    this.hitZone.setOrigin(0, 0);
    this.hitZone.setInteractive();
    this.hitZone.on('pointerdown', () => {
      if (this.isVisible) {
        EventBus.emit(Events.DIALOGUE_CLOSED);
      }
    });
    this.container.add(this.hitZone);

    // Background box
    this.background = this.scene.add.graphics();
    this.container.add(this.background);
    
    // Text
    this.textObject = this.scene.add.bitmapText(0, 0, 'PokemonFont', "", 72);
    this.container.add(this.textObject);
    
    this.container.setVisible(false);
    this.resize();

    // Handle resize
    this.scene.scale.on('resize', this.resize, this);
  }

  public show(message: string) {
    this.resize();
    this.isVisible = true;
    this.textObject.setText(message);
    this.container.setVisible(true);
  }

  public hide() {
    this.isVisible = false;
    this.container.setVisible(false);
  }

  private resize() {
    const { width, height } = this.scene.scale;
    
    // Update hit zone
    this.hitZone.setSize(width, height);

    // Max width of 1000px so it doesn't stretch infinitely on wide screens
    const boxWidth = Math.min(1000, width - 40);
    const boxHeight = 160;
    const boxX = (width - boxWidth) / 2;
    const boxY = height - boxHeight - 20;

    // Redraw background
    this.background.clear();
    this.background.fillStyle(0xffffff, 0.95);
    this.background.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, 8);
    this.background.lineStyle(3, 0x000000, 1);
    this.background.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, 8);

    // Position & constrain text
    this.textObject.setPosition(boxX + 20, boxY + 20);
    this.textObject.setMaxWidth(boxWidth - 40);
  }
}
