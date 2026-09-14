export interface InteractableComponentInit {
  type?: 'on_interact' | 'on_step';
  message?: string;
  eventKey?: string;
  targetMap?: string;
  targetX?: number;
  targetY?: number;
}

export class InteractableComponent {
  public type: 'on_interact' | 'on_step';
  public message?: string;
  public eventKey?: string;
  public targetMap?: string;
  public targetX?: number;
  public targetY?: number;

  constructor(init?: InteractableComponentInit) {
    this.type = init?.type ?? 'on_interact';
    this.message = init?.message;
    this.eventKey = init?.eventKey;
    this.targetMap = init?.targetMap;
    this.targetX = init?.targetX;
    this.targetY = init?.targetY;
  }
}

export const Interactable = (props?: InteractableComponentInit) => new InteractableComponent(props);
