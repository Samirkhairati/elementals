import { describe, expect, it } from 'vitest';
import { charactersForMap } from './preloadSets';

const node = (id: string, type: string, params: Record<string, unknown>) => ({ id, type, params, out: {}, x: 0, y: 0 });
const entity = (id: string, sprite: Record<string, unknown> | null, states: unknown[] = []) => ({ id, name: id, components: { ...(sprite ? { Sprite: sprite } : {}), ...(states.length ? { Event: { states } } : {}) } });

describe('charactersForMap', () => {
  const map = {
    entities: [
      entity('a', { asset: 'characters/npc-red' }),
      entity('b', { asset: 'objects/chest' }, [{ name: 's', appearance: { asset: 'objects/chest-open' }, graph: { nodes: [node('c', 'changeSprite', { asset: 'objects/chest-empty' })] } }]),
      entity('c', null),
    ],
  };

  it('always includes the player, plus entity sprites, state appearances and Change Sprite targets', () => {
    expect(charactersForMap(map)).toEqual(['characters/npc-red', 'characters/player', 'objects/chest', 'objects/chest-empty', 'objects/chest-open']);
  });

  it('adds extra ids (saved appearance overrides) and survives maps without entities or junk', () => {
    expect(charactersForMap({ entities: [] }, ['characters/outfit'])).toEqual(['characters/outfit', 'characters/player']);
    for (const junk of [undefined, null, 5, {}, { entities: 'x' }]) expect(charactersForMap(junk)).toEqual(['characters/player']);
  });
});
