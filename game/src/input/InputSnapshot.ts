import { Direction } from "@/utils/AnimationManager";

export interface Vector2D {
  x: number;
  y: number;
}

export interface InputSnapshot {
  direction: Direction | null;
  vector: Vector2D;
  isRunning: boolean;
  holdDuration: number;
}
