import type { Activity, CharacterDef, Facing } from "@shared/engine/index.ts";
import { DEFAULT_MODE } from "@shared/engine/index.ts";
import { MovementType } from "@/utils/Direction";

/** What happens after an explicitly played one-shot clip ended. */
export type AfterClip = "auto" | "hold" | "loop";

export interface OneShot {
  clip: string;
  then: AfterClip;
  /** Settles whoever waits for the clip to end (a no-op when nobody waits). */
  resolve: () => void;
}

/** Runtime speed override of a clip (or every clip, key `*`) set by `setAnimationSpeed`. */
export interface ClipSpeedOverride {
  scale?: number;
  /** Absolute frames per second; ignores follow-speed. */
  fps?: number;
}

export interface AnimatorInit {
  characterId: string;
  def: CharacterDef | null;
  facing?: Facing;
  mode?: string;
  /** Clip played regardless of movement (`Sprite.animation`); null = automatic (bindings). */
  explicitClip?: string | null;
  animSpeed?: number;
}

/**
 * Drives the animation of every sprite (docs/database-and-characters-spec.md §10.1). The AnimationSystem
 * fills `currentAnimKey`, `flipX` and `timeScale` from movement + the character's bindings; the
 * RenderBridgeSystem plays them and reports one-shot completions back.
 */
export class AnimatorComponent {
  public characterId: string;
  /** The character this animator plays; null when the id is unknown (nothing animates). */
  public def: CharacterDef | null;
  public facing: Facing;
  /** Movement mode selecting `<mode>.<activity>` bindings ('normal' by default). */
  public mode: string;
  /** From movement, set by the AnimationSystem. */
  public activity: Activity = "idle";
  /** Clip set by `playAnimation` / `Sprite.animation`; null = automatic. */
  public explicitClip: string | null;
  public oneShot: OneShot | null = null;
  /** `Sprite.animSpeed`, changed at runtime by events. 0 pauses. */
  public animSpeed: number;
  /** Per-play speed multiplier of `playAnimation`; reset when the explicit clip clears. */
  public playSpeed = 1;
  public clipSpeeds: Record<string, ClipSpeedOverride> = {};
  /** px/s including the run multiplier, for follow-speed clips. */
  public entitySpeed = 0;
  /** Chosen by the AnimationSystem; '' = no animation (the static frame shows). */
  public currentAnimKey = "";
  /** Name of the clip `currentAnimKey` belongs to. */
  public currentClip: string | null = null;
  /** The facing shows another facing's frames mirrored. */
  public flipX = false;
  /** effective fps / authored fps of the current clip. */
  public timeScale = 1;
  /** Bumped to restart the current animation (playing the same clip again). */
  public revision = 0;
  /** Movement inputs read by the AnimationSystem. */
  public isMoving = false;
  public movementType: MovementType = MovementType.WALK;

  constructor(init: AnimatorInit) {
    this.characterId = init.characterId;
    this.def = init.def;
    this.facing = init.facing ?? "down";
    this.mode = init.mode ?? DEFAULT_MODE;
    this.explicitClip = init.explicitClip ?? null;
    this.animSpeed = init.animSpeed ?? 1;
  }
}
