import { definePrefab } from "./Prefab";
import { Transform } from "../components/TransformComponent";
import { SpriteView } from "../components/SpriteComponent";
import { Collider } from "../components/ColliderComponent";
import { GridMovement } from "../components/GridMovementComponent";
import { FreeMovement } from "../components/FreeMovementComponent";
import { PlayerControl } from "../components/PlayerControlComponent";
import { CharacterAnimation } from "../components/AnimationComponent";
import { Tag } from "../components/TagComponent";
import { GAME_CONSTANTS } from "@/constants/game";

export interface PlayerPrefabProps {
  x: number;
  y: number;
  speed?: number;
}

export const PlayerPrefab = definePrefab<PlayerPrefabProps>({
  name: "Player",
  build: (props) => [
    Transform({ x: props.x, y: props.y, depth: GAME_CONSTANTS.PLAYER_DEPTH }),
    SpriteView({
      texture: "player-walk",
      frame: 0,
      originX: 0.5,
      originY: 1.0,
    }),
    Collider({ width: 16, height: 8 }),
    GridMovement({ speed: props.speed ?? GAME_CONSTANTS.PLAYER_SPEED }),
    FreeMovement({ speed: props.speed ?? GAME_CONSTANTS.PLAYER_SPEED }),
    PlayerControl(),
    CharacterAnimation({ characterKey: "player" }),
    Tag("player"),
  ],
});
