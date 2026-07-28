const tileSize = 32;
const mapWidth = 15;
const mapHeight = 10;

export const CONFIG = {
  debug: {
    enabled: true,
    showKeys: true,
    showCoords: true,
    showGrid: true,
  },
  tileSize,
  mapWidth,
  mapHeight,
  visibleTilesX: 15,
  visibleTilesY: 10,
  width: mapWidth * tileSize,
  height: mapHeight * tileSize,
  backgroundColor: "#000000",
  playerSpeed: 200,
  playerDepth: 20,
  camera: {
    smoothFollow: true,
  },
  controls: {
    run: "X",
    action: "C",
    menu: "ENTER",
  },
};
