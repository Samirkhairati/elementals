import { describe, expect, it } from "vitest";
import { convertEditorMapToTiled } from "@shared/mapExport.ts";
import { World } from "@/ecs/World";
import { hydrateMapEntities } from "@/ecs/spawner";
import { TransformComponent } from "@/ecs/components/TransformComponent";
import { SpriteComponent } from "@/ecs/components/SpriteComponent";
import { GridMovementComponent } from "@/ecs/components/GridMovementComponent";
import { ParentComponent } from "@/ecs/components/ParentComponent";
import { ParentFollowSystem, entitiesById, rotateAround } from "@/ecs/systems/ParentFollowSystem";
import { testSprites } from "@/test/helpers";
import { readImageObjects, type ImageObject, type ImageObjectDef } from "./imageLayers";
import { AttachedImagesSystem } from "./attachedImages";

// An NPC (an entity) holding a hat (a sprite) and a lantern (an entity with its own sprite), as the editor saves it.
const npc = (extra: Record<string, unknown> = {}) => ({
  id: "npc",
  type: "entity",
  name: "Elder",
  x: 80,
  y: 128,
  components: { Transform: { x: 80, y: 128, depth: 10 } },
  ...extra,
  children: [
    { id: "npc-sprite", type: "animatedSprite", name: "AnimatedSprite", props: { asset: "characters/npc" }, children: [] },
    { id: "hat", type: "picture", name: "Hat", graphicId: "items/hat.png", x: 80, y: 100, children: [] },
    {
      id: "lantern",
      type: "entity",
      name: "Lantern",
      x: 96,
      y: 128,
      components: { Transform: { x: 96, y: 128, depth: 10 } },
      children: [{ id: "lantern-sprite", type: "animatedSprite", name: "AnimatedSprite", props: { asset: "characters/npc" }, children: [] }],
    },
  ],
});

function exportMap(nodes: object[]) {
  const map = { name: "town", width: 10, height: 10, schemaVersion: 8, nodes };
  return JSON.parse(JSON.stringify(convertEditorMapToTiled(map as never, [])));
}

class FakeImage implements ImageObject {
  width = 16;
  height = 16;
  depth = 0;
  angle = 0;
  visible = true;
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  setOrigin() {}
  setDepth(d: number) { this.depth = d; }
  setAlpha() {}
  setFlip() {}
  setAngle(a: number) { this.angle = a; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; }
  setVisible(v: boolean) { this.visible = v; }
  setDisplaySize() {}
  destroy() {}
}

function load(nodes: object[]) {
  const raw = exportMap(nodes);
  const world = new World();
  hydrateMapEntities(world, raw.entities, { sprites: testSprites(), warn: () => {} });
  const ids = entitiesById(world);
  const items: { image: ImageObject; def: ImageObjectDef }[] = readImageObjects(raw).map((def) => ({ image: new FakeImage(def.x, def.y), def }));
  const depths = new Map<number, number>();
  world.addSystem(new ParentFollowSystem());
  const attached = new AttachedImagesSystem({ items: () => items, spriteDepth: (e) => depths.get(e) });
  world.addSystem(attached);
  const at = (id: string) => world.getComponent(ids.get(id)!, TransformComponent)!;
  const sprite = (id: string) => world.getComponent(ids.get(id)!, SpriteComponent)!;
  return { raw, world, ids, items, at, sprite, depths, attached };
}

describe("export: what sits in an entity", () => {
  it("marks child entities and sprites with the entity they sit in", () => {
    const raw = exportMap([{ id: "g", type: "group", name: "Town", children: [npc()] }]);
    const lantern = raw.entities.find((e: { id: string }) => e.id === "lantern");
    const elder = raw.entities.find((e: { id: string }) => e.id === "npc");
    expect(lantern.parent).toBe("npc");
    expect(elder.parent).toBeUndefined();
    expect(readImageObjects(raw)).toEqual([expect.objectContaining({ name: "Hat", parent: "npc" })]);
  });

  it("a sprite in a plain Node has no parent (it stays baked into the scenery)", () => {
    const raw = exportMap([{ id: "g", type: "group", name: "Town", children: [{ id: "tree", type: "picture", name: "Tree", graphicId: "t.png", x: 1, y: 2, children: [] }] }]);
    expect(readImageObjects(raw)[0].parent).toBeUndefined();
  });
});

