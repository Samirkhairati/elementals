import type { World } from "./World";
import type { Entity } from "./Entity";

export abstract class System {
  public priority: number = 0;
  public abstract update(world: World, delta: number): void;
  public onEntityDestroyed?(world: World, entity: Entity): void;
  public destroy?(world: World): void;
}
