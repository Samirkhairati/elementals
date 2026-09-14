import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";

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
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public setMap(map: Phaser.Tilemaps.Tilemap, rawEntities?: any[]) {
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

    // 2. Parse Editor Entities from JSON
    if (rawEntities && Array.isArray(rawEntities)) {
      rawEntities.forEach((entityDef) => {
        const comps = entityDef.components || {};
        const interactableComp = comps.Interactable;
        if (interactableComp) {
          const transform = comps.Transform || { x: entityDef.x || 0, y: entityDef.y || 0 };
          const collider = comps.Collider;
          const posX = transform.x ?? entityDef.x ?? 0;
          const posY = transform.y ?? entityDef.y ?? 0;

          const width = collider?.width || GAME_CONSTANTS.TILE_SIZE;
          const height = collider?.height || GAME_CONSTANTS.TILE_SIZE;
          const offsetX = collider?.offsetX || 0;
          const offsetY = collider?.offsetY || 0;

          const left = posX + offsetX - width / 2;
          const right = posX + offsetX + width / 2;
          const top = posY + offsetY - height;
          const bottom = posY + offsetY;

          const minTileX = Math.floor(Math.max(0, left) / GAME_CONSTANTS.TILE_SIZE);
          const maxTileX = Math.floor(Math.max(0, right - 1) / GAME_CONSTANTS.TILE_SIZE);
          const minTileY = Math.floor(Math.max(0, top) / GAME_CONSTANTS.TILE_SIZE);
          const maxTileY = Math.floor(Math.max(0, bottom - 1) / GAME_CONSTANTS.TILE_SIZE);

          const message = interactableComp.message || entityDef.name || "";
          const type = interactableComp.type || (collider?.isSolid ? "on_interact" : "on_step");
          const eventKey = interactableComp.eventKey || "";
          const targetMap = interactableComp.targetMap;
          const targetX = interactableComp.targetX;
          const targetY = interactableComp.targetY;

          for (let tx = minTileX; tx <= maxTileX; tx++) {
            for (let ty = minTileY; ty <= maxTileY; ty++) {
              this.registerInteractable({
                x: tx,
                y: ty,
                type,
                message,
                eventKey,
                targetMap,
                targetX,
                targetY,
              });
            }
          }
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

    if (!settingsStore.debug.enabled) return;

    this.debugGraphics = this.scene.add.graphics();
    this.debugGraphics.setDepth(101); // Above the debug grid

    const tileSize = GAME_CONSTANTS.TILE_SIZE;

    this.interactables.forEach((interactable) => {
      const px = interactable.x * tileSize;
      const py = interactable.y * tileSize;
      
      this.debugGraphics!.lineStyle(2, interactable.type === "on_interact" ? 0xffff00 : 0xff00ff, 0.8);
      this.debugGraphics!.strokeRect(px, py, tileSize, tileSize);
      this.debugGraphics!.fillStyle(interactable.type === "on_interact" ? 0xffff00 : 0xff00ff, 0.2);
      this.debugGraphics!.fillRect(px, py, tileSize, tileSize);
    });
  }
}
