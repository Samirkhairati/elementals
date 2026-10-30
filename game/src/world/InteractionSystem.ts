import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
import type { World } from "@/ecs/World";
import { collectEntityInteractables } from "./entityInteractables";

export interface Interactable {
  x: number; // Tile X
  y: number; // Tile Y
  type: "on_interact" | "on_step";
  message?: string;
  eventKey?: string;
  targetMap?: string;
  targetX?: number;
  targetY?: number;
}

export class InteractionSystem {
  private interactables: Map<string, Interactable> = new Map();
  private scene: Phaser.Scene;
  private world: World | null = null;
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public setMap(map: Phaser.Tilemaps.Tilemap) {
    this.interactables.clear();
    
    // 1. Parse Tiled Object Layers
    const objectLayer = map.getObjectLayer("interactables");
    if (objectLayer && objectLayer.objects) {
      objectLayer.objects.forEach((obj) => {
        if (obj.x !== undefined && obj.y !== undefined) {
          const tileX = Math.floor(obj.x / GAME_CONSTANTS.TILE_SIZE);
          const tileY = Math.floor(obj.y / GAME_CONSTANTS.TILE_SIZE);
          
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
              if (obj.properties.message !== undefined) message = obj.properties.message;
              if (obj.properties.type !== undefined) type = obj.properties.type;
              if (obj.properties.eventKey !== undefined) eventKey = obj.properties.eventKey;
            }
          }

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

  /**
   * Editor-placed entities (ECS) are looked up from the world on every query, so an
   * interactable NPC keeps its dialogue while it wanders.
   */
  public setWorld(world: World) {
    this.world = world;
  }

  public registerInteractable(interactable: Interactable) {
    const key = `${interactable.x},${interactable.y}`;
    this.interactables.set(key, interactable);
  }

  public getInteractableAt(tileX: number, tileY: number): Interactable | undefined {
    if (this.world) {
      const dynamic = collectEntityInteractables(this.world).find((i) => i.x === tileX && i.y === tileY);
      if (dynamic) return dynamic;
    }
    return this.interactables.get(`${tileX},${tileY}`);
  }

  /** Redraws the debug overlay (call after entities were spawned). */
  public refreshDebug() {
    this.renderDebug();
  }

  private renderDebug() {
    if (this.debugGraphics) {
      this.debugGraphics.destroy();
    }

    if (!settingsStore.debug.enabled) return;

    this.debugGraphics = this.scene.add.graphics();
    this.debugGraphics.setDepth(101); // Above the debug grid

    const tileSize = GAME_CONSTANTS.TILE_SIZE;

    const all = [...this.interactables.values(), ...(this.world ? collectEntityInteractables(this.world) : [])];
    all.forEach((interactable) => {
      const px = interactable.x * tileSize;
      const py = interactable.y * tileSize;
      
      this.debugGraphics!.lineStyle(2, interactable.type === "on_interact" ? 0xffff00 : 0xff00ff, 0.8);
      this.debugGraphics!.strokeRect(px, py, tileSize, tileSize);
      this.debugGraphics!.fillStyle(interactable.type === "on_interact" ? 0xffff00 : 0xff00ff, 0.2);
      this.debugGraphics!.fillRect(px, py, tileSize, tileSize);
    });
  }
}
