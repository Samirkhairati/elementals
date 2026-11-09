import type { ShapePoint } from "@shared/collisionShapes.ts";

export interface ColliderComponentInit {
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;
  isSolid?: boolean;
  shape?: "box" | "polygon";
  /** Polygon points relative to the Transform anchor. */
  points?: ShapePoint[];
  closed?: boolean;
}

/**
 * Box bottom-centred on the Transform anchor, shifted by the offsets (+y is down).
 * Default: one tile (32x32), solid.
 */
export class ColliderComponent {
  public width: number;
  public height: number;
  public offsetX: number;
  public offsetY: number;
  public isSolid: boolean;
  public shape: "box" | "polygon";
  public points: ShapePoint[];
  public closed: boolean;

  constructor(init?: ColliderComponentInit) {
    this.width = init?.width ?? 32;
    this.height = init?.height ?? 32;
    this.offsetX = init?.offsetX ?? 0;
    this.offsetY = init?.offsetY ?? 0;
    this.isSolid = init?.isSolid ?? true;
    this.shape = init?.shape === "polygon" && init.points ? "polygon" : "box";
    this.points = init?.points ?? [];
    this.closed = init?.closed ?? true;
  }
}

export const Collider = (props?: ColliderComponentInit) => new ColliderComponent(props);
