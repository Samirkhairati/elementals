import type { GameObjects } from "phaser";

/** Colours shared by every dialogue-style panel (dialogue box, name plate, choice menu). */
export const DIALOGUE_COLORS = {
  ink: 0x1f2433,
  paper: 0xfffaf0,
  paperEdge: 0xd8c9a0,
  plate: 0xffd978,
  shadow: 0x000000,
} as const;

interface PanelOptions {
  radius?: number;
  fill?: number;
  alpha?: number;
}

/**
 * A rounded panel with a soft drop shadow, a dark outline and a thin inner highlight line: the one look the
 * dialogue box, its name plate and the choice menu share. Draws into `g` without clearing it.
 */
export function drawDialoguePanel(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  { radius = 16, fill = DIALOGUE_COLORS.paper, alpha = 0.97 }: PanelOptions = {},
) {
  // Shadow: two stacked offsets read as a soft edge without a shader.
  g.fillStyle(DIALOGUE_COLORS.shadow, 0.14);
  g.fillRoundedRect(x + 2, y + 8, w, h, radius);
  g.fillStyle(DIALOGUE_COLORS.shadow, 0.14);
  g.fillRoundedRect(x + 1, y + 5, w, h, radius);

  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);

  g.lineStyle(2, DIALOGUE_COLORS.paperEdge, 1);
  g.strokeRoundedRect(x + 7, y + 7, w - 14, h - 14, Math.max(2, radius - 6));

  g.lineStyle(4, DIALOGUE_COLORS.ink, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
}
