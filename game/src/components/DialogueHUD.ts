import { Scene, GameObjects } from "phaser";
import { EventBus, Events } from "@/utils/EventBus";

export class DialogueHUD {
  private scene: Scene;
  private container: GameObjects.Container;
  private textObject: GameObjects.BitmapText;
  private promptText: GameObjects.BitmapText;
  private background: GameObjects.Graphics;
  private hitZone: GameObjects.Zone;
  private openTimestamp: number = 0;
  
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
      if (this.isVisible && Date.now() - this.openTimestamp > 150) {
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

    // Prompt text for dismiss
    this.promptText = this.scene.add.bitmapText(0, 0, 'PokemonFont', "* Tap or [Action] to close", 72);
    this.promptText.setAlpha(0.7);
    this.container.add(this.promptText);
    
    this.container.setVisible(false);
    this.resize();

    // Handle resize
    this.scene.scale.on('resize', this.resize, this);
  }

  public show(message: string) {
    this.openTimestamp = Date.now();
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

    // Box dimensions
    const boxWidth = Math.min(1000, width - 40);
    const boxHeight = 170;
    const boxX = (width - boxWidth) / 2;
    const boxY = height - boxHeight - 20;

    // Redraw background
    this.background.clear();
    this.background.fillStyle(0xffffff, 0.96);
    this.background.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, 10);
    this.background.lineStyle(3, 0x000000, 1);
    this.background.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, 10);

    // Position & constrain main message
    this.textObject.setPosition(boxX + 24, boxY + 20);
    this.textObject.setMaxWidth(boxWidth - 48);

    // Position prompt at bottom right of the box
    this.promptText.setPosition(boxX + boxWidth - this.promptText.width - 24, boxY + boxHeight - 32);
  }
}
