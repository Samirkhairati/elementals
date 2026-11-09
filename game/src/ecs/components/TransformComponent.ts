export class TransformComponent {
  public x: number;
  public y: number;
  public depth: number;
  /**
   * A free entity: it may stand at any pixel and is never moved onto the tile grid. Tile-based entities (the default)
   * are snapped to their tile's anchor when they take a grid step.
   */
  public free: boolean;

  constructor(init?: { x?: number; y?: number; depth?: number; free?: boolean }) {
    this.x = init?.x ?? 0;
    this.y = init?.y ?? 0;
    this.depth = init?.depth ?? 10;
    this.free = init?.free ?? false;
  }
}

export const Transform = (props?: { x?: number; y?: number; depth?: number; free?: boolean }) =>
  new TransformComponent(props);
