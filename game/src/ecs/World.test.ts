import { describe, it, expect, vi } from 'vitest';
import { World } from './World';
import { System } from './System';
import { definePrefab } from './prefabs/Prefab';

class A {
  value = 1;
}
class B {
  value = 2;
}
class C {}

class RecordingSystem extends System {
  public log: string[];
  public destroyedEntities: number[] = [];
  public sawComponentOnDestroy: boolean[] = [];
  private name: string;
  constructor(name: string, priority: number, log: string[]) {
    super();
    this.name = name;
    this.priority = priority;
    this.log = log;
  }
  update() {
    this.log.push(this.name);
  }
  onEntityDestroyed(world: World, entity: number) {
    this.destroyedEntities.push(entity);
    this.sawComponentOnDestroy.push(world.hasComponent(entity, A));
  }
  destroy() {
    this.log.push(`destroy:${this.name}`);
  }
}

describe('World entities', () => {
  it('creates unique incrementing entities that are alive', () => {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    expect(e1).not.toBe(e2);
    expect(w.isAlive(e1)).toBe(true);
    expect(w.getAllEntities()).toEqual([e1, e2]);
  });

  it('destroys entities and removes their components', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, new A());
    w.destroyEntity(e);
    expect(w.isAlive(e)).toBe(false);
    expect(w.hasComponent(e, A)).toBe(false);
    expect(w.getAllEntities()).toEqual([]);
  });

  it('ignores destroying an unknown / already destroyed entity', () => {
    const w = new World();
    const sys = new RecordingSystem('s', 0, []);
    w.addSystem(sys);
    const e = w.createEntity();
    w.destroyEntity(e);
    w.destroyEntity(e);
    w.destroyEntity(999);
    expect(sys.destroyedEntities).toEqual([e]);
  });

  it('does not reuse destroyed entity ids', () => {
    const w = new World();
    const e1 = w.createEntity();
    w.destroyEntity(e1);
    expect(w.createEntity()).not.toBe(e1);
  });

  it('calls system.onEntityDestroyed before removing components', () => {
    const w = new World();
    const sys = new RecordingSystem('s', 0, []);
    w.addSystem(sys);
    const e = w.createEntity();
    w.addComponent(e, new A());
    w.destroyEntity(e);
    expect(sys.destroyedEntities).toEqual([e]);
    expect(sys.sawComponentOnDestroy).toEqual([true]);
  });
});

describe('World components', () => {
  it('adds, gets, has and removes components', () => {
    const w = new World();
    const e = w.createEntity();
    const a = new A();
    expect(w.addComponent(e, a)).toBe(a);
    expect(w.getComponent(e, A)).toBe(a);
    expect(w.hasComponent(e, A)).toBe(true);
    expect(w.hasComponent(e, B)).toBe(false);
    expect(w.getComponent(e, B)).toBeUndefined();
    w.removeComponent(e, A);
    expect(w.hasComponent(e, A)).toBe(false);
    w.removeComponent(e, B); // no-op
  });

  it('replaces an existing component of the same type', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, new A());
    const a2 = new A();
    w.addComponent(e, a2);
    expect(w.getComponent(e, A)).toBe(a2);
  });

  it('lists all components of an entity', () => {
    const w = new World();
    const e = w.createEntity();
    const a = new A();
    const b = new B();
    w.addComponent(e, a);
    w.addComponent(e, b);
    expect(w.getComponents(e)).toEqual(expect.arrayContaining([a, b]));
    expect(w.getComponents(e)).toHaveLength(2);
  });

  it('throws when adding a component to a dead or unknown entity', () => {
    const w = new World();
    const e = w.createEntity();
    w.destroyEntity(e);
    expect(() => w.addComponent(e, new A())).toThrow(/non-existent entity/);
    expect(() => w.addComponent(12345, new A())).toThrow();
  });
});

