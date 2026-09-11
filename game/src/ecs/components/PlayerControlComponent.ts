export class PlayerControlComponent {
  public isMovementLocked: boolean = false;
}

export const PlayerControl = () => new PlayerControlComponent();
