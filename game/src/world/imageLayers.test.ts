import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { convertEditorMapToTiled } from "@shared/mapExport.ts";
import { SpriteRegistry } from "@/data/spriteRegistry";
import { charactersForMap } from "@/sprites/preloadSets";
import {
  ImageLayerRenderer,
  cropFrameName,
  displaySize,
  imagePictureIds,
  imageSpriteIds,
  pictureTextureKey,
  pictureUrl,
  readImageObjects,
  type ImageObject,
  type ImageSceneLike,
} from "./imageLayers";

/** An editor map as the editor saves it, exported with the real exporter so the test follows the real format. */
function exported(images: object[], layerExtra: object = {}) {
  const map = {
    name: "town",
    width: 4,
    height: 4,
    layers: [{ id: "i", name: "Sky", type: "image", visible: true, locked: false, z: 5, images, ...layerExtra }],
    entities: [],
  };
  return JSON.parse(JSON.stringify(convertEditorMapToTiled(map as never, [])));
}

const realSprites = new SpriteRegistry();
realSprites.load(JSON.parse(readFileSync(new URL("../../public/data/characters.json", import.meta.url), "utf8")));

class FakeImage implements ImageObject {
  x: number;
  y: number;
  texture: string;
  frame: string | number | undefined;
  width: number;
  height: number;
  origin = [0, 0];
  depth = 0;
  alpha = 1;
  flip = [false, false];
  display: [number, number] | null = null;
  destroyed = false;
  constructor(x: number, y: number, texture: string, frame: string | number | undefined, size: { width: number; height: number }) {
    this.x = x;
    this.y = y;
    this.texture = texture;
    this.frame = frame;
    this.width = size.width;
    this.height = size.height;
  }
  setOrigin(x: number, y: number) { this.origin = [x, y]; }
  setDepth(d: number) { this.depth = d; }
  setAlpha(a: number) { this.alpha = a; }
  setFlip(x: boolean, y: boolean) { this.flip = [x, y]; }
  setDisplaySize(w: number, h: number) { this.display = [w, h]; }
  destroy() { this.destroyed = true; }
}

function fakeScene(pictures: Record<string, { width: number; height: number }>) {
  const frames = new Map<string, Set<string>>();
  const added: FakeImage[] = [];
  const scene: ImageSceneLike = {
    textures: {
      exists: (key) => key in pictures || key.startsWith("sprite:"),
      get: (key) => {
        const set = frames.get(key) ?? frames.set(key, new Set()).get(key)!;
        return { has: (f) => set.has(f), add: (f) => set.add(f), getSourceImage: () => pictures[key] };
      },
    },
    add: {
      image: (x, y, texture, frame) => {
        const img = new FakeImage(x, y, texture, frame, pictures[texture] ?? { width: 16, height: 16 });
        added.push(img);
        return img;
      },
    },
  };
  return { scene, added, frames };
}

describe("readImageObjects", () => {
  it("reads what the exporter writes: picture, crop, scale, flips, opacity, the layer's depth", () => {
    const raw = exported([
      { id: "a", graphicId: "images/sky.png", x: 40, y: 64, name: "Cloud" },
      { id: "b", graphicId: "images/sky.png", x: 8, y: 9, crop: { x: 16, y: 0, w: 16, h: 8 }, scale: 1.5, flipX: true, flipY: true, opacity: 0.5 },
      { id: "c", assetId: "objects/chest", x: 1, y: 2 },
    ]);
    const [a, b, c] = readImageObjects(raw);
    expect(a).toMatchObject({ name: "Cloud", graphic: "images/sky.png", x: 40, y: 64, depth: 5, scale: 1, flipX: false, opacity: 1 });
    expect(a.crop).toBeUndefined();
    expect(b).toMatchObject({ crop: { x: 16, y: 0, w: 16, h: 8 }, scale: 1.5, flipX: true, flipY: true, opacity: 0.5 });
    expect(c).toMatchObject({ sprite: "objects/chest", graphic: undefined });
  });

  it("skips hidden layers, other object groups and objects without a picture or sprite", () => {
    expect(readImageObjects(exported([{ id: "a", graphicId: "x.png", x: 0, y: 0 }], { visible: false }))).toEqual([]);
    const raw = exported([{ id: "a", graphicId: "x.png", x: 0, y: 0 }]);
    raw.layers[0].properties = [];
    expect(readImageObjects(raw)).toEqual([]);
    expect(readImageObjects(null)).toEqual([]);
    expect(readImageObjects({ layers: [{ type: "objectgroup", properties: [{ name: "kind", value: "image" }], objects: [{ properties: [] }] }] })).toEqual([]);
  });

  it("lists each picture and sprite once, however many crops use them", () => {
    const raw = exported([
      { id: "a", graphicId: "images/sky.png", x: 0, y: 0, crop: { x: 0, y: 0, w: 8, h: 8 } },
      { id: "b", graphicId: "images/sky.png", x: 0, y: 0, crop: { x: 8, y: 0, w: 8, h: 8 } },
      { id: "c", assetId: "objects/chest", x: 0, y: 0 },
    ]);
    expect(imagePictureIds(raw)).toEqual(["images/sky.png"]);
    expect(imageSpriteIds(raw)).toEqual(["objects/chest"]);
  });

  it("makes the characters of image-layer sprites load with the map", () => {
    const raw = exported([{ id: "c", assetId: "objects/chest", x: 0, y: 0 }]);
    expect(charactersForMap(raw)).toContain("objects/chest");
  });
});

