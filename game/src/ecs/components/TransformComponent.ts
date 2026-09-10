export class TransformComponent {
  public x: number;
  public y: number;
  public depth: number;

  constructor(init?: { x?: number; y?: number; depth?: number }) {
    this.x = init?.x ?? 0;
    this.y = init?.y ?? 0;
    this.depth = init?.depth ?? 10;
  }
}

export const Transform = (props?: { x?: number; y?: number; depth?: number }) =>
  new TransformComponent(props);
