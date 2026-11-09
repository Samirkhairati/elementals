// Image layers of a map: pictures and sprites the editor placed freely (exported as an `objectgroup` with the
// property `kind=image`, see docs/maps.md). Pictures are drawn from ONE texture per picture file; every distinct
// crop is a frame of that texture, so showing ten parts of a sheet costs one image. Sizes are rounded to whole
// pixels and textures are filtered nearest-neighbour (the game runs with `pixelArt`).

import { normalizeProps } from "@shared/engine/index.ts";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import { buildSpriteComponents } from "@/sprites/spriteState";
import { sortDepth } from "@/ecs/depth";

export interface ImageObjectDef {
  name: string;
  /** Depth of the layer (its `z` property): the same one tile layers use. */
  depth: number;
  /** A character / sprite asset id, or ... */
  sprite?: string;
  /** ... a picture of the graphics library (`images/tree.png`). */
  graphic?: string;
  /** The part of the picture to show (picture pixels). */
  crop?: { x: number; y: number; w: number; h: number };
  /** The anchor: bottom-centre of the image. */
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  /** Draws among the characters by its anchor's y instead of at the layer's depth (resolved by the exporter). */
  ySort: boolean;
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

/** Tiled custom properties (`[{ name, value }]`) as a plain object. */
function propsOf(owner: unknown): Rec {
  const out: Rec = {};
  const list = isRecord(owner) ? owner.properties : undefined;
  if (Array.isArray(list)) for (const p of list) if (isRecord(p) && typeof p.name === "string") out[p.name] = p.value;
  return out;
}

const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Every image of every visible image layer of a raw (exported) map, in draw order (layers in file order, items as exported). */
export function readImageObjects(raw: unknown): ImageObjectDef[] {
  const layers = isRecord(raw) && Array.isArray(raw.layers) ? raw.layers : [];
  const out: ImageObjectDef[] = [];
  for (const layer of layers) {
    if (!isRecord(layer) || layer.type !== "objectgroup" || layer.visible === false) continue;
    const layerProps = propsOf(layer);
    if (layerProps.kind !== "image") continue;
    const depth = num(layerProps.z, 0);
    for (const obj of Array.isArray(layer.objects) ? layer.objects : []) {
      if (!isRecord(obj) || obj.visible === false) continue;
      const p = propsOf(obj);
      const graphic = typeof p.graphic === "string" && p.graphic !== "" ? p.graphic : undefined;
      const sprite = !graphic && typeof p.sprite === "string" && p.sprite !== "" ? p.sprite : undefined;
      if (!graphic && !sprite) continue;
      const crop =
        graphic && [p.cropX, p.cropY, p.cropW, p.cropH].every((n) => typeof n === "number")
          ? { x: p.cropX as number, y: p.cropY as number, w: p.cropW as number, h: p.cropH as number }
          : undefined;
      out.push({
        name: typeof obj.name === "string" ? obj.name : "",
        depth,
        sprite,
        graphic,
        crop,
        x: num(obj.x, 0),
        y: num(obj.y, 0),
        scale: Math.max(0.01, num(p.scale, 1)),
        flipX: p.flipX === true,
        flipY: p.flipY === true,
        opacity: Math.min(1, Math.max(0, num(p.opacity, 1))),
        ySort: p.ySort === true,
      });
    }
  }
  return out;
}

/** Picture files a map's image layers use (each once, however many crops). */
export const imagePictureIds = (raw: unknown): string[] => [...new Set(readImageObjects(raw).flatMap((o) => (o.graphic ? [o.graphic] : [])))].sort();

/** Characters / sprites a map's image layers use. */
export const imageSpriteIds = (raw: unknown): string[] => [...new Set(readImageObjects(raw).flatMap((o) => (o.sprite ? [o.sprite] : [])))].sort();

export const pictureTextureKey = (id: string): string => `picture:${id}`;
export const pictureUrl = (id: string): string => `graphics/${id.split("/").map(encodeURIComponent).join("/")}`;
/** Phaser's frame for the whole picture. */
export const WHOLE_PICTURE_FRAME = "__BASE";
export const cropFrameName = (c: { x: number; y: number; w: number; h: number }): string => `crop:${c.x},${c.y},${c.w},${c.h}`;

/** Size on screen: whole pixels, never below 1. */
export function displaySize(w: number, h: number, scale: number): { w: number; h: number } {
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// ── drawing ─────────────────────────────────────────────────────────────────────────────────────

/** What a drawn image needs from Phaser (faked in tests). */
export interface ImageObject {
  width: number;
  height: number;
  setOrigin(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setAlpha(alpha: number): unknown;
  setFlip(x: boolean, y: boolean): unknown;
  setDisplaySize(w: number, h: number): unknown;
  destroy(): void;
}

export interface ImageSceneLike {
  textures: {
    exists(key: string): boolean;
    get(key: string): {
      has(frame: string): boolean;
      add(frame: string, sourceIndex: number, x: number, y: number, w: number, h: number): unknown;
      getSourceImage(): { width: number; height: number };
    };
  };
  add: { image(x: number, y: number, texture: string, frame?: string | number): ImageObject };
}

/**
 * Creates the Phaser images of a map's image layers. `clear()` destroys them (map change). Anything whose texture
 * is missing is skipped with a warning, so a bad picture never stops the map.
 */
export class ImageLayerRenderer {
  private shown: ImageObject[] = [];
  private readonly scene: ImageSceneLike;
  private readonly sprites: SpriteRegistry;
  private readonly warn: (message: string) => void;

  constructor(scene: ImageSceneLike, sprites: SpriteRegistry, warn: (message: string) => void = (m) => console.warn(m)) {
    this.scene = scene;
    this.sprites = sprites;
    this.warn = warn;
  }

  get count(): number {
    return this.shown.length;
  }

  clear(): void {
    for (const image of this.shown) image.destroy();
    this.shown = [];
  }

  /**
   * Draws a map's image layers. `ySortDepth` is the depth the characters stand at (the map's player depth): a y-sorted
   * picture sorts with them by how far down its anchor is, exactly like a character's feet.
   */
  show(raw: unknown, options: { ySortDepth?: number } = {}): void {
    this.clear();
    const ySortDepth = options.ySortDepth ?? 20;
    for (const def of readImageObjects(raw)) {
      const image = def.graphic ? this.picture(def) : this.sprite(def);
      if (!image) continue;
      image.setDepth(def.ySort ? sortDepth(ySortDepth, def.y) : def.depth);
      image.setAlpha(def.opacity);
      image.setFlip(def.flipX, def.flipY);
      if (def.scale !== 1) {
        const size = displaySize(image.width, image.height, def.scale);
        image.setDisplaySize(size.w, size.h);
      }
      this.shown.push(image);
    }
  }

  private picture(def: ImageObjectDef): ImageObject | null {
    const id = def.graphic!;
    const key = pictureTextureKey(id);
    if (!this.scene.textures.exists(key)) {
      this.warn(`[ImageLayers] picture "${id}" is not loaded (run \`npm run assets:sync\`); "${def.name}" is skipped`);
      return null;
    }
    const texture = this.scene.textures.get(key);
    // Always name the frame: adding a crop frame makes it the texture's default one, so an unnamed frame would show
    // a crop on the next visit to a map (Phaser's whole-picture frame is `__BASE`).
    let frame = WHOLE_PICTURE_FRAME;
    if (def.crop) {
      const source = texture.getSourceImage();
      const c = def.crop;
      if (c.w < 1 || c.h < 1 || c.x < 0 || c.y < 0 || c.x + c.w > source.width || c.y + c.h > source.height) {
        this.warn(`[ImageLayers] "${def.name}": crop ${c.x},${c.y} ${c.w}x${c.h} is outside the ${source.width}x${source.height} picture; showing all of it`);
      } else {
        frame = cropFrameName(c);
        if (!texture.has(frame)) texture.add(frame, 0, c.x, c.y, c.w, c.h);
      }
    }
    const image = this.scene.add.image(def.x, def.y, key, frame);
    image.setOrigin(0.5, 1);
    return image;
  }

  private sprite(def: ImageObjectDef): ImageObject | null {
    const props = normalizeProps("Sprite", { asset: def.sprite });
    const built = buildSpriteComponents(props, this.sprites);
    if (!built.ok) {
      this.warn(`[ImageLayers] "${def.name}": ${built.reason}; it is skipped`);
      return null;
    }
    const { texture, frame, originX, originY } = built.value.sprite;
    if (!this.scene.textures.exists(texture)) {
      this.warn(`[ImageLayers] sprite "${def.sprite}" is not loaded; "${def.name}" is skipped`);
      return null;
    }
    const image = this.scene.add.image(def.x, def.y, texture, frame);
    image.setOrigin(originX, originY);
    return image;
  }
}
