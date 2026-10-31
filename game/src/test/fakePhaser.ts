import { EventEmitter } from "node:events";
import type { Scene } from "phaser";
import type { AnimationRegistration } from "@shared/engine/index.ts";

/** One Phaser animation state, advanced by `advance(ms)` the way Phaser does (accumulator × timeScale). */
export class FakeAnims {
  public currentAnim: { key: string } | null = null;
  public isPlaying = false;
  public timeScale = 1;
  public elapsed = 0;
  public plays: string[] = [];

  private readonly sprite: FakeSprite;
  private readonly registry: Map<string, AnimationRegistration>;

  constructor(sprite: FakeSprite, registry: Map<string, AnimationRegistration>) {
    this.sprite = sprite;
    this.registry = registry;
  }

  play(key: string, ignoreIfPlaying = false): void {
    if (ignoreIfPlaying && this.isPlaying && this.currentAnim?.key === key) return;
    this.currentAnim = { key };
    this.isPlaying = true;
    this.elapsed = 0;
    this.plays.push(key);
  }

  stop(): void {
    this.isPlaying = false;
    this.currentAnim = null;
  }

  /** Frame shown now (index into the animation's frame list). */
  get frameIndex(): number {
    const reg = this.currentAnim ? this.registry.get(this.currentAnim.key) : undefined;
    if (!reg) return 0;
    const step = Math.floor((this.elapsed * reg.fps) / 1000);
    return reg.loop ? step % reg.frames.length : Math.min(step, reg.frames.length - 1);
  }

  advance(ms: number): void {
    const reg = this.currentAnim ? this.registry.get(this.currentAnim.key) : undefined;
    if (!this.isPlaying || !reg) return;
    this.elapsed += ms * this.timeScale;
    if (!reg.loop && (this.elapsed * reg.fps) / 1000 >= reg.frames.length) {
      this.isPlaying = false;
      this.sprite.emit("animationcomplete", { key: reg.key }, {});
    }
  }
}

export class FakeSprite extends EventEmitter {
  public depth = 0;
  public visible = true;
  public alpha = 1;
  public flipX = false;
  public scaleX = 1;
  public originX = 0.5;
  public originY = 1;
  public isTinted = false;
  public tintTopLeft = 0;
  public destroyed = false;
  public frame: { name: string };
  public texture: { key: string };
  public anims: FakeAnims;

  public x: number;
  public y: number;

  constructor(x: number, y: number, textureKey: string, frame: string | number | undefined, registry: Map<string, AnimationRegistration>) {
    super();
    this.x = x;
    this.y = y;
    this.texture = { key: textureKey };
    this.frame = { name: String(frame ?? 0) };
    this.anims = new FakeAnims(this, registry);
  }

  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setDepth(d: number) { this.depth = d; return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setFlipX(f: boolean) { this.flipX = f; return this; }
  setScale(s: number) { this.scaleX = s; return this; }
  setTint(t: number) { this.isTinted = true; this.tintTopLeft = t; return this; }
  clearTint() { this.isTinted = false; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setTexture(key: string, frame?: string | number) { this.texture = { key }; this.frame = { name: String(frame ?? 0) }; return this; }
  setFrame(frame: string | number) { this.frame = { name: String(frame) }; return this; }
  play(key: string, ignoreIfPlaying = false) { this.anims.play(key, ignoreIfPlaying); return this; }
  destroy() { this.destroyed = true; }
}

/** The slice of a Phaser Scene the render bridge uses; `tick(ms)` advances every sprite's animation. */
export class FakeScene {
  public readonly sprites: FakeSprite[] = [];
  public readonly registry = new Map<string, AnimationRegistration>();
  public readonly textures = { exists: (_key: string) => true };
  public readonly anims = { exists: (key: string) => this.registry.has(key) };
  public readonly add = {
    sprite: (x: number, y: number, texture: string, frame?: string | number) => {
      const s = new FakeSprite(x, y, texture, frame, this.registry);
      this.sprites.push(s);
      return s;
    },
  };

  constructor(registrations: readonly AnimationRegistration[] = []) {
    for (const r of registrations) this.registry.set(r.key, r);
  }

  tick(ms: number): void {
    for (const s of this.sprites) if (!s.destroyed) s.anims.advance(ms);
  }

  get asScene(): Scene {
    return this as unknown as Scene;
  }
}
