/**
 * Phaser-free direction / movement-type definitions.
 * (Re-exported from AnimationManager for backwards compatibility.)
 */
export const Direction = {
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
  UP: "up",
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export const MovementType = {
  WALK: "walk",
  RUN: "run",
  SWIM: "swim",
} as const;

export type MovementType = (typeof MovementType)[keyof typeof MovementType];
