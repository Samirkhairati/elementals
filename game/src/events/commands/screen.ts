import { registerCommandHandler } from "./registry";
import { bool, facing, num, str } from "./params";

/** warp: map id = map file base name; x,y are tile coordinates; `facing` '' keeps the current one. */
registerCommandHandler("warp", async (cmd, rt) => {
  const p = cmd.params;
  const map = str(p, "map");
  if (!map) return rt.ctx.warn("[Event] warp without a map; skipped");
  if (!rt.ctx.maps.hasMap(map)) return rt.ctx.warn(`[Event] warp: unknown map "${map}"; skipped`);
  await rt.guard(
    rt.ctx.maps.warp({
      map,
      x: Math.trunc(num(p, "x", 0)),
      y: Math.trunc(num(p, "y", 0)),
      facing: facing(p, "facing"),
      fade: bool(p, "fade", true),
    }),
  );
});

registerCommandHandler("fadeScreen", async (cmd, rt) => {
  const mode = str(cmd.params, "mode", "out") === "in" ? "in" : "out";
  await rt.guard(rt.ctx.ui.fadeScreen(mode, Math.max(0, num(cmd.params, "ms", 400)), rt.signal));
});

registerCommandHandler("shakeScreen", async (cmd, rt) => {
  const power = Math.min(10, Math.max(1, num(cmd.params, "power", 3)));
  await rt.guard(rt.ctx.ui.shakeScreen(power, Math.max(0, num(cmd.params, "ms", 500)), rt.signal));
});
