export interface AIWanderComponentInit {
  radius?: number;
  interval?: number;
  speed?: number;
}

export class AIWanderComponent {
  public radius: number;
  public interval: number;
  public speed: number;
  /** Milliseconds spent idle since the last wander decision. */
  public timer: number = 0;
  /** Home position (tile-aligned world coords, bottom-centre like Transform). Set by AIWanderSystem. */
  public originX: number = 0;
  public originY: number = 0;
  /** True once AIWanderSystem has captured the home position. */
  public homeInitialized: boolean = false;

  constructor(init?: AIWanderComponentInit) {
    this.radius = init?.radius ?? 3;
    this.interval = init?.interval ?? 4000;
    this.speed = init?.speed ?? 60;
  }
}

export const AIWander = (props?: AIWanderComponentInit) => new AIWanderComponent(props);