describe('World queries', () => {
  function setup() {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    const e3 = w.createEntity();
    w.addComponent(e1, new A());
    w.addComponent(e1, new B());
    w.addComponent(e2, new A());
    w.addComponent(e3, new A());
    w.addComponent(e3, new B());
    return { w, e1, e2, e3 };
  }

  it('returns [] for empty class lists and unused component types', () => {
    const { w } = setup();
    expect(w.query()).toEqual([]);
    expect(w.query(C)).toEqual([]);
    expect(w.query(A, C)).toEqual([]);
  });

  it('matches only entities having all components', () => {
    const { w, e1, e2, e3 } = setup();
    expect(w.query(A)).toEqual([e1, e2, e3]);
    expect(w.query(A, B)).toEqual([e1, e3]);
    expect(w.query(B, A)).toEqual([e1, e3]);
  });

  it('iterates the smallest pool (result order follows that pool)', () => {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    const e3 = w.createEntity();
    // A pool: e1, e2, e3. B pool (smaller): inserted e3 then e1.
    for (const e of [e1, e2, e3]) w.addComponent(e, new A());
    w.addComponent(e3, new B());
    w.addComponent(e1, new B());
    // smallest pool is B (size 2) -> order e3, e1 regardless of argument order
    expect(w.query(A, B)).toEqual([e3, e1]);
    expect(w.query(B, A)).toEqual([e3, e1]);
  });

  it('stops matching entities after component removal or destruction', () => {
    const { w, e1, e2, e3 } = setup();
    w.removeComponent(e1, B);
    w.destroyEntity(e3);
    expect(w.query(A, B)).toEqual([]);
    expect(w.query(A)).toEqual([e1, e2]);
  });

  it('view returns tuples of entity + components', () => {
    const { w, e1, e3 } = setup();
    const rows = w.view(A, B);
    expect(rows.map((r) => r[0])).toEqual([e1, e3]);
    for (const [e, a, b] of rows) {
      expect(a).toBe(w.getComponent(e, A));
      expect(b).toBe(w.getComponent(e, B));
    }
    expect(w.view(C)).toEqual([]);
  });
});

describe('World prefabs', () => {
  it('spawnPrefab builds an entity from the prefab, skipping falsy entries', () => {
    const w = new World();
    const prefab = definePrefab<{ n: number }>({
      name: 'P',
      build: (p) => {
        const a = new A();
        a.value = p.n;
        return [a, null, undefined, new B()];
      },
    });
    const e = w.spawnPrefab(prefab, { n: 42 });
    expect(w.isAlive(e)).toBe(true);
    expect(w.getComponent(e, A)?.value).toBe(42);
    expect(w.hasComponent(e, B)).toBe(true);
    expect(w.getComponents(e)).toHaveLength(2);
  });
});

describe('World systems', () => {
  it('runs systems sorted by priority regardless of insertion order', () => {
    const w = new World();
    const log: string[] = [];
    w.addSystem(new RecordingSystem('c', 300, log));
    w.addSystem(new RecordingSystem('a', 100, log));
    w.addSystem(new RecordingSystem('b', 200, log));
    w.update(16);
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('passes delta to systems and addSystem is chainable', () => {
    const w = new World();
    const update = vi.fn();
    class S extends System {
      update = update;
    }
    expect(w.addSystem(new S())).toBe(w);
    w.update(33);
    expect(update).toHaveBeenCalledWith(w, 33);
  });

  it('removeSystem destroys and stops running the system', () => {
    const w = new World();
    const log: string[] = [];
    const s = new RecordingSystem('x', 0, log);
    w.addSystem(s);
    w.removeSystem(s);
    w.removeSystem(s); // second removal is a no-op
    w.update(1);
    expect(log).toEqual(['destroy:x']);
  });

  it('clear destroys all entities (notifying systems) but keeps systems', () => {
    const w = new World();
    const log: string[] = [];
    const s = new RecordingSystem('x', 0, log);
    w.addSystem(s);
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    w.addComponent(e1, new A());
    w.clear();
    expect(w.getAllEntities()).toEqual([]);
    expect(s.destroyedEntities).toEqual([e1, e2]);
    expect(w.query(A)).toEqual([]);
    w.update(1);
    expect(log).toEqual(['x']);
  });

  it('destroy tears down systems and clears entities', () => {
    const w = new World();
    const log: string[] = [];
    w.addSystem(new RecordingSystem('x', 0, log));
    w.createEntity();
    w.destroy();
    expect(log).toEqual(['destroy:x']);
    expect(w.getAllEntities()).toEqual([]);
    w.update(1);
    expect(log).toEqual(['destroy:x']);
  });
});
