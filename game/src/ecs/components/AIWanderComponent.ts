export interface AIWanderComponentInit {
  radius?: number;
  interval?: number;
  speed?: number;
}

export class AIWanderComponent {
  public radius: number;
  public interval: number;
  public speed: number;
  public timer: number = 0;
  public originX: number = 0;
  public originY: number = 0;

  constructor(init?: AIWanderComponentInit) {
    this.radius = init?.radius ?? 3;
    this.interval = init?.interval ?? 4000;
    this.speed = init?.speed ?? 60;
  }
}

export const AIWander = (props?: AIWanderComponentInit) => new AIWanderComponent(props);
