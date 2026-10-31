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
  /** Sprite asset this graphic comes from (`characters/player`); '' for legacy raw textures. */
  assetId?: string;
  /** Phaser animation key played in a loop / once (object & animated assets). Static `frame` when unset. */
  animKey?: string;
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
  public assetId: string;
  public animKey?: string;
  /** Bumped by `playAnimation` so the render bridge restarts an already playing animation. */
  public animRevision: number = 0;

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
    this.assetId = init.assetId ?? "";
    this.animKey = init.animKey;
  }
}

export const SpriteView = (props: SpriteComponentInit) => new SpriteComponent(props);
