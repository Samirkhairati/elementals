import { definePrefab } from "./Prefab";
import { Transform } from "../components/TransformComponent";
import { SpriteView } from "../components/SpriteComponent";
import { Tag } from "../components/TagComponent";

export interface DecorationProps {
  x: number;
  y: number;
  texture?: string;
  frame?: string | number;
  depth?: number;
  tag?: string;
}

export const DecorationPrefab = definePrefab<DecorationProps>({
  name: "Decoration",
  build: (props) => [
    Transform({ x: props.x, y: props.y, depth: props.depth ?? 10 }),
    SpriteView({
      texture: props.texture ?? "bush",
      frame: props.frame,
      originX: 0.5,
      originY: 1.0,
    }),
    Tag(props.tag ?? "decoration"),
  ],
});
