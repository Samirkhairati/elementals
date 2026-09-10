export interface SpriteComponentInit {
  texture: string;
  frame?: string | number;
  originX?: number;
  originY?: number;
  visible?: boolean;
  alpha?: number;
  flipX?: boolean;
  tint?: number;
}

export class SpriteComponent {
  public texture: string;
  public frame?: string | number;
  public originX: number;
  public originY: number;
  public visible: boolean;
  public alpha: number;
  public flipX: boolean;
  public tint?: number;

  constructor(init: SpriteComponentInit) {
    this.texture = init.texture;
    this.frame = init.frame;
    this.originX = init.originX ?? 0.5;
    this.originY = init.originY ?? 1.0;
    this.visible = init.visible ?? true;
    this.alpha = init.alpha ?? 1.0;
    this.flipX = init.flipX ?? false;
    this.tint = init.tint;
  }
}

export const SpriteView = (props: SpriteComponentInit) => new SpriteComponent(props);
