import { Scene, GameObjects } from "phaser";
import { CONFIG } from "@/config";
import { EventBus, Events } from "@/utils/EventBus";

export class DialogueHUD {
  private scene: Scene;
  private container: GameObjects.Container;
  private textObject: GameObjects.Text;
  private background: GameObjects.Graphics;
  
  public isVisible: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
    
    // Create UI elements
    this.container = this.scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(1000); // Very high depth so it sits above everything
    
    // Background box
    this.background = this.scene.add.graphics();
    this.container.add(this.background);
    
    // Text
    this.textObject = this.scene.add.text(0, 0, "", {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        wordWrap: { width: CONFIG.width - 40, useAdvancedWrap: true }
    });
    this.container.add(this.textObject);
    
    this.container.setVisible(false);
    this.resize();

    // Handle resize
    this.scene.scale.on('resize', this.resize, this);
  }

  public show(message: string) {
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
    
    const boxWidth = width - 40;
    const boxHeight = 100;
    const boxX = 20;
    const boxY = height - boxHeight - 20;

    // Redraw background
    this.background.clear();
    this.background.fillStyle(0x000000, 0.8);
    this.background.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, 8);
    this.background.lineStyle(2, 0xffffff, 1);
    this.background.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, 8);

    // Position text
    this.textObject.setPosition(boxX + 15, boxY + 15);
  }
}
