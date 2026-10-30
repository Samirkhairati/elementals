import { describe, it, expect } from "vitest";
import { World } from "@/ecs/World";
import { TransformComponent } from "@/ecs/components/TransformComponent";
import { ColliderComponent } from "@/ecs/components/ColliderComponent";
import { InteractableComponent } from "@/ecs/components/InteractableComponent";
import { hydrateMapEntities } from "@/ecs/spawner";
import { collectEntityInteractables } from "./entityInteractables";

const TILE = 32;

function spawn(world: World, x: number, y: number, init?: ConstructorParameters<typeof InteractableComponent>[0]) {
  const e = world.createEntity();
  world.addComponent(e, new TransformComponent({ x, y }));
  world.addComponent(e, new InteractableComponent(init));
  return e;
}

describe("collectEntityInteractables", () => {
  it("returns nothing for a world without interactables", () => {
    const world = new World();
    const e = world.createEntity();
    world.addComponent(e, new TransformComponent({ x: 10, y: 10 }));
    expect(collectEntityInteractables(world, TILE)).toEqual([]);
  });

  it("registers the tile above the feet position for a default (tile-sized) footprint", () => {
    const world = new World();
    spawn(world, 48, 64, { message: "hi" }); // feet at (48,64): x-range 32..64, y-range 32..64
    const result = collectEntityInteractables(world, TILE);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x: 1, y: 1, type: "on_interact", message: "hi" });
  });

  it("covers every tile of a larger collider footprint", () => {
    const world = new World();
    const e = spawn(world, 64, 64, { message: "big" });
    world.addComponent(e, new ColliderComponent({ width: 64, height: 64, isSolid: true }));
    const tiles = collectEntityInteractables(world, TILE).map((i) => `${i.x},${i.y}`).sort();
    expect(tiles).toEqual(["1,0", "1,1", "2,0", "2,1"]);
  });

  it("follows the entity when it moves (wandering NPC keeps its dialogue)", () => {
    const world = new World();
    const e = spawn(world, 48, 64, { message: "elder" });
    const before = collectEntityInteractables(world, TILE)[0];
    world.getComponent(e, TransformComponent)!.x += TILE * 2;
    const after = collectEntityInteractables(world, TILE)[0];
    expect(after.x).toBe(before.x + 2);
    expect(after.y).toBe(before.y);
    expect(after.message).toBe("elder");
  });

  it("carries warp targets", () => {
    const world = new World();
    spawn(world, 16, 32, { type: "on_step", targetMap: "market", targetX: 3, targetY: 4 });
    expect(collectEntityInteractables(world, TILE)[0]).toMatchObject({
      type: "on_step",
      targetMap: "market",
      targetX: 3,
      targetY: 4,
    });
  });

  it("falls back to the editor entity name when no message was authored", () => {
    const world = new World();
    const { entities } = hydrateMapEntities(world, [
      { name: "Old Sign", components: { Transform: { x: 16, y: 32 }, Interactable: {} } },
      { name: "Chest", components: { Transform: { x: 80, y: 32 }, Interactable: { message: "Open!" } } },
    ]);
    expect(entities).toHaveLength(2);
    const messages = collectEntityInteractables(world, TILE).map((i) => i.message).sort();
    expect(messages).toEqual(["Old Sign", "Open!"]);
  });
});
