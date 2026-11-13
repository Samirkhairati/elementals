// data/shaders.json (written by `npm run assets:sync`): the user shaders of project/shaders, copied to
// game/public/shaders/<id>.frag. The Preloader loads their text; the Game scene turns them into pipelines.

import { parseShader, type ShaderInfo } from "@shared/look/userShaders.ts";
import { isRecord } from "@/world/tiledRaw";

export interface ShaderEntry {
  id: string;
  /** URL relative to the web root. */
  file: string;
}

export function readShaderManifest(raw: unknown): ShaderEntry[] {
  const list = isRecord(raw) && Array.isArray(raw.shaders) ? raw.shaders : [];
  return list.flatMap((s) => (isRecord(s) && typeof s.id === "string" && typeof s.file === "string" && s.id && s.file ? [{ id: s.id, file: s.file }] : []));
}

export const shaderTextKey = (id: string): string => `shader-src:${id}`;

/** The loaded shaders, parsed (a shader whose text did not load is left out with a warning). */
export function loadedShaders(manifest: unknown, text: (key: string) => unknown): ShaderInfo[] {
  return readShaderManifest(manifest).flatMap((s) => {
    const src = text(shaderTextKey(s.id));
    if (typeof src !== "string") {
      console.warn(`[Looks] shader "${s.id}" did not load (${s.file})`);
      return [];
    }
    return [parseShader(s.id, src)];
  });
}
