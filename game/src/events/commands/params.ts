import { isFacing, type CommandTarget, type Facing } from "@shared/engine/index.ts";

export type Params = Record<string, unknown>;

export function str(p: Params, key: string, fallback = ""): string {
  const v = p[key];
  return typeof v === "string" ? v : fallback;
}

export function num(p: Params, key: string, fallback = 0): number {
  const v = p[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function bool(p: Params, key: string, fallback: boolean): boolean {
  const v = p[key];
  return typeof v === "boolean" ? v : fallback;
}

export function facing(p: Params, key: string): Facing | undefined {
  const v = p[key];
  return isFacing(v) ? v : undefined;
}

/** `undefined` param = 'self' (the editor default); malformed targets are `null`. */
export function target(p: Params, key: string, fallback: CommandTarget = "self"): CommandTarget | null {
  const v = p[key];
  if (v === undefined) return fallback;
  if (v === "self" || v === "player") return v;
  if (v !== null && typeof v === "object" && typeof (v as { entity?: unknown }).entity === "string") {
    return { entity: (v as { entity: string }).entity };
  }
  return null;
}
