import { isActivity, resolveClip, type CharacterDef } from "@shared/engine/index.ts";
import { AnimatorComponent, type AfterClip, type ClipSpeedOverride } from "@/ecs/components/AnimatorComponent";

/**
 * The clip an explicit animation name plays on this character: a clip of that name, or (idle / walk / run)
 * the clip its bindings give for that activity, so `Sprite.animation = "run"` still falls back to walk
 * when the character has no run clip. null when it cannot play anything.
 */
export function explicitClipName(def: CharacterDef | null, mode: string, name: string): string | null {
  if (!def) return null;
  if (Object.hasOwn(def.clips, name)) return name;
  return isActivity(name) ? resolveClip(def, mode, name) : null;
}

/** True when `name` can be played on this character. */
export function canPlay(def: CharacterDef | null, name: string): boolean {
  return !!def && (Object.hasOwn(def.clips, name) || isActivity(name));
}

export interface PlayOptions {
  /** Speed multiplier for this play. */
  speed?: number;
  then?: AfterClip;
}

export interface PlayHandle {
  /** Resolves when the clip ended; null when it never does (a looping clip). */
  done: Promise<void> | null;
}

/**
 * Starts `name` as the explicit clip. A non-looping clip registers a one-shot: when it ends the animator
 * follows `then` (return to automatic, stay on the last frame, repeat). A previous waiter is released.
 */
export function playClip(a: AnimatorComponent, name: string, options: PlayOptions = {}): PlayHandle | null {
  if (!canPlay(a.def, name)) return null;
  a.oneShot?.resolve();
  a.oneShot = null;
  a.explicitClip = name;
  a.playSpeed = options.speed !== undefined && Number.isFinite(options.speed) ? Math.max(0, options.speed) : 1;
  a.revision++;

  const clipName = explicitClipName(a.def, a.mode, name);
  const clip = clipName !== null && a.def ? a.def.clips[clipName] : undefined;
  if (!clip || clip.loop) return { done: null };
  const then = options.then ?? "auto";
  const done = new Promise<void>((resolve) => {
    a.oneShot = { clip: name, then, resolve };
  });
  return { done };
}

/** Back to the automatic (binding-driven) animation. A pending wait is released. */
export function stopClip(a: AnimatorComponent): void {
  a.oneShot?.resolve();
  a.oneShot = null;
  if (a.explicitClip !== null) a.revision++;
  a.explicitClip = null;
  a.playSpeed = 1;
}

/**
 * Called when Phaser reports that animation `key` finished. Applies the one-shot's `then` and releases
 * the waiter. Returns true when the animator consumed the event.
 */
export function completeClip(a: AnimatorComponent, key: string): boolean {
  const shot = a.oneShot;
  if (!shot || a.currentAnimKey !== key) return false;
  a.oneShot = null;
  if (shot.then === "auto") {
    a.explicitClip = null;
    a.playSpeed = 1;
  } else if (shot.then === "loop") {
    a.revision++;
  }
  shot.resolve();
  return true;
}

export interface SpeedChange {
  value: number;
  mode: "scale" | "fps";
  /** Only this clip; omitted = every clip. */
  clip?: string;
}

/** `setAnimationSpeed`. A plain scale of every clip is `Sprite.animSpeed`; the rest are per-clip overrides. */
export function setClipSpeed(a: AnimatorComponent, change: SpeedChange): void {
  const value = Number.isFinite(change.value) ? Math.max(0, change.value) : 1;
  if (change.mode === "scale" && !change.clip) {
    a.animSpeed = value;
    return;
  }
  const key = change.clip || "*";
  const next: ClipSpeedOverride = { ...a.clipSpeeds[key] };
  if (change.mode === "fps") next.fps = value;
  else next.scale = value;
  a.clipSpeeds[key] = next;
}
