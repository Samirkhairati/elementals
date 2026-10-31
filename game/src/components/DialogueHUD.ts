import { Scene, GameObjects } from "phaser";
import { EventBus, Events } from "@/utils/EventBus";
import {
  DIALOGUE_LINE_HEIGHT as LINE_HEIGHT,
  DIALOGUE_PADDING as PADDING,
  dialogueBoxMetrics,
  normalizeDialogue,
  paginateLines,
  type DialoguePayload,
} from "./dialogueText";

/**
 * Dialogue box with an optional speaker plate. Long text is word-wrapped to the box (bitmap font) and
 * split into pages; `advance()` shows the next page and returns false after the last one (the caller
 * then closes the box). Tapping the box does the same as the action key.
 */
export class DialogueHUD {
  private scene: Scene;
  private container: GameObjects.Container;
  private textObject: GameObjects.BitmapText;
  private promptText: GameObjects.BitmapText;
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

    this.promptText = this.scene.add.bitmapText(0, 0, "PokemonFont", "", LINE_HEIGHT);
    this.promptText.setAlpha(0.7);
    this.container.add(this.promptText);

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
  }

  /** Shows the next page. Returns false when the last page was already showing (nothing changed). */
  public advance(): boolean {
    if (this.pageIndex >= this.pages.length - 1) return false;
    this.showPage(this.pageIndex + 1);
    return true;
  }

  public hide() {
    this.isVisible = false;
    this.container.setVisible(false);
  }

  public destroy() {
    this.scene.scale.off("resize", this.onResize, this);
    this.container.destroy();
  }

  private onResize() {
    if (this.isVisible) this.layout();
    else this.layout(false);
  }

  private showPage(index: number) {
    this.pageIndex = Math.max(0, Math.min(index, this.pages.length - 1));
    this.textObject.setText(this.pages[this.pageIndex]);
    const more = this.pageIndex < this.pages.length - 1;
    this.promptText.setText(more ? "* Tap or [Action] to continue" : "* Tap or [Action] to close");
    this.placePrompt();
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
    this.background.fillStyle(0xffffff, 0.96);
    this.background.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, 10);
    this.background.lineStyle(3, 0x000000, 1);
    this.background.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, 10);

    if (this.speaker) {
      this.speakerText.setText(this.speaker);
      const plateW = this.speakerText.width + 40;
      const plateH = LINE_HEIGHT + 8;
      const plateY = boxY - plateH + 6;
      this.background.fillStyle(0xffffff, 0.96);
      this.background.fillRoundedRect(boxX + 16, plateY, plateW, plateH, 8);
      this.background.lineStyle(3, 0x000000, 1);
      this.background.strokeRoundedRect(boxX + 16, plateY, plateW, plateH, 8);
      this.speakerText.setPosition(boxX + 36, plateY + 4);
      this.speakerText.setVisible(true);
    } else {
      this.speakerText.setVisible(false);
    }

    this.textObject.setPosition(boxX + 24, boxY + PADDING);
    this.textObject.setMaxWidth(boxWidth - 48);

    if (paginate) {
      this.textObject.setText(this.fullText);
      const wrapped = this.textObject.getTextBounds().wrappedText;
      this.pages = paginateLines(wrapped, this.maxLines);
      this.pageIndex = Math.min(this.pageIndex, this.pages.length - 1);
      this.textObject.setText(this.pages[this.pageIndex]);
    }
    this.placePrompt();
  }

  private placePrompt() {
    const { x, y, w, h } = this.box;
    this.promptText.setPosition(x + w - this.promptText.width - 24, y + h - LINE_HEIGHT - 10);
  }
}