describe("names and sizes", () => {
  it("one texture key per picture file, an encoded URL, one frame name per crop", () => {
    expect(pictureTextureKey("images/sky.png")).toBe("picture:images/sky.png");
    expect(pictureUrl("images/my sky#1.png")).toBe("graphics/images/my%20sky%231.png");
    expect(cropFrameName({ x: 1, y: 2, w: 3, h: 4 })).toBe("crop:1,2,3,4");
  });

  it("scaled sizes are whole pixels, never below 1", () => {
    expect(displaySize(15, 15, 1.5)).toEqual({ w: 23, h: 23 });
    expect(displaySize(3, 3, 0.1)).toEqual({ w: 1, h: 1 });
  });
});

describe("ImageLayerRenderer", () => {
  const sky = { width: 64, height: 32 };
  const key = pictureTextureKey("images/sky.png");

  it("draws a picture on its bottom-centre anchor with the layer's depth, flips and opacity", () => {
    const { scene, added } = fakeScene({ [key]: sky });
    const r = new ImageLayerRenderer(scene, realSprites);
    r.show(exported([{ id: "a", graphicId: "images/sky.png", x: 40, y: 64, flipX: true, opacity: 0.5 }]));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ x: 40, y: 64, texture: key, frame: undefined, origin: [0.5, 1], depth: 5, alpha: 0.5, flip: [true, false], display: null });
  });

  it("crops are frames of the one picture texture: each distinct crop is added once, never a copy of the picture", () => {
    const { scene, added, frames } = fakeScene({ [key]: sky });
    const r = new ImageLayerRenderer(scene, realSprites);
    r.show(exported([
      { id: "a", graphicId: "images/sky.png", x: 0, y: 0, crop: { x: 0, y: 0, w: 16, h: 16 } },
      { id: "b", graphicId: "images/sky.png", x: 20, y: 0, crop: { x: 0, y: 0, w: 16, h: 16 } },
      { id: "c", graphicId: "images/sky.png", x: 40, y: 0, crop: { x: 16, y: 0, w: 16, h: 16 } },
    ]));
    expect(new Set(added.map((i) => i.texture))).toEqual(new Set([key]));
    expect([...frames.get(key)!].sort()).toEqual(["crop:0,0,16,16", "crop:16,0,16,16"]);
    expect(added.map((i) => i.frame)).toEqual(["crop:0,0,16,16", "crop:0,0,16,16", "crop:16,0,16,16"]);
  });

  it("scales to whole pixels", () => {
    const { scene, added } = fakeScene({ [key]: { width: 15, height: 15 } });
    new ImageLayerRenderer(scene, realSprites).show(exported([{ id: "a", graphicId: "images/sky.png", x: 0, y: 0, scale: 1.5 }]));
    expect(added[0].display).toEqual([23, 23]);
  });

  it("a crop outside the picture shows the whole picture and warns; a missing picture is skipped with a warning", () => {
    const { scene, added } = fakeScene({ [key]: sky });
    const warn = vi.fn();
    new ImageLayerRenderer(scene, realSprites, warn).show(exported([
      { id: "a", graphicId: "images/sky.png", x: 0, y: 0, crop: { x: 60, y: 0, w: 16, h: 16 } },
      { id: "b", graphicId: "images/gone.png", x: 0, y: 0 },
    ]));
    expect(added.map((i) => i.frame)).toEqual([undefined]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/outside/);
    expect(warn.mock.calls[1][0]).toMatch(/not loaded/);
  });

  it("draws a sprite item with the character's own texture, frame and pivot", () => {
    const { scene, added } = fakeScene({});
    const r = new ImageLayerRenderer(scene, realSprites);
    r.show(exported([{ id: "c", assetId: "objects/chest", x: 48, y: 96 }]));
    expect(added).toHaveLength(1);
    expect(added[0].texture).toMatch(/^sprite:objects\/chest:/);
    expect(added[0]).toMatchObject({ x: 48, y: 96, depth: 5 });
  });

  it("an unknown sprite is skipped with a warning", () => {
    const { scene, added } = fakeScene({});
    const warn = vi.fn();
    new ImageLayerRenderer(scene, realSprites, warn).show(exported([{ id: "c", assetId: "objects/nope", x: 0, y: 0 }]));
    expect(added).toEqual([]);
    expect(warn.mock.calls[0][0]).toMatch(/unknown sprite asset/);
  });

  it("showing another map destroys the old images", () => {
    const { scene, added } = fakeScene({ [key]: sky });
    const r = new ImageLayerRenderer(scene, realSprites);
    r.show(exported([{ id: "a", graphicId: "images/sky.png", x: 0, y: 0 }]));
    r.show(exported([]));
    expect(added[0].destroyed).toBe(true);
    expect(r.count).toBe(0);
  });
});
