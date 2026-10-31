import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { hydrateMapEntities, spawnPlayer } from './spawner';
import { World } from './World';
import { TransformComponent } from './components/TransformComponent';
import { ColliderComponent } from './components/ColliderComponent';
import { EventComponent } from './components/EventComponent';
import { EntityInfoComponent } from './components/EntityInfoComponent';
import { SpriteComponent } from './components/SpriteComponent';
import { AnimationComponent } from './components/AnimationComponent';
import { testSprites } from '@/test/helpers';
import type { ExpandContext } from './expand';
import { TagComponent } from './components/TagComponent';
import { AIWanderComponent } from './components/AIWanderComponent';
import { PlayerControlComponent } from './components/PlayerControlComponent';
import { GridMovementComponent } from './components/GridMovementComponent';
import { GAME_CONSTANTS } from '@/constants/game';

let warn: ReturnType<typeof vi.spyOn>;
const sprites = testSprites();
const ctx: ExpandContext = { sprites, warn: (m) => console.warn(m) };
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const SIGN = {
  id: 'e41e2972',
  name: 'Sign / Inspectable',
  x: 336,
  y: 128,
  components: {
    Transform: { x: 336, y: 128, depth: 0 },
    Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true },
    Interactable: { type: 'on_interact', message: 'The ancient sign is faded...', eventKey: '' },
    Tag: { tag: 'sign' },
  },
};

describe('spawnPlayer', () => {
  it('spawns at the map centre using the same math as the original Game.switchMap', () => {
    const w = new World();
    const ts = GAME_CONSTANTS.TILE_SIZE;
    const spawn = spawnPlayer(w, { width: 20, height: 15 }, ts);
    // original: floor(w/2)*ts + ts/2, (floor(h/2)+1)*ts
    expect(spawn.x).toBe(Math.floor(20 / 2) * ts + ts / 2);
    expect(spawn.y).toBe((Math.floor(15 / 2) + 1) * ts);
    const t = w.getComponent(spawn.entity, TransformComponent)!;
    expect([t.x, t.y]).toEqual([spawn.x, spawn.y]);
    expect(t.depth).toBe(GAME_CONSTANTS.PLAYER_DEPTH);
    expect(w.hasComponent(spawn.entity, PlayerControlComponent)).toBe(true);
    expect(w.hasComponent(spawn.entity, GridMovementComponent)).toBe(true);
    expect(w.getComponent(spawn.entity, TagComponent)?.tag).toBe('player');
  });

  it('handles odd and tiny maps', () => {
    const w = new World();
    expect(spawnPlayer(w, { width: 1, height: 1 }, 32)).toMatchObject({ x: 16, y: 32 });
    expect(spawnPlayer(w, { width: 7, height: 9 }, 16)).toMatchObject({ x: 3 * 16 + 8, y: 5 * 16 });
  });
});

