export interface ColliderComponentInit {
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;
  isSolid?: boolean;
}

export class ColliderComponent {
  public width: number;
  public height: number;
  public offsetX: number;
  public offsetY: number;
  public isSolid: boolean;

  constructor(init?: ColliderComponentInit) {
    this.width = init?.width ?? 16;
    this.height = init?.height ?? 8;
    this.offsetX = init?.offsetX ?? 0;
    this.offsetY = init?.offsetY ?? 0;
    this.isSolid = init?.isSolid ?? true;
  }
}

export const Collider = (props?: ColliderComponentInit) => new ColliderComponent(props);
