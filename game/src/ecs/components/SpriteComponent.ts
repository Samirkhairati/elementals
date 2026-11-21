export interface SpriteComponentInit {
  texture: string;
  frame?: string | number;
  originX?: number;
  originY?: number;
  /** Pixel offset of the graphic from the Transform anchor (Sprite.offsetX/Y). */
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  visible?: boolean;
  alpha?: number;
  flipX?: boolean;
  tint?: number;
  /** Degrees, clockwise, around the origin (the entity's rotation). */
  angle?: number;
  /** Character this graphic comes from (`characters/player`); '' for legacy raw textures. Animations live on the AnimatorComponent. */
  assetId?: string;
}

export class SpriteComponent {
  public texture: string;
  public frame?: string | number;
  public originX: number;
  public originY: number;
  public offsetX: number;
  public offsetY: number;
  public scale: number;
  public visible: boolean;
  public alpha: number;
  public flipX: boolean;
  public tint?: number;
  public angle: number;
  public assetId: string;

  constructor(init: SpriteComponentInit) {
    this.texture = init.texture;
    this.frame = init.frame;
    this.originX = init.originX ?? 0.5;
    this.originY = init.originY ?? 1.0;
    this.offsetX = init.offsetX ?? 0;
    this.offsetY = init.offsetY ?? 0;
    this.scale = init.scale ?? 1;
    this.visible = init.visible ?? true;
    this.alpha = init.alpha ?? 1.0;
    this.flipX = init.flipX ?? false;
    this.tint = init.tint;
    this.angle = init.angle ?? 0;
    this.assetId = init.assetId ?? "";
  }
}

export const SpriteView = (props: SpriteComponentInit) => new SpriteComponent(props);