describe('hydrateMapEntities', () => {
  it('hydrates a well-formed entity', () => {
    const w = new World();
    const { entities, problems } = hydrateMapEntities(w, [SIGN], ctx);
    expect(problems).toEqual([]);
    expect(entities).toHaveLength(1);
    const e = entities[0];
    expect(w.getComponent(e, TransformComponent)).toMatchObject({ x: 336, y: 128, depth: 0 });
    expect(w.getComponent(e, ColliderComponent)).toMatchObject({ width: 32, height: 32, isSolid: true });
    const event = w.getComponent(e, EventComponent)!;
    expect(event.states).toHaveLength(1);
    expect(event.states[0]).toMatchObject({ trigger: 'action' });
    expect(event.states[0].commands[0]).toMatchObject({ type: 'showText', params: { text: 'The ancient sign is faded...' } });
    expect(w.getComponent(e, EntityInfoComponent)).toMatchObject({ editorId: 'e41e2972', name: 'Sign / Inspectable' });
    expect(w.getComponent(e, TagComponent)?.tag).toBe('sign');
  });

  it('treats missing / null entities as nothing to do', () => {
    const w = new World();
    for (const v of [undefined, null, []]) {
      expect(hydrateMapEntities(w, v)).toEqual({ entities: [], problems: [] });
    }
    expect(w.getAllEntities()).toEqual([]);
  });

  it('reports a non-array entities value', () => {
    const w = new World();
    const r = hydrateMapEntities(w, { not: 'an array' });
    expect(r.entities).toEqual([]);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0].index).toBe(-1);
  });

  it('keeps going past malformed entities and reports each one', () => {
    const w = new World();
    const defs = [
      null,
      'nope',
      42,
      { id: 'a', components: 'not-an-object' },
      { id: 'b', components: { SpriteView: {} } }, // legacy sprite without texture: migrated to "no graphic"
      SIGN,
      { name: 'Ghost', components: { Transform: { x: 1, y: 2 }, Warp: { a: 1 } } }, // unknown comp, entity kept
    ];
    const { entities, problems } = hydrateMapEntities(w, defs, ctx);

    expect(problems.map((p) => p.index)).toEqual([0, 1, 2, 3, 6]);
    expect(problems[4].entity).toBe('Ghost');
    expect(problems[4].message).toMatch(/Unknown component type: Warp/);
    expect(warn).toHaveBeenCalledTimes(problems.length);

    // b, SIGN and Ghost survive
    expect(entities).toHaveLength(3);
    expect(w.getAllEntities()).toEqual(entities);
    expect(w.getComponent(entities[1], TagComponent)?.tag).toBe('sign');
    expect(w.getComponent(entities[2], TransformComponent)).toMatchObject({ x: 1, y: 2 });
  });

  it('rolls back an entity whose expansion throws', () => {
    const w = new World();
    const exploding = { sprites: { meta: () => { throw new Error('boom'); } }, warn: () => {} } as unknown as ExpandContext;
    const { entities, problems } = hydrateMapEntities(
      w,
      [{ id: 'x', components: { Transform: { x: 5, y: 5 }, Sprite: { asset: 'characters/player' } } }],
      exploding,
    );
    expect(entities).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toBe('boom');
    expect(w.getAllEntities()).toEqual([]);
    expect(w.query(TransformComponent)).toEqual([]);
  });

  it('allows an entity without components (as the original loop did)', () => {
    const w = new World();
    const { entities, problems } = hydrateMapEntities(w, [{ id: 'empty' }], ctx);
    expect(problems).toEqual([]);
    expect(entities).toHaveLength(1);
  });

  it('hydrates a legacy editor NPC (migrated on the way in) including AIWander', () => {
    const w = new World();
    const { entities, problems } = hydrateMapEntities(w, [
      {
        name: 'NPC',
        components: {
          Transform: { x: 48, y: 64, depth: 10 },
          SpriteView: { texture: 'npc-walk', frame: 0, originX: 0.5, originY: 1.0, visible: true, alpha: 1.0, flipX: false },
          Collider: { width: 16, height: 8, offsetX: 0, offsetY: 0, isSolid: true },
          GridMovement: { speed: 80, direction: 'down' },
          CharacterAnimation: { characterKey: 'npc', direction: 'down', movementType: 'walk' },
          Interactable: { type: 'on_interact', message: 'Hello traveler!', eventKey: '' },
          AIWander: { radius: 2, interval: 4000, speed: 60 },
          Tag: { tag: 'npc' },
        },
      },
    ], ctx);
    expect(problems).toEqual([]);
    expect(w.getComponent(entities[0], AIWanderComponent)).toMatchObject({ radius: 2, interval: 4000, speed: 60 });
    expect(w.getComponent(entities[0], SpriteComponent)).toMatchObject({ assetId: 'characters/npc' });
    expect(w.getComponent(entities[0], AnimationComponent)).toMatchObject({ assetId: 'characters/npc', hasRun: false });
    expect(w.getComponent(entities[0], EventComponent)!.states[0].commands[0].params.text).toBe('Hello traveler!');
  });
});

describe('real map files', () => {
  const dir = new URL('../../public/data/maps/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('finds map files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s: entities (if any) hydrate with zero problems', (file) => {
    const data = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const w = new World();
    const problems0: string[] = [];
    const { entities, problems } = hydrateMapEntities(w, data.entities, { sprites, warn: (m) => problems0.push(m) });
    expect(problems).toEqual([]);
    expect(entities).toHaveLength(Array.isArray(data.entities) ? data.entities.length : 0);
  });
});
