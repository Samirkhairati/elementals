// Drop shadows in the game (Look.shadow): each picture or tile layer with a shadow gets images of its blurred,
// coloured silhouette (baked once with shared/look/shadow.ts, like the editor), drawn just below it at its depth,
// offset, faded and blended. Follows the active profile and crossfades the two profiles' shadows in a transition.
// Works with both renderers (the colour is baked in, no tint). See docs/looks.md.

import Phaser from "phaser";
import { chunkShadowMask, maskPixels, shadowChunk, shadowChunkCount, shadowFor, shadowMask, shadowRadius, type ResolvedShadow } from "@shared/look/shadow.ts";
import type { LookSet, ShadowBlend } from "@shared/look/types.ts";
import type { LookBlend } from "./lookState";

const BLEND: Record<ShadowBlend, Phaser.BlendModes> = {
  normal: Phaser.BlendModes.NORMAL,
  multiply: Phaser.BlendModes.MULTIPLY,
  screen: Phaser.BlendModes.SCREEN,
  add: Phaser.BlendModes.ADD,
};

/** Something that casts a shadow: its looks (inner first) and how to make the images of one shadow. */
interface Caster {
  sets: (LookSet | undefined)[];
  /** The caster's own opacity (a picture's), multiplied into its shadow's. */
  alpha: number;
  make: (s: ResolvedShadow) => Phaser.GameObjects.Image[];
  /** The images made so far, per shadow (a profile with the same shadow shares them). */
  made: Map<string, Phaser.GameObjects.Image[]>;
}

export interface ShadowSources {
  tileLayers: { layer: Phaser.Tilemaps.TilemapLayer; look: LookSet }[];
  pictures: { image: Phaser.GameObjects.Image; look?: LookSet; layerLook?: LookSet }[];
}

const shadowKey = (s: ResolvedShadow) => `${s.x},${s.y},${s.softness},${s.opacity},${s.color},${s.blend}`;

export class LookShadows {
  private readonly scene: Phaser.Scene;
  private casters: Caster[] = [];
  private textures: string[] = [];
  private serial = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** The shadows of a map's pictures and tile layers, for the profile blend in effect. */
  show(sources: ShadowSources, blend: LookBlend): void {
    this.clear();
    for (const p of sources.pictures) {
      const sets = [p.look, p.layerLook];
      if (sets.some((s) => s && hasShadow(s))) this.casters.push({ sets, alpha: p.image.alpha, make: (s) => this.pictureShadow(p.image, s), made: new Map() });
    }
    for (const { layer, look } of sources.tileLayers) {
      if (hasShadow(look)) this.casters.push({ sets: [look], alpha: layer.alpha, make: (s) => this.layerShadow(layer, s), made: new Map() });
    }
    this.apply(blend);
  }

  /** Shows the shadows of a profile blend: the settled profile's, or both profiles' crossfading. */
  apply(b: LookBlend): void {
    const settled = b.t >= 1 || b.from === b.to;
    for (const c of this.casters) {
      for (const images of c.made.values()) for (const i of images) i.setVisible(false);
      const to = shadowFor(c.sets, b.to);
      const from = settled ? to : shadowFor(c.sets, b.from);
      const same = !!to && !!from && shadowKey(to) === shadowKey(from);
      if (to) this.showShadow(c, to, same || settled ? 1 : b.t);
      if (from && !same) this.showShadow(c, from, 1 - b.t);
    }
  }

  /** Destroys every shadow image and texture (map change). */
  clear(): void {
    for (const c of this.casters) for (const images of c.made.values()) for (const i of images) i.destroy();
    this.casters = [];
    for (const key of this.textures) this.scene.textures.remove(key);
    this.textures = [];
  }

  private showShadow(c: Caster, s: ResolvedShadow, k: number): void {
    const key = shadowKey(s);
    let images = c.made.get(key);
    if (!images) c.made.set(key, (images = c.make(s)));
    for (const i of images) i.setVisible(k > 0).setAlpha(s.opacity * c.alpha * k);
  }

