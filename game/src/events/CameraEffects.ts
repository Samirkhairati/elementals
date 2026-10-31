import type { Scene } from "phaser";
import type { ScreenEffects } from "./BusEventUI";

/** Fade and shake on the game camera (the HUD scene has its own camera and is not affected). */
export class CameraEffects implements ScreenEffects {
  private readonly scene: Scene;
  /** True while the screen is faded to black (a fade out that was not faded back in). */
  public faded = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public fade(mode: "in" | "out", ms: number, signal: AbortSignal): Promise<void> {
    const cam = this.scene.cameras.main;
    return new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const duration = Math.max(1, ms);
      const eventName = mode === "out" ? "camerafadeoutcomplete" : "camerafadeincomplete";
      const done = () => {
        cam.off(eventName, done);
        signal.removeEventListener("abort", done);
        this.faded = mode === "out";
        resolve();
      };
      cam.once(eventName, done);
      signal.addEventListener("abort", done, { once: true });
      if (mode === "out") cam.fadeOut(duration, 0, 0, 0);
      else cam.fadeIn(duration, 0, 0, 0);
    });
  }

  public shake(power: number, ms: number, signal: AbortSignal): Promise<void> {
    const cam = this.scene.cameras.main;
    return new Promise<void>((resolve) => {
      if (signal.aborted || ms <= 0) return resolve();
      const done = () => {
        cam.off("camerashakecomplete", done);
        signal.removeEventListener("abort", done);
        resolve();
      };
      cam.once("camerashakecomplete", done);
      signal.addEventListener("abort", () => {
        cam.shakeEffect.reset();
        done();
      }, { once: true });
      cam.shake(ms, power * 0.002);
    });
  }

  /** Clears any running fade/shake (after a map switch). */
  public reset(): void {
    this.scene.cameras.main.resetFX();
    this.faded = false;
  }
}
