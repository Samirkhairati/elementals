import { createDefaultComponent, type Facing } from "@shared/engine/index.ts";
import { definePrefab } from "./Prefab";
import { expandEntity } from "../expand";
import { GAME_CONSTANTS } from "@/constants/game";

/** Sprite asset of the player (the only asset id the runtime itself names). */
export const PLAYER_ASSET_ID = "characters/player";

export interface PlayerPrefabProps {
  x: number;
  y: number;
  speed?: number;
  facing?: Facing;
}

/**
 * The player expressed in the engine's component model: a `characters/player` Sprite, a small "feet"
 * Collider (16x8, bottom-centred) and a `player` Movement. Gameplay is identical to the old hand-built
 * component list (tile and free movement, run key, 200 px/s).
 */
export const PlayerPrefab = definePrefab<PlayerPrefabProps>({
  name: "Player",
  build: (props) =>
    expandEntity({
      id: "player",
      name: "Player",
      x: props.x,
      y: props.y,
      components: {
        Transform: createDefaultComponent("Transform", { x: props.x, y: props.y, depth: GAME_CONSTANTS.PLAYER_DEPTH }),
        Sprite: createDefaultComponent("Sprite", { asset: PLAYER_ASSET_ID, facing: props.facing ?? "down" }),
        Collider: createDefaultComponent("Collider", { width: 16, height: 8 }),
        Movement: createDefaultComponent("Movement", { controller: "player", speed: props.speed ?? GAME_CONSTANTS.PLAYER_SPEED }),
        Tag: createDefaultComponent("Tag", { tag: "player" }),
      },
    }),
});
