export type RendererChoice = "auto" | "canvas" | "webgl";

export interface BootParams {
  /** `?renderer=canvas|webgl|auto` - canvas helps in browsers where WebGL fails. */
  renderer: RendererChoice;
  /** `?map=<id>` - map (file base name) to start on instead of the first one. */
  map?: string;
  /** `?debug=1` - debug HUD, grid and a `window.__game` handle for the console. */
  debug: boolean;
}

const TRUTHY = new Set(["", "1", "true", "yes", "on"]);

/** Reads the URL query (`location.search`). Unknown values fall back to the defaults. */
export function parseBootParams(search: string): BootParams {
  const params = new URLSearchParams(search);
  const renderer = (params.get("renderer") ?? "auto").toLowerCase();
  const map = params.get("map")?.trim();
  const debugRaw = params.get("debug");
  return {
    renderer: renderer === "canvas" || renderer === "webgl" ? renderer : "auto",
    map: map ? map : undefined,
    debug: debugRaw !== null && TRUTHY.has(debugRaw.toLowerCase()),
  };
}

/** The params of the page the game runs in (defaults outside a browser). */
export const bootParams: BootParams =
  typeof window !== "undefined" ? parseBootParams(window.location.search) : { renderer: "auto", debug: false };
