import type { ChoiceOption } from "@shared/engine/index.ts";
import { registerCommandHandler } from "./registry";
import { str, type Params } from "./params";

function choiceOptions(p: Params): ChoiceOption[] {
  if (!Array.isArray(p.options)) return [];
  const out: ChoiceOption[] = [];
  for (const o of p.options) {
    if (o && typeof o === "object" && typeof (o as ChoiceOption).id === "string") {
      const opt = o as ChoiceOption;
      out.push({ id: opt.id, label: typeof opt.label === "string" ? opt.label : opt.id });
    }
  }
  return out;
}

/** showText: speaker plate + text, waits for the player to dismiss it. Empty speaker = no plate. */
registerCommandHandler("showText", async (cmd, rt) => {
  const text = str(cmd.params, "text");
  const speaker = str(cmd.params, "speaker").trim();
  if (text.trim() === "" && speaker === "") return;
  await rt.guard(rt.ctx.ui.showText({ speaker, text }, rt.signal));
});

/**
 * showChoices: one branch per option id.
 *  - cancel 'none': the menu cannot be cancelled;
 *  - cancel 'last': cancelling picks the last option;
 *  - cancel 'branch': cancelling runs the `cancel` branch.
 * No options: warning, nothing happens.
 */
registerCommandHandler("showChoices", async (cmd, rt) => {
  const options = choiceOptions(cmd.params);
  if (options.length === 0) {
    rt.ctx.warn(`[Event] showChoices has no options; skipped`);
    return;
  }
  const cancel = str(cmd.params, "cancel", "none");
  const allowCancel = cancel === "last" || cancel === "branch";
  const index = await rt.guard(rt.ctx.ui.showChoices({ options: options.map((o) => o.label), allowCancel }, rt.signal));

  if (index >= 0 && index < options.length) return rt.runBranch(cmd, options[index].id);
  if (cancel === "last") return rt.runBranch(cmd, options[options.length - 1].id);
  if (cancel === "branch") return rt.runBranch(cmd, "cancel");
  // 'none' but the UI still reported a cancel: fall back to the first option rather than hanging.
  return rt.runBranch(cmd, options[0].id);
});
