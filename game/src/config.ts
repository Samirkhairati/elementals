const tileSize = 32;
const mapWidth = 15;
const mapHeight = 10;

export const CONFIG = {
  debug: {
    enabled: false,
    showKeys: true,
    showCoords: true,
    showGrid: true,
  },
  tileSize,
  renderScale: 1,
  mapWidth,
  mapHeight,
  visibleTilesX: 15,
  visibleTilesY: 10,
  width: mapWidth * tileSize,
  height: mapHeight * tileSize,
  backgroundColor: "#000000",
  playerSpeed: 200,
  playerDepth: 20,
  tileBasedMovement: true, // Toggle tile-based movement on (true) or off (false for continuous free movement)
  camera: {
    smoothFollow: true,
  },
  controls: {
    run: "X",
    action: "C",
    menu: "ENTER",
  },
};