describe("entities and pictures travel with the entity they sit in", () => {
  it("moving the entity moves its child entity (step in progress too) and its pictures by the same amount", () => {
    const { world, ids, items, at, attached } = load([npc()]);
    world.update(16); // first frame: offsets are taken
    expect(attached.count).toBe(1);
    const grid = world.getComponent(ids.get("lantern")!, GridMovementComponent);
    if (grid) Object.assign(grid, { isMoving: true, startX: 96, startY: 128, targetX: 128, targetY: 128 });

    at("npc").x += 32;
    at("npc").y += 16;
    world.update(16);
    expect(at("lantern")).toMatchObject({ x: 128, y: 144 });
    if (grid) expect(grid).toMatchObject({ startX: 128, targetX: 160, startY: 144 });
    expect(items[0].image).toMatchObject({ x: 112, y: 116 });
  });

  it("the child keeps moving on its own on top of what it inherits", () => {
    const { world, at } = load([npc()]);
    world.update(16);
    at("lantern").x += 5; // its own step
    at("npc").x += 10;
    world.update(16);
    expect(at("lantern").x).toBe(96 + 5 + 10);
  });

  it("hiding the entity hides its child entity and pictures; showing it shows them again", () => {
    const { world, items, sprite } = load([npc()]);
    world.update(16);
    sprite("npc").visible = false;
    world.update(16);
    expect(sprite("lantern").hiddenByParent).toBe(true);
    expect(sprite("lantern").visible).toBe(true); // its own visibility is left alone
    expect(items[0].image.visible).toBe(false);
    sprite("npc").visible = true;
    world.update(16);
    expect(sprite("lantern").hiddenByParent).toBe(false);
    expect(items[0].image.visible).toBe(true);
  });

  it("turning the entity's sprite turns the children around its anchor", () => {
    const { world, items, at, sprite } = load([npc()]);
    world.update(16);
    sprite("npc").angle = 90;
    world.update(16);
    expect(at("lantern").x).toBeCloseTo(80);
    expect(at("lantern").y).toBeCloseTo(144); // 16 px right of the anchor -> 16 px below it
    expect(sprite("lantern").angle).toBe(90);
    expect(items[0].image.x).toBeCloseTo(108); // 28 px above -> 28 px right
    expect(items[0].image.angle).toBe(90);
  });

  it("pictures draw just above their entity's sprite; an erased entity takes them away", () => {
    const { world, ids, items, depths } = load([npc()]);
    depths.set(ids.get("npc")!, 20.5);
    world.update(16);
    expect(items[0].image.depth).toBeGreaterThan(20.5);
    expect(items[0].image.depth).toBeLessThan(20.51);
    world.destroyEntity(ids.get("npc")!);
    world.update(16);
    expect(items[0].image.visible).toBe(false);
  });

  it("a whole chain moves in one frame, parents first", () => {
    const deep = npc();
    (deep.children[2] as { children: object[] }).children.push({
      id: "flame",
      type: "entity",
      name: "Flame",
      x: 96,
      y: 112,
      components: { Transform: { x: 96, y: 112, depth: 10 } },
      children: [],
    });
    const { world, ids, at } = load([deep]);
    expect(world.getComponent(ids.get("flame")!, ParentComponent)?.parentId).toBe("lantern");
    world.update(16);
    at("npc").x += 32;
    world.update(16);
    expect(at("flame").x).toBe(128);
  });
});

describe("rotateAround", () => {
  it("turns clockwise on screen (y down)", () => {
    const p = rotateAround(10, 0, 0, 0, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });
});
