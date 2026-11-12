// What a map says about itself beyond its layers (Tiled map properties written by shared/mapExport.ts): its real size
// in pixels when it is not a whole number of tiles, and its settings (the player's draw depth, which is also the
// depth y-sorted pictures sort at). Pure, so it is tested without Phaser.

import { mapPixelSize } from "@shared/mapSize.ts";
import { GAME_CONSTANTS } from "@/constants/game";
import { finiteOrUndefined as num, isRecord, tiledProps } from "./tiledRaw";

export interface MapProps {
  /** The map's size in pixels (camera bounds, walkable area). */
  pixelWidth: number;
  pixelHeight: number;
  /** Draw depth of the player and of y-sorted pictures. */
  playerZ: number;
}

export function readMapProps(raw: unknown): MapProps {
  const map = isRecord(raw) ? raw : {};
  const props = tiledProps(map);
  const width = num(map.width) ?? 1;
  const height = num(map.height) ?? 1;
  const size = mapPixelSize({ width, height, pixelWidth: num(props.pixelWidth), pixelHeight: num(props.pixelHeight) });
  return { pixelWidth: size.width, pixelHeight: size.height, playerZ: num(props.playerZ) ?? GAME_CONSTANTS.PLAYER_DEPTH };
}
