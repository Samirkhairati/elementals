import { Scene, GameObjects, Tweens } from "phaser";
import { EventBus, Events } from "@/utils/EventBus";
import {
  DIALOGUE_LINE_HEIGHT as LINE_HEIGHT,
  DIALOGUE_PADDING as PADDING,
  dialogueBoxMetrics,
  normalizeDialogue,
  paginateLines,
  type DialoguePayload,
} from "./dialogueText";
import { DIALOGUE_COLORS, drawDialoguePanel } from "./dialoguePanel";

/**
 * Dialogue box with an optional speaker plate. Long text is word-wrapped to the box (bitmap font) and
 * split into pages; `advance()` shows the next page and returns false after the last one (the caller
 * then closes the box). Tapping the box does the same as the action key. A bobbing arrow at the bottom
 * right says there is more; a small square marks the last page. The box slides in when it opens.
 */
export class DialogueHUD {
  private scene: Scene;
  private container: GameObjects.Container;
  private textObject: GameObjects.BitmapText;
  private indicator: GameObjects.Graphics;
  private indicatorTween?: Tweens.Tween;
  private speakerText: GameObjects.BitmapText;
  private background: GameObjects.Graphics;
  private hitZone: GameObjects.Zone;
  private openTimestamp: number = 0;
  private pages: string[] = [""];
  private pageIndex = 0;
  private speaker = "";
  private fullText = "";
  private maxLines = 3;
  private box = { x: 0, y: 0, w: 0, h: 0 };

  public isVisible: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;

    this.container = this.scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(1000); // Very high depth so it sits above everything

    // Full screen hit zone: a tap anywhere advances the dialogue (same as the action key).
    this.hitZone = this.scene.add.zone(0, 0, this.scene.scale.width, this.scene.scale.height);
    this.hitZone.setOrigin(0, 0);
    this.hitZone.setInteractive();
    this.hitZone.on("pointerdown", () => {
      if (this.isVisible && Date.now() - this.openTimestamp > 150) {
        EventBus.emit(Events.INPUT_ACTION);
      }
    });
    this.container.add(this.hitZone);

    this.background = this.scene.add.graphics();
    this.container.add(this.background);

    this.textObject = this.scene.add.bitmapText(0, 0, "PokemonFont", "", LINE_HEIGHT);
    this.container.add(this.textObject);

    this.speakerText = this.scene.add.bitmapText(0, 0, "PokemonFont", "", LINE_HEIGHT);
    this.container.add(this.speakerText);

    this.indicator = this.scene.add.graphics();
    this.container.add(this.indicator);

    this.container.setVisible(false);
    this.layout();

    this.scene.scale.on("resize", this.onResize, this);
  }

  public show(payload: DialoguePayload) {
    const { speaker, text } = normalizeDialogue(payload);
    this.openTimestamp = Date.now();
    this.speaker = speaker;
    this.fullText = text;
    this.isVisible = true;
    this.container.setVisible(true);
    this.layout();
    this.showPage(0);
    this.playOpenAnimation();
  }

  /** Shows the next page. Returns false when the last page was already showing (nothing changed). */
  public advance(): boolean {
    if (this.pageIndex >= this.pages.length - 1) return false;
    this.showPage(this.pageIndex + 1);
    return true;
  }

  public hide() {
    this.isVisible = false;
    this.scene.tweens.killTweensOf(this.container);
    this.indicatorTween?.stop();
    this.indicatorTween = undefined;
    this.container.setVisible(false);
  }

  public destroy() {
    this.scene.scale.off("resize", this.onResize, this);
    this.scene.tweens.killTweensOf(this.container);
    this.indicatorTween?.stop();
    this.container.destroy();
  }

  /** Slide up a few pixels while fading in; the hit zone stays put so a tap never misses. */
  private playOpenAnimation() {
    this.scene.tweens.killTweensOf(this.container);
    this.container.setAlpha(0);
    this.container.setY(18);
    this.scene.tweens.add({ targets: this.container, alpha: 1, y: 0, duration: 140, ease: "Cubic.easeOut" });
  }

  private onResize() {
    if (this.isVisible) this.layout();
    else this.layout(false);
  }

  private showPage(index: number) {
    this.pageIndex = Math.max(0, Math.min(index, this.pages.length - 1));
    this.textObject.setText(this.pages[this.pageIndex]);
    this.drawIndicator();
  }

  /** Recomputes the box from the screen size and re-paginates the current text. */
  private layout(paginate = true) {
    const { width, height } = this.scene.scale;
    this.hitZone.setSize(width, height);

    const m = dialogueBoxMetrics(width, height);
    this.maxLines = m.maxLines;
    const { x: boxX, y: boxY, w: boxWidth, h: boxHeight } = m;
    this.box = { x: boxX, y: boxY, w: boxWidth, h: boxHeight };

    this.background.clear();
    drawDialoguePanel(this.background, boxX, boxY, boxWidth, boxHeight, { radius: 18 });

    if (this.speaker) {
      this.speakerText.setText(this.speaker);
      const plateW = this.speakerText.width + 48;
      const plateH = LINE_HEIGHT + 12;
      const plateY = boxY - plateH + 10;
      drawDialoguePanel(this.background, boxX + 20, plateY, plateW, plateH, { radius: 12, fill: DIALOGUE_COLORS.plate, alpha: 1 });
      this.speakerText.setPosition(boxX + 44, plateY + 6);
      this.speakerText.setVisible(true);
    } else {
      this.speakerText.setVisible(false);
    }

    this.textObject.setPosition(boxX + 32, boxY + PADDING);
    this.textObject.setMaxWidth(boxWidth - 64);

    if (paginate) {
      this.textObject.setText(this.fullText);
      const wrapped = this.textObject.getTextBounds().wrappedText;
      this.pages = paginateLines(wrapped, this.maxLines);
      this.pageIndex = Math.min(this.pageIndex, this.pages.length - 1);
      this.textObject.setText(this.pages[this.pageIndex]);
    }
    this.drawIndicator();
  }

  /** The "more" arrow (bobbing) or the "last page" square, at the bottom right of the box. */
  private drawIndicator() {
    const { x, y, w, h } = this.box;
    const more = this.pageIndex < this.pages.length - 1;
    const cx = x + w - 44;
    const cy = y + h - 38;

    this.indicatorTween?.stop();
    this.indicatorTween = undefined;
    this.indicator.clear();
    this.indicator.setPosition(0, 0);
    this.indicator.fillStyle(DIALOGUE_COLORS.ink, 1);
    if (more) {
      this.indicator.fillTriangle(cx - 14, cy - 9, cx + 14, cy - 9, cx, cy + 10);
      if (this.isVisible) {
        this.indicatorTween = this.scene.tweens.add({
          targets: this.indicator,
          y: 7,
          duration: 420,
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: -1,
        });
      }
    } else {
      this.indicator.fillRoundedRect(cx - 9, cy - 9, 18, 18, 4);
    }
  }
}
