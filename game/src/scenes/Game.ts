import { Scene } from "phaser";
import { CONFIG } from "../config";
import { Player } from "../entities/Player";
import { DebugHUD } from "../components/DebugHUD";
import {
  MapLoader,
  MapParser,
  TilesetManager,
  LayerManager,
  PhaserTilemapAdapter,
} from "../world/tilemap";

export class Game extends Scene {
  private player!: Player;
  private debugHUD?: DebugHUD;

  // Tilemap system components
  private map!: Phaser.Tilemaps.Tilemap;
  private layerManager!: LayerManager;
  private tilesetManager!: TilesetManager;
  private tilemapAdapter!: PhaserTilemapAdapter;

  constructor() {
    super("Game");
  }

  preload() {
    this.load.image("grass-tiles", "/assets/tilesets/grass.png");
    this.load.image("outside-tiles", "/assets/tilesets/outside.png");
    this.load.image("house-tiles", "/assets/tilesets/house.png");
    MapLoader.preloadMap(this, "map-data", "/data/maps/map1.json");
  }

  create() {
    this.createWorld();
    this.spawnPlayer();
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.initializeDebugTools();
  }

  private createWorld() {
    // 1) Initialize managers
    this.layerManager = new LayerManager();
    this.tilesetManager = new TilesetManager();

    // 2) Map the Tiled tileset names to the Phaser texture keys
    this.tilesetManager.registerTileset("grass", "grass-tiles");
    this.tilesetManager.registerTileset("outside", "outside-tiles");
    this.tilesetManager.registerTileset("house", "house-tiles");

    // 3) Retrieve raw JSON and parse it via our MapParser
    const rawData = this.cache.tilemap.get("map-data").data;
    const parsedData = MapParser.parse(rawData);

    // 4) Build the Phaser Tilemap through our Adapter
    this.tilemapAdapter = new PhaserTilemapAdapter(
      this,
      this.tilesetManager,
      this.layerManager
    );
    this.map = this.tilemapAdapter.createTilemapFromLoadedJson("map-data", parsedData);

    // Adjust camera bounds to match the map dimensions
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // Optional Grid Overlay logic for debug (adapts to total map size)
    if (CONFIG.debug.enabled && CONFIG.debug.showGrid) {
      const graphics = this.add.graphics();
      graphics.lineStyle(1, 0xffffff, 0.1);
      
      const mapWidthP = this.map.widthInPixels;
      const mapHeightP = this.map.heightInPixels;
      const { tileSize } = CONFIG;

      for (let x = 0; x <= mapWidthP; x += tileSize)
        graphics.lineBetween(x, 0, x, mapHeightP);
      for (let y = 0; y <= mapHeightP; y += tileSize)
        graphics.lineBetween(0, y, mapWidthP, y);
    }
  }

  private spawnPlayer() {
    const { tileSize } = CONFIG;
    const { width, height, widthInPixels, heightInPixels } = this.map;
    
    // Position at the center of the map
    const startX = Math.floor(width / 2) * tileSize + tileSize / 2;
    const startY = (Math.floor(height / 2) + 1) * tileSize;

    this.player = new Player(this, startX, startY, widthInPixels, heightInPixels);
  }

  private initializeDebugTools() {
    if (CONFIG.debug.enabled) {
      this.debugHUD = new DebugHUD(this, this.player);
    }
  }

  update(_time: number, _delta: number) {
    this.player?.update();
    this.debugHUD?.update();
  }
}
