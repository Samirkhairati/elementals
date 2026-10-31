import type { EventState, SpriteProps } from "@shared/engine/index.ts";

/**
 * The Event component at runtime: the authored states plus what the state selector needs to apply and
 * undo state overrides. Running interpreters are tracked by the EventRuntime, not here.
 */
export class EventComponent {
  public states: EventState[];
  /** Index of the active state, -1 when no state's conditions hold. */
  public activeState: number = -1;
  /** True once the state selector evaluated this event at least once. */
  public evaluated: boolean = false;
  /** The authored Sprite props (state appearance overrides are applied on top of these). */
  public baseSprite: SpriteProps | null;
  /** The authored Collider.isSolid (a state `solid` override is applied on top of it). */
  public baseSolid: boolean | null;

  constructor(states: EventState[], baseSprite: SpriteProps | null = null, baseSolid: boolean | null = null) {
    this.states = states;
    this.baseSprite = baseSprite;
    this.baseSolid = baseSolid;
  }

  public get state(): EventState | undefined {
    return this.activeState >= 0 ? this.states[this.activeState] : undefined;
  }
}
