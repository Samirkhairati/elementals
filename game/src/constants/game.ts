/**
 * Immutable gameplay and rendering constants.
 */
export const GAME_CONSTANTS = {
  TILE_SIZE: 32,
  // The default view (the game settings can change it): 32 tiles across at 16:9 = 18 down
  VISIBLE_TILES_X: 32,
  VISIBLE_TILES_Y: 18,
  LOGICAL_WIDTH: 32 * 32,
  LOGICAL_HEIGHT: 18 * 32,
  ASPECT_RATIO: 16 / 9,
  PLAYER_SPEED: 200,
  PLAYER_DEPTH: 20,
  DEFAULT_BG_COLOR: "#000000",
} as const;

export const DEFAULT_CONTROLS = {
  RUN: "X",
  ACTION: "C",
  MENU: "ENTER",
} as const;
