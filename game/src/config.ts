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
  width: mapWidth * tileSize,
  height: mapHeight * tileSize,
  backgroundColor: "#000000",
  playerSpeed: 200,
  controls: {
    run: "X",
    action: "C",
    menu: "ENTER",
  },
};