  /** A canvas texture of a blurred silhouette in the shadow's colour. */
  private texture(mask: { alpha: Uint8ClampedArray; w: number; h: number }, color: string): string {
    const key = `__look_shadow_${this.serial++}`;
    const tex = this.scene.textures.createCanvas(key, mask.w, mask.h)!;
    tex.context.putImageData(new ImageData(maskPixels(mask.alpha, color) as Uint8ClampedArray<ArrayBuffer>, mask.w, mask.h), 0, 0);
    tex.refresh();
    this.textures.push(key);
    return key;
  }

  /** An image of a silhouette drawn just below `under`, at its depth. */
  private place(key: string, x: number, y: number, under: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth, s: ResolvedShadow): Phaser.GameObjects.Image {
    const image = this.scene.add.image(x, y, key).setDepth(under.depth).setBlendMode(BLEND[s.blend]).setVisible(false);
    this.scene.children.moveBelow(image as Phaser.GameObjects.GameObject, under);
    return image;
  }

  private pictureShadow(img: Phaser.GameObjects.Image, s: ResolvedShadow): Phaser.GameObjects.Image[] {
    const frame = img.frame;
    const w = frame.cutWidth;
    const h = frame.cutHeight;
    const rgba = drawnPixels(w, h, (ctx) => ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, w, h));
    if (!rgba) return [];
    const mask = shadowMask(rgba, w, h, shadowRadius(s.softness, Math.abs(img.scaleX)));
    const image = this.place(this.texture(mask, s.color), img.x + s.x, img.y + s.y, img, s);
    image.setOrigin((mask.pad + img.originX * w) / mask.w, (mask.pad + img.originY * h) / mask.h);
    image.setScale(img.scaleX, img.scaleY).setFlip(img.flipX, img.flipY).setScrollFactor(img.scrollFactorX, img.scrollFactorY);
    return [image];
  }

  private layerShadow(layer: Phaser.Tilemaps.TilemapLayer, s: ResolvedShadow): Phaser.GameObjects.Image[] {
    const data = layer.layer.data;
    const mapW = layer.layer.width;
    const mapH = layer.layer.height;
    const tile = layer.tilemap.tileWidth;
    const radius = shadowRadius(s.softness, 1);
    const { cols, rows } = shadowChunkCount(mapW, mapH);
    const out: Phaser.GameObjects.Image[] = [];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const chunk = shadowChunk(cx, cy, mapW, mapH, tile, radius);
        let any = false;
        const rgba = drawnPixels(chunk.size, chunk.size, (ctx) => {
          for (let ty = chunk.y0; ty <= chunk.y1; ty++) {
            for (let tx = chunk.x0; tx <= chunk.x1; tx++) {
              const t = data[ty]?.[tx];
              const ts = t && t.index >= 0 ? t.tileset : null;
              if (!t || !ts) continue;
              const at = ts.getTileTextureCoordinates(t.index) as { x: number; y: number } | null;
              if (!at) continue;
              any = true;
              ctx.drawImage(ts.image!.getSourceImage() as CanvasImageSource, at.x, at.y, ts.tileWidth, ts.tileHeight, (tx - chunk.col) * tile, (ty - chunk.row) * tile, tile, tile);
            }
          }
        });
        const mask = any && rgba ? chunkShadowMask(rgba, chunk, mapW, mapH, tile, radius) : null;
        if (!mask) continue;
        const image = this.place(this.texture(mask, s.color), layer.x + chunk.at.x + s.x, layer.y + chunk.at.y + s.y, layer, s);
        out.push(image.setOrigin(0, 0).setScrollFactor(layer.scrollFactorX, layer.scrollFactorY));
      }
    }
    return out;
  }
}

const hasShadow = (set: LookSet): boolean => !!set.default?.shadow || Object.values(set.profiles ?? {}).some((l) => !!l.shadow);

/** The RGBA pixels of what `draw` draws on a `w` x `h` canvas; null if they cannot be read. */
function drawnPixels(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Uint8ClampedArray | null {
  if (w <= 0 || h <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  try {
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}
