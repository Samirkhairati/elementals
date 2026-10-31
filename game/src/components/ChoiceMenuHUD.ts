import { Scene, GameObjects } from "phaser";
import { DIALOGUE_LINE_HEIGHT as LINE_HEIGHT, dialogueBoxMetrics, moveCursor } from "./dialogueText";

/**
 * Choice menu shown above the dialogue box: a cursor row (`*` marks the selection, the font has no
 * `>`), keyboard (up/down + action / cancel) and touch (tap an option) driven. It reports a result
 * through `onResult(index)`; -1 means cancelled.
 */
export class ChoiceMenuHUD {
  private scene: Scene;
  private container: GameObjects.Container;
  private background: GameObjects.Graphics;
  private items: GameObjects.BitmapText[] = [];
  private labels: string[] = [];
  private selected = 0;
  private allowCancel = false;
  private readonly onResult: (index: number) => void;

  public isVisible = false;

  constructor(scene: Scene, onResult: (index: number) => void) {
    this.scene = scene;
    this.onResult = onResult;
    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(1010);
    this.background = scene.add.graphics();
    this.container.add(this.background);
    this.container.setVisible(false);
    this.scene.scale.on("resize", this.layout, this);
  }

  public get canCancel(): boolean {
    return this.allowCancel;
  }

  public show(options: string[], allowCancel: boolean) {
    this.labels = options.length > 0 ? options : ["..."];
    this.allowCancel = allowCancel;
    this.selected = 0;
    for (const item of this.items) item.destroy();
    this.items = this.labels.map((label, index) => {
      const item = this.scene.add.bitmapText(0, 0, "PokemonFont", label, LINE_HEIGHT);
      item.setInteractive({ useHandCursor: true });
      item.on("pointerover", () => {
        this.selected = index;
        this.refresh();
      });
      item.on("pointerdown", () => {
        this.selected = index;
        this.confirm();
      });
      this.container.add(item);
      return item;
    });
    this.isVisible = true;
    this.container.setVisible(true);
    this.refresh();
  }

  public moveSelection(delta: number) {
    if (!this.isVisible) return;
    this.selected = moveCursor(this.selected, delta, this.labels.length);
    this.refresh();
  }

  public confirm() {
    if (!this.isVisible) return;
    this.finish(this.selected);
  }

  /** Cancel key: reports -1 when the command allows cancelling (otherwise nothing happens). */
  public cancel() {
    if (!this.isVisible || !this.allowCancel) return;
    this.finish(-1);
  }

  public hide() {
    this.isVisible = false;
    this.container.setVisible(false);
  }

  public destroy() {
    this.scene.scale.off("resize", this.layout, this);
    this.container.destroy();
  }

  private finish(index: number) {
    this.hide();
    this.onResult(index);
  }

  private refresh() {
    this.items.forEach((item, i) => item.setText(`${i === this.selected ? "* " : "  "}${this.labels[i]}`));
    this.layout();
  }

  private layout() {
    if (this.items.length === 0) return;
    const { width, height } = this.scene.scale;
    const padding = 24;
    let textWidth = 0;
    for (const item of this.items) textWidth = Math.max(textWidth, item.width);
    const w = textWidth + padding * 2;
    const h = this.items.length * LINE_HEIGHT + padding * 2;
    const box = dialogueBoxMetrics(width, height);
    const x = box.x + box.w - w;
    const y = Math.max(10, box.y - h - 10);

    this.background.clear();
    this.background.fillStyle(0xffffff, 0.98);
    this.background.fillRoundedRect(x, y, w, h, 10);
    this.background.lineStyle(3, 0x000000, 1);
    this.background.strokeRoundedRect(x, y, w, h, 10);
    this.items.forEach((item, i) => item.setPosition(x + padding, y + padding + i * LINE_HEIGHT));
  }
}
