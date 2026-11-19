/**
 * Where an entity's events trigger when that is not its Collider: the Area2D of an entity that also has a solid body
 * (shared/sceneEntity.ts). A box bottom-centred on the Transform anchor, shifted by the offsets (+y is down).
 */
export interface AreaComponentInit {
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;
}

export class AreaComponent {
  public width: number;
  public height: number;
  public offsetX: number;
  public offsetY: number;

  constructor(init?: AreaComponentInit) {
    this.width = init?.width ?? 32;
    this.height = init?.height ?? 32;
    this.offsetX = init?.offsetX ?? 0;
    this.offsetY = init?.offsetY ?? 0;
  }
}
