import { Scene } from "phaser";
import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
import { gameData } from "@/data/gameData";
import {
  MapParser,
  TilesetManager,
  LayerManager,
  PhaserTilemapAdapter,
} from "@/world/tilemap";
import { CollisionSystem } from "@/world/CollisionSystem";
import { readMapProps, type MapProps } from "@/world/mapProps";

export class MapSystem {
  private scene: Scene;
  private layerManager: LayerManager;
  private tilesetManager: TilesetManager;
  private adapter: PhaserTilemapAdapter;
  private collisionSystem: CollisionSystem;
  private currentMap: Phaser.Tilemaps.Tilemap | null = null;
  private gridGraphics: Phaser.GameObjects.Graphics | null = null;
  private currentProps: MapProps | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.layerManager = new LayerManager();
    this.tilesetManager = new TilesetManager();
    this.collisionSystem = new CollisionSystem();
    this.adapter = new PhaserTilemapAdapter(this.scene, this.tilesetManager, this.layerManager);
    
    this.registerTilesets();
  }

  private registerTilesets() {
    // Tiled tileset name = Phaser texture key, for every tileset listed in data/tilesets.json
    gameData.tilesets.forEach(({ name }) => {
      this.tilesetManager.registerTileset(name, name);
    });
  }

  public loadMap(mapKey: string): Phaser.Tilemaps.Tilemap {
    // Cleanup old map
    if (this.currentMap) {
      this.currentMap.destroy();
    }

    const rawData = this.scene.cache.tilemap.get(mapKey).data;
    const parsedData = MapParser.parse(rawData);
    this.currentProps = readMapProps(rawData);

    this.currentMap = this.adapter.createTilemapFromLoadedJson(mapKey, parsedData);

    // Wire up collision system (the walkable area is the map's real size, which can be less than whole tiles)
    this.collisionSystem.setMap(this.currentMap, { width: this.currentProps.pixelWidth, height: this.currentProps.pixelHeight });

    this.updateWorldBounds();
    this.renderDebugGrid();

    return this.currentMap;
  }

  private updateWorldBounds() {
    if (!this.currentMap) return;
    // A map smaller than the screen sits in the middle of it (the camera cannot scroll on that axis)
    const view = settingsStore.view;
    const mapW = this.currentProps?.pixelWidth ?? this.currentMap.widthInPixels;
    const mapH = this.currentProps?.pixelHeight ?? this.currentMap.heightInPixels;
    const boundsW = Math.max(mapW, view.width);
    const boundsH = Math.max(mapH, view.height);
    this.scene.cameras.main.setBounds((mapW - boundsW) / 2, (mapH - boundsH) / 2, boundsW, boundsH);
  }

  private renderDebugGrid() {
    if (this.gridGraphics) {
      this.gridGraphics.destroy();
    }

    if (!settingsStore.debug.enabled || !settingsStore.debug.showGrid || !this.currentMap) return;

    this.gridGraphics = this.scene.add.graphics();
    this.gridGraphics.setDepth(100);
    this.gridGraphics.lineStyle(1, 0xffffff, 0.1);
    
    const widthInPixels = this.currentMap.widthInPixels;
    const heightInPixels = this.currentMap.heightInPixels;
    const tileSize = GAME_CONSTANTS.TILE_SIZE;

    for (let x = 0; x <= widthInPixels; x += tileSize)
      this.gridGraphics.lineBetween(x, 0, x, heightInPixels);
    for (let y = 0; y <= heightInPixels; y += tileSize)
      this.gridGraphics.lineBetween(0, y, widthInPixels, y);
  }

  get map() { return this.currentMap; }
  /** The loaded map's size in pixels and settings. */
  get props(): MapProps | null { return this.currentProps; }
  get collisions() { return this.collisionSystem; }
}
