import { Scene } from "phaser";
import { CONFIG } from "@/config";
import { TILESETS } from "@/constants/assets";
import {
  MapParser,
  TilesetManager,
  LayerManager,
  PhaserTilemapAdapter,
} from "@/world/tilemap";
import { CollisionSystem } from "@/world/CollisionSystem";

export class MapSystem {
  private scene: Scene;
  private layerManager: LayerManager;
  private tilesetManager: TilesetManager;
  private adapter: PhaserTilemapAdapter;
  private collisionSystem: CollisionSystem;
  private currentMap: Phaser.Tilemaps.Tilemap | null = null;
  private gridGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.layerManager = new LayerManager();
    this.tilesetManager = new TilesetManager();
    this.collisionSystem = new CollisionSystem();
    this.adapter = new PhaserTilemapAdapter(this.scene, this.tilesetManager, this.layerManager);
    
    this.registerTilesets();
  }

  private registerTilesets() {
    TILESETS.forEach(key => {
      this.tilesetManager.registerTileset(key, key);
    });
  }

  public loadMap(mapKey: string): Phaser.Tilemaps.Tilemap {
    // Cleanup old map
    if (this.currentMap) {
      this.currentMap.destroy();
    }

    const rawData = this.scene.cache.tilemap.get(mapKey).data;
    const parsedData = MapParser.parse(rawData);

    this.currentMap = this.adapter.createTilemapFromLoadedJson(mapKey, parsedData);
    
    // Wire up collision system
    this.collisionSystem.setMap(this.currentMap);

    this.updateWorldBounds();
    this.renderDebugGrid();

    return this.currentMap;
  }

  private updateWorldBounds() {
    if (!this.currentMap) return;
    this.scene.cameras.main.setBounds(
        0, 0, 
        this.currentMap.widthInPixels, 
        this.currentMap.heightInPixels
    );
  }

  private renderDebugGrid() {
    if (this.gridGraphics) {
      this.gridGraphics.destroy();
    }

    if (!CONFIG.debug.enabled || !CONFIG.debug.showGrid || !this.currentMap) return;

    this.gridGraphics = this.scene.add.graphics();
    this.gridGraphics.setDepth(100);
    this.gridGraphics.lineStyle(1, 0xffffff, 0.1);
    
    const { widthInPixels, heightInPixels } = this.currentMap;
    const { tileSize } = CONFIG;

    for (let x = 0; x <= widthInPixels; x += tileSize)
      this.gridGraphics.lineBetween(x, 0, x, heightInPixels);
    for (let y = 0; y <= heightInPixels; y += tileSize)
      this.gridGraphics.lineBetween(0, y, widthInPixels, y);
  }

  get map() { return this.currentMap; }
  get collisions() { return this.collisionSystem; }
}
