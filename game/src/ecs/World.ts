import type { Entity } from "./Entity";
import type { ComponentConstructor } from "./Component";
import type { System } from "./System";
import type { Prefab } from "./prefabs/Prefab";

export class World {
  private nextEntityId: Entity = 1;
  private aliveEntities: Set<Entity> = new Set();
  private componentPools: Map<ComponentConstructor<any>, Map<Entity, any>> = new Map();
  private systems: System[] = [];

  // --- Entity Management ---

  public createEntity(): Entity {
    const entity = this.nextEntityId++;
    this.aliveEntities.add(entity);
    return entity;
  }

  public destroyEntity(entity: Entity): void {
    if (!this.aliveEntities.has(entity)) return;

    // Notify systems before removing components
    for (const system of this.systems) {
      system.onEntityDestroyed?.(this, entity);
    }

    // Remove entity from all component pools
    for (const pool of this.componentPools.values()) {
      pool.delete(entity);
    }

    this.aliveEntities.delete(entity);
  }

  public isAlive(entity: Entity): boolean {
    return this.aliveEntities.has(entity);
  }

  public getAllEntities(): Entity[] {
    return Array.from(this.aliveEntities);
  }

  // --- Component Management ---

  public addComponent<T>(entity: Entity, component: T): T {
    if (!this.aliveEntities.has(entity)) {
      throw new Error(`Cannot add component to non-existent entity ${entity}`);
    }

    const ctor = (component as any).constructor as ComponentConstructor<T>;
    let pool = this.componentPools.get(ctor);
    if (!pool) {
      pool = new Map();
      this.componentPools.set(ctor, pool);
    }

    pool.set(entity, component);
    return component;
  }

  public getComponent<T>(entity: Entity, componentClass: ComponentConstructor<T>): T | undefined {
    return this.componentPools.get(componentClass)?.get(entity);
  }

  public hasComponent<T>(entity: Entity, componentClass: ComponentConstructor<T>): boolean {
    return this.componentPools.get(componentClass)?.has(entity) ?? false;
  }

  public removeComponent<T>(entity: Entity, componentClass: ComponentConstructor<T>): void {
    this.componentPools.get(componentClass)?.delete(entity);
  }

  public getComponents(entity: Entity): any[] {
    const components: any[] = [];
    for (const pool of this.componentPools.values()) {
      const comp = pool.get(entity);
      if (comp !== undefined) {
        components.push(comp);
      }
    }
    return components;
  }

  // --- Queries & Views ---

  public query(...componentClasses: ComponentConstructor[]): Entity[] {
    if (componentClasses.length === 0) return [];

    // Find smallest pool to minimize checks
    let smallestPool: Map<Entity, any> | undefined;
    for (const cls of componentClasses) {
      const pool = this.componentPools.get(cls);
      if (!pool || pool.size === 0) return [];
      if (!smallestPool || pool.size < smallestPool.size) {
        smallestPool = pool;
      }
    }

    if (!smallestPool) return [];

    const result: Entity[] = [];
    for (const entity of smallestPool.keys()) {
      if (!this.aliveEntities.has(entity)) continue;

      let match = true;
      for (const cls of componentClasses) {
        const pool = this.componentPools.get(cls);
        if (!pool || !pool.has(entity)) {
          match = false;
          break;
        }
      }

      if (match) {
        result.push(entity);
      }
    }

    return result;
  }

  public view<T1>(c1: ComponentConstructor<T1>): [Entity, T1][];
  public view<T1, T2>(c1: ComponentConstructor<T1>, c2: ComponentConstructor<T2>): [Entity, T1, T2][];
  public view<T1, T2, T3>(
    c1: ComponentConstructor<T1>,
    c2: ComponentConstructor<T2>,
    c3: ComponentConstructor<T3>
  ): [Entity, T1, T2, T3][];
  public view(...classes: ComponentConstructor[]): any[] {
    const entities = this.query(...classes);
    return entities.map((e) => [
      e,
      ...classes.map((cls) => this.componentPools.get(cls)!.get(e)),
    ]);
  }

  // --- Prefab Spawning ---

  public spawnPrefab<TProps>(prefab: Prefab<TProps>, props: TProps): Entity {
    const entity = this.createEntity();
    const components = prefab.build(props);
    for (const component of components) {
      if (component) {
        this.addComponent(entity, component);
      }
    }
    return entity;
  }

  // --- System Lifecycle ---

  public addSystem(system: System): this {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
    return this;
  }

  public removeSystem(system: System): void {
    const idx = this.systems.indexOf(system);
    if (idx !== -1) {
      system.destroy?.(this);
      this.systems.splice(idx, 1);
    }
  }

  public update(delta: number): void {
    for (const system of this.systems) {
      system.update(this, delta);
    }
  }

  public clear(): void {
    const entities = Array.from(this.aliveEntities);
    for (const entity of entities) {
      this.destroyEntity(entity);
    }
    this.componentPools.clear();
    this.aliveEntities.clear();
  }

  public destroy(): void {
    for (const system of this.systems) {
      system.destroy?.(this);
    }
    this.systems = [];
    this.clear();
  }
}
