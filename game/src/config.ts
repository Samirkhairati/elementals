const tileSize = 32;
const mapWidth = 15;
const mapHeight = 10;

export const CONFIG = {
  debug: {
    enabled: true,
    showKeys: true,
    showCoords: true,
    showGrid: false,
  },
  tileSize,
  mapWidth,
  mapHeight,
  width: mapWidth * tileSize,
  height: mapHeight * tileSize,
  backgroundColor: "#ffffff",
  playerSpeed: 200,
};
