import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";

/**
 * Backward-compatibility proxy for legacy CONFIG references.
 * @deprecated Prefer importing GAME_CONSTANTS or settingsStore directly.
 */
export const CONFIG = {
  get tileSize() {
    return GAME_CONSTANTS.TILE_SIZE;
  },
  get visibleTilesX() {
    return GAME_CONSTANTS.VISIBLE_TILES_X;
  },
  get visibleTilesY() {
    return GAME_CONSTANTS.VISIBLE_TILES_Y;
  },
  get mapWidth() {
    return GAME_CONSTANTS.VISIBLE_TILES_X;
  },
  get mapHeight() {
    return GAME_CONSTANTS.VISIBLE_TILES_Y;
  },
  get width() {
    return GAME_CONSTANTS.LOGICAL_WIDTH;
  },
  get height() {
    return GAME_CONSTANTS.LOGICAL_HEIGHT;
  },
  get backgroundColor() {
    return GAME_CONSTANTS.DEFAULT_BG_COLOR;
  },
  get playerSpeed() {
    return GAME_CONSTANTS.PLAYER_SPEED;
  },
  get playerDepth() {
    return GAME_CONSTANTS.PLAYER_DEPTH;
  },
  get tileBasedMovement() {
    return settingsStore.tileBasedMovement;
  },
  set tileBasedMovement(val: boolean) {
    settingsStore.tileBasedMovement = val;
  },
  get renderScale() {
    return settingsStore.renderScale;
  },
  set renderScale(val: number) {
    settingsStore.setRenderScale(val);
  },
  get debug() {
    return settingsStore.debug;
  },
  get camera() {
    return settingsStore.camera;
  },
  get controls() {
    return settingsStore.controls;
  },
};
