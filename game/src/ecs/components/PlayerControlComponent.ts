export class PlayerControlComponent {
  public isMovementLocked: boolean = false;
  /** Movement.canRun: whether the run key has any effect. */
  public canRun: boolean = true;

  constructor(init?: { canRun?: boolean }) {
    this.canRun = init?.canRun ?? true;
  }
}

export const PlayerControl = (props?: { canRun?: boolean }) => new PlayerControlComponent(props);
