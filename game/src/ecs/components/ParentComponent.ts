/**
 * The entity this one sits in (an entity inside an entity in the editor's scene tree, `EngineEntity.parent`). The
 * ParentFollowSystem moves it by however much its parent moved, turns it when the parent turns and hides it while the
 * parent is hidden; it still moves on its own (a route, wandering) on top of that, like a child node in Godot.
 */
export class ParentComponent {
  /** Editor id of the parent entity. */
  public readonly parentId: string;
  /** Where the parent was last frame (undefined until it is first found). */
  public lastX: number | undefined = undefined;
  public lastY: number | undefined = undefined;
  /** The parent's sprite angle last frame (degrees). */
  public lastAngle = 0;
  /** True while the parent (or one above it) is hidden. */
  public hidden = false;

  constructor(parentId: string) {
    this.parentId = parentId;
  }
}
