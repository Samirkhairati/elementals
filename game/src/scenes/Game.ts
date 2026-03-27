import { Scene } from "phaser";
import { CONFIG } from "@/config";
import { Player } from "@/entities/Player";
import { DebugHUD } from "@/components/DebugHUD";
import { MapSwitcherHUD } from "@/components/MapSwitcherHUD";
import { MAPS, TILESETS } from "@/constants/assets";
import {
  MapParser,
  TilesetManager,
  LayerManager,
  PhaserTilemapAdapter,
} from "@/world/tilemap";

export class Game extends Scene {
  private player!: Player;
  private debugHUD?: DebugHUD;
  private mapSwitcherHUD!: MapSwitcherHUD;

  // Tilemap system components
  private map!: Phaser.Tilemaps.Tilemap;
  private layerManager!: LayerManager;
  private tilesetManager!: TilesetManager;
  private tilemapAdapter!: PhaserTilemapAdapter;

  constructor() {
    super("Game");
  }

  create() {
    // Use the first map as default
    this.createWorld(MAPS[0].key);
    this.spawnPlayer();
    
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.initializeDebugTools();
    this.initializeMapSwitcher();
  }

  private createWorld(mapKey: string) {
    // 1) Initialize managers (if they don't exist)
    this.layerManager = new LayerManager();
    this.tilesetManager = new TilesetManager();

    // 2) Register all available tilesets
    // Here we use our manifest. In a real game, you might only register what's needed for the current map
    TILESETS.forEach(key => {
      this.tilesetManager.registerTileset(key, key);
    });

    // 3) Retrieve raw JSON and parse it
    const rawData = this.cache.tilemap.get(mapKey).data;
    const parsedData = MapParser.parse(rawData);

    // 4) Build the Phaser Tilemap through our Adapter
    this.tilemapAdapter = new PhaserTilemapAdapter(
      this,
      this.tilesetManager,
      this.layerManager
    );
    this.map = this.tilemapAdapter.createTilemapFromLoadedJson(mapKey, parsedData);

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

    // Destroy existing player if it exists (for map switching)
    if (this.player) {
      this.player.destroy();
    }
    
    this.player = new Player(this, startX, startY, widthInPixels, heightInPixels);
  }

  private initializeMapSwitcher() {
    this.mapSwitcherHUD = new MapSwitcherHUD(this, (mapKey) => {
        this.switchMap(mapKey);
    });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
        const key = event.key.toUpperCase();
        if (key === CONFIG.controls.menu) {
            this.mapSwitcherHUD.toggle();
            this.player.setMovementLocked(this.mapSwitcherHUD.isVisible);
        } else if (this.mapSwitcherHUD.isVisible) {
            if (event.key === 'ArrowUp') this.mapSwitcherHUD.moveSelection(-1);
            if (event.key === 'ArrowDown') this.mapSwitcherHUD.moveSelection(1);
            if (key === CONFIG.controls.action) {
                this.mapSwitcherHUD.confirm();
                this.player.setMovementLocked(false);
            }
        }
    });
  }

  private switchMap(mapKey: string) {
    // 1) Destroy current map and HUDs
    this.map.destroy();
    
    // 2) Re-create world
    this.createWorld(mapKey);
    
    // 3) Respawn player and re-setup camera
    this.spawnPlayer();
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    
    // 4) Update Debug HUD with new player reference
    if (this.debugHUD) {
        this.debugHUD.setPlayer(this.player);
    }
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
