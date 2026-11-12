// Small readers for the raw exported map JSON (Tiled 1.10 + our properties), shared by the modules that pick parts out
// of it (image layers, collision shapes, map properties). The JSON is untrusted: every reader tolerates missing or
// wrongly typed fields.

import { isRecord } from "@shared/engine/index.ts";

export { isRecord };

export type Rec = Record<string, unknown>;

/** A finite number, or `fallback` for anything else. */
export function finiteOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** A finite number, or undefined for anything else. */
export function finiteOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Tiled custom properties (`[{ name, value }]` on a map, layer or object) as a plain object. */
export function tiledProps(owner: unknown): Rec {
  const out: Rec = {};
  const list = isRecord(owner) ? owner.properties : undefined;
  if (Array.isArray(list)) for (const p of list) if (isRecord(p) && typeof p.name === "string") out[p.name] = p.value;
  return out;
}

/** The map's layers, or none when the JSON has no layer list. */
export function rawLayers(raw: unknown): unknown[] {
  return isRecord(raw) && Array.isArray(raw.layers) ? raw.layers : [];
}
