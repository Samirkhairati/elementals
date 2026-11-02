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
    return settingsStore.view.tilesX;
  },
  get visibleTilesY() {
    return settingsStore.view.tilesY;
  },
  get mapWidth() {
    return settingsStore.view.tilesX;
  },
  get mapHeight() {
    return settingsStore.view.tilesY;
  },
  get width() {
    return settingsStore.view.width;
  },
  get height() {
    return settingsStore.view.height;
  },
  get backgroundColor() {
    return GAME_CONSTANTS.DEFAULT_BG_COLOR;
  },
  get playerSpeed() {
    return settingsStore.movement.playerSpeed;
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
