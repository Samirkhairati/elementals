/** Splits already word-wrapped text (lines separated by "\n") into pages of at most `linesPerPage` lines. */
export function paginateLines(wrapped: string, linesPerPage: number): string[] {
  const per = Math.max(1, Math.floor(linesPerPage));
  const lines = wrapped.split("\n");
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per).join("\n"));
  return pages.length > 0 ? pages : [""];
}

/** The payload of `Events.SHOW_DIALOGUE`: a plain string (legacy callers) or speaker + text. */
export type DialoguePayload = string | { speaker?: string; text: string };

export function normalizeDialogue(payload: DialoguePayload | undefined | null): { speaker: string; text: string } {
  if (typeof payload === "string") return { speaker: "", text: payload };
  if (payload && typeof payload === "object") {
    return { speaker: typeof payload.speaker === "string" ? payload.speaker.trim() : "", text: typeof payload.text === "string" ? payload.text : "" };
  }
  return { speaker: "", text: "" };
}

/** Index of the next/previous menu entry with wrap-around. */
export function moveCursor(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((current + delta) % count) + count) % count;
}

export const DIALOGUE_LINE_HEIGHT = 72;
export const DIALOGUE_PADDING = 20;

/** Geometry of the dialogue box for a screen size (shared by the dialogue box and the choice menu). */
export function dialogueBoxMetrics(width: number, height: number) {
  const maxLines = Math.max(1, Math.min(3, Math.floor((height * 0.5 - DIALOGUE_PADDING * 2 - 64) / DIALOGUE_LINE_HEIGHT)));
  const w = Math.min(1000, width - 40);
  const h = DIALOGUE_PADDING * 2 + maxLines * DIALOGUE_LINE_HEIGHT + 64;
  return { maxLines, x: (width - w) / 2, y: height - h - 20, w, h };
}
