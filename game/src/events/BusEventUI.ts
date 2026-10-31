import { EventBus, Events } from "@/utils/EventBus";
import type { ChoicesRequest, EventUI } from "./types";

/** Camera-level effects (implemented by the Game scene). */
export interface ScreenEffects {
  fade(mode: "in" | "out", ms: number, signal: AbortSignal): Promise<void>;
  shake(power: number, ms: number, signal: AbortSignal): Promise<void>;
}

let nextChoiceId = 1;

/**
 * EventUI that talks to the HUD scene over the EventBus:
 *  - showText   -> SHOW_DIALOGUE {speaker, text}, resolves on DIALOGUE_CLOSED (the HUD pages the text
 *                  and closes after the last page on the action key / a tap);
 *  - showChoices-> SHOW_CHOICES {id, options, allowCancel}, resolves on CHOICE_SELECTED (id, index);
 *  - aborting closes whichever box is open, so a cancelled event never leaves UI behind.
 */
export class BusEventUI implements EventUI {
  private readonly screen: ScreenEffects;

  constructor(screen: ScreenEffects) {
    this.screen = screen;
  }

  public showText(request: { speaker: string; text: string }, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const finish = () => {
        EventBus.off(Events.DIALOGUE_CLOSED, finish);
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        EventBus.emit(Events.DIALOGUE_CLOSED);
        finish();
      };
      EventBus.on(Events.DIALOGUE_CLOSED, finish);
      signal.addEventListener("abort", onAbort, { once: true });
      EventBus.emit(Events.SHOW_DIALOGUE, { speaker: request.speaker, text: request.text });
    });
  }

  public showChoices(request: ChoicesRequest, signal: AbortSignal): Promise<number> {
    return new Promise<number>((resolve) => {
      if (signal.aborted) return resolve(-1);
      const id = nextChoiceId++;
      const onSelected = (selectedId: number, index: number) => {
        if (selectedId !== id) return;
        cleanup();
        resolve(index);
      };
      const onAbort = () => {
        EventBus.emit(Events.HIDE_CHOICES);
        cleanup();
        resolve(-1);
      };
      const cleanup = () => {
        EventBus.off(Events.CHOICE_SELECTED, onSelected);
        signal.removeEventListener("abort", onAbort);
      };
      EventBus.on(Events.CHOICE_SELECTED, onSelected);
      signal.addEventListener("abort", onAbort, { once: true });
      EventBus.emit(Events.SHOW_CHOICES, { id, options: request.options, allowCancel: request.allowCancel });
    });
  }

  public fadeScreen(mode: "in" | "out", ms: number, signal: AbortSignal): Promise<void> {
    return this.screen.fade(mode, ms, signal);
  }

  public shakeScreen(power: number, ms: number, signal: AbortSignal): Promise<void> {
    return this.screen.shake(power, ms, signal);
  }
}
