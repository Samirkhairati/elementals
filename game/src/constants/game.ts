/**
 * Immutable gameplay and rendering constants.
 */
export const GAME_CONSTANTS = {
  TILE_SIZE: 32,
  VISIBLE_TILES_X: 15,
  VISIBLE_TILES_Y: 10,
  LOGICAL_WIDTH: 15 * 32,
  LOGICAL_HEIGHT: 10 * 32,
  ASPECT_RATIO: 15 / 10,
  PLAYER_SPEED: 200,
  PLAYER_DEPTH: 20,
  DEFAULT_BG_COLOR: "#000000",
} as const;

export const DEFAULT_CONTROLS = {
  RUN: "X",
  ACTION: "C",
  MENU: "ENTER",
} as const;
