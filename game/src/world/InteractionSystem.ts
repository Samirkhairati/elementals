import { CONFIG } from "@/config";

export interface Interactable {
  x: number; // Tile X
  y: number; // Tile Y
  type: "on_interact" | "on_step";
  message?: string;
  eventKey?: string;
}

export class InteractionSystem {
  private interactables: Map<string, Interactable> = new Map();
  private scene: Phaser.Scene;
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public setMap(map: Phaser.Tilemaps.Tilemap) {
    this.interactables.clear();
    
    // Parse Tiled Object Layers
    const objectLayer = map.getObjectLayer("interactables");
    if (objectLayer && objectLayer.objects) {
      objectLayer.objects.forEach((obj) => {
        // Tiled objects coordinates are usually based on bottom-left or top-left depending on type.
        // For tile-aligned objects (e.g., standard rectangles placed on grid), x/y are top-left in pixels.
        if (obj.x !== undefined && obj.y !== undefined) {
          const tileX = Math.floor(obj.x / CONFIG.tileSize);
          const tileY = Math.floor(obj.y / CONFIG.tileSize);
          
          let message = "";
          let type: "on_interact" | "on_step" = "on_interact";
          let eventKey = "";
          
          if (obj.properties) {
            if (Array.isArray(obj.properties)) {
                obj.properties.forEach((prop: any) => {
                  if (prop.name === "message") message = prop.value;
                  if (prop.name === "type") type = prop.value as any;
                  if (prop.name === "eventKey") eventKey = prop.value;
                });
            } else {
                // Phaser sometimes parses it as a dictionary
                if (obj.properties.message !== undefined) message = obj.properties.message;
                if (obj.properties.type !== undefined) type = obj.properties.type;
                if (obj.properties.eventKey !== undefined) eventKey = obj.properties.eventKey;
            }
          }

          // If no message or event is set, we can just use the object name as a fallback message
          if (!message && !eventKey && obj.name) {
              message = obj.name;
          }

          this.registerInteractable({
            x: tileX,
            y: tileY,
            type,
            message,
            eventKey
          });
        }
      });
    }

    this.renderDebug();
  }

  public registerInteractable(interactable: Interactable) {
    const key = `${interactable.x},${interactable.y}`;
    this.interactables.set(key, interactable);
  }

  public getInteractableAt(tileX: number, tileY: number): Interactable | undefined {
    return this.interactables.get(`${tileX},${tileY}`);
  }

  private renderDebug() {
    if (this.debugGraphics) {
      this.debugGraphics.destroy();
    }

    if (!CONFIG.debug.enabled) return;

    this.debugGraphics = this.scene.add.graphics();
    this.debugGraphics.setDepth(101); // Above the debug grid

    const scaledTileSize = CONFIG.tileSize * CONFIG.renderScale;

    this.interactables.forEach((interactable) => {
      const px = interactable.x * scaledTileSize;
      const py = interactable.y * scaledTileSize;
      
      this.debugGraphics!.lineStyle(2, interactable.type === "on_interact" ? 0xffff00 : 0xff00ff, 0.8);
      this.debugGraphics!.strokeRect(px, py, scaledTileSize, scaledTileSize);
      this.debugGraphics!.fillStyle(interactable.type === "on_interact" ? 0xffff00 : 0xff00ff, 0.2);
      this.debugGraphics!.fillRect(px, py, scaledTileSize, scaledTileSize);
    });
  }
}
