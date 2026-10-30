import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createComponentFromData,
  COMPONENT_TYPE_NAMES,
  ComponentDataError,
  isComponentTypeName,
} from './componentFactory';
import { TransformComponent } from './components/TransformComponent';
import { SpriteComponent } from './components/SpriteComponent';
import { ColliderComponent } from './components/ColliderComponent';
import { GridMovementComponent } from './components/GridMovementComponent';
import { FreeMovementComponent } from './components/FreeMovementComponent';
import { PlayerControlComponent } from './components/PlayerControlComponent';
import { AnimationComponent } from './components/AnimationComponent';
import { InteractableComponent } from './components/InteractableComponent';
import { AIWanderComponent } from './components/AIWanderComponent';
import { TagComponent } from './components/TagComponent';

/** Minimal valid props per type, used to prove every type name is handled. */
const MINIMAL_PROPS: Record<string, Record<string, unknown>> = {
  SpriteView: { texture: 'tex' },
  CharacterAnimation: { characterKey: 'player' },
};

/**
 * The editor's `ComponentType` union is the source of truth for names in map JSON.
 * Parse it straight from the editor source so the two cannot drift silently.
 */
function editorComponentTypes(): string[] {
  const file = new URL('../../../editor/src/types/editor.ts', import.meta.url);
  const text = readFileSync(file, 'utf8');
  const match = text.match(/export type ComponentType\s*=([^]*?)\n\n/);
  if (!match) throw new Error('Could not find ComponentType union in editor/src/types/editor.ts');
  return [...match[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
}

describe('createComponentFromData: type coverage', () => {
  it('handles every ComponentType declared by the editor (and nothing else)', () => {
    const editorTypes = editorComponentTypes();
    expect(editorTypes.length).toBeGreaterThanOrEqual(10);
    expect([...COMPONENT_TYPE_NAMES].sort()).toEqual([...editorTypes].sort());
    for (const type of editorTypes) {
      const c = createComponentFromData(type, MINIMAL_PROPS[type] ?? {});
      expect(c, type).not.toBeNull();
    }
  });

  it('pins the expected editor names (guards the parser above)', () => {
    expect([...COMPONENT_TYPE_NAMES].sort()).toEqual(
      [
        'Transform', 'SpriteView', 'Collider', 'GridMovement', 'FreeMovement',
        'PlayerControl', 'CharacterAnimation', 'Interactable', 'AIWander', 'Tag',
      ].sort(),
    );
  });

  it('returns null and warns for unknown types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createComponentFromData('Bogus', {})).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Bogus'));
    warn.mockRestore();
  });

  it('records the warning via the onWarning sink instead of console when given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sink = vi.fn();
    expect(createComponentFromData('Nope', {}, sink)).toBeNull();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not treat Object.prototype keys as component types', () => {
    const sink = vi.fn();
    for (const t of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(isComponentTypeName(t)).toBe(false);
      expect(createComponentFromData(t, {}, sink)).toBeNull();
    }
    expect(sink).toHaveBeenCalledTimes(4);
  });
});

describe('createComponentFromData: values', () => {
  it('Transform: valid values, string numbers, defaults', () => {
    const t = createComponentFromData('Transform', { x: 336, y: '128', depth: 0 });
    expect(t).toBeInstanceOf(TransformComponent);
    expect(t).toMatchObject({ x: 336, y: 128, depth: 0 });
    expect(createComponentFromData('Transform', {})).toMatchObject({ x: 0, y: 0, depth: 10 });
  });

  it('coerces bad numbers (NaN, Infinity, empty string, null, objects) to defaults', () => {
    const t = createComponentFromData('Transform', { x: NaN, y: Infinity, depth: '' });
    expect(t).toMatchObject({ x: 0, y: 0, depth: 10 });
    const t2 = createComponentFromData('Transform', { x: null, y: {}, depth: 'abc' });
    expect(t2).toMatchObject({ x: 0, y: 0, depth: 10 });
  });

  it('tolerates non-object props (null, undefined, arrays, strings)', () => {
    for (const bad of [null, undefined, [], 'x', 5]) {
      expect(createComponentFromData('Collider', bad)).toMatchObject({ width: 16, height: 8, isSolid: true });
    }
  });

  it('ignores unknown props', () => {
    const c = createComponentFromData('Collider', { width: 5, evil: 1, __proto__: { x: 1 } });
    expect(c).toBeInstanceOf(ColliderComponent);
    expect(c).toMatchObject({ width: 5 });
    expect('evil' in (c as object)).toBe(false);
  });

  it('Collider: booleans from boolean / "true" / "false", else default', () => {
    expect(createComponentFromData('Collider', { isSolid: false }).isSolid).toBe(false);
    expect(createComponentFromData('Collider', { isSolid: 'false' }).isSolid).toBe(false);
    expect(createComponentFromData('Collider', { isSolid: 'true' }).isSolid).toBe(true);
    expect(createComponentFromData('Collider', { isSolid: 'maybe' }).isSolid).toBe(true);
    expect(createComponentFromData('Collider', { isSolid: 0 }).isSolid).toBe(true);
  });

  it('SpriteView: requires a texture, accepts numeric or named frames', () => {
    const s = createComponentFromData('SpriteView', { texture: 'player-walk', frame: 0, flipX: true, alpha: '0.5' });
    expect(s).toBeInstanceOf(SpriteComponent);
    expect(s).toMatchObject({ texture: 'player-walk', frame: 0, flipX: true, alpha: 0.5, originX: 0.5, originY: 1, visible: true });
    expect(createComponentFromData('SpriteView', { texture: 't', frame: 'idle' }).frame).toBe('idle');
    expect(() => createComponentFromData('SpriteView', {})).toThrow(ComponentDataError);
    expect(() => createComponentFromData('SpriteView', { texture: 5 })).toThrow(/texture/);
    expect(() => createComponentFromData('SpriteView', { texture: '' })).toThrow(ComponentDataError);
  });

  it('GridMovement / FreeMovement: validate direction', () => {
    const g = createComponentFromData('GridMovement', { speed: 80, direction: 'left' });
    expect(g).toBeInstanceOf(GridMovementComponent);
    expect(g).toMatchObject({ speed: 80, direction: 'left' });
    expect(createComponentFromData('GridMovement', { direction: 'sideways' }).direction).toBe('down');
    const f = createComponentFromData('FreeMovement', { speed: '90', direction: 'up' });
    expect(f).toBeInstanceOf(FreeMovementComponent);
    expect(f).toMatchObject({ speed: 90, direction: 'up' });
  });

  it('PlayerControl takes no props', () => {
    expect(createComponentFromData('PlayerControl', { isMovementLocked: true })).toBeInstanceOf(PlayerControlComponent);
  });

  it('CharacterAnimation: requires characterKey, validates enums', () => {
    const a = createComponentFromData('CharacterAnimation', { characterKey: 'npc', direction: 'right', movementType: 'run' });
    expect(a).toBeInstanceOf(AnimationComponent);
    expect(a).toMatchObject({ characterKey: 'npc', direction: 'right', movementType: 'run' });
    const d = createComponentFromData('CharacterAnimation', { characterKey: 'npc', direction: 'x', movementType: 'fly' });
    expect(d).toMatchObject({ direction: 'down', movementType: 'walk' });
    expect(() => createComponentFromData('CharacterAnimation', {})).toThrow(ComponentDataError);
  });

  it('Interactable: validates trigger type, keeps strings and numbers', () => {
    const i = createComponentFromData('Interactable', {
      type: 'on_step', message: 'hi', eventKey: 'WARP', targetMap: 'city', targetX: '3', targetY: 4,
    });
    expect(i).toBeInstanceOf(InteractableComponent);
    expect(i).toMatchObject({ type: 'on_step', message: 'hi', eventKey: 'WARP', targetMap: 'city', targetX: 3, targetY: 4 });
    expect(createComponentFromData('Interactable', { type: 'weird' }).type).toBe('on_interact');
    expect(createComponentFromData('Interactable', { message: 5 }).message).toBeUndefined();
  });

  it('AIWander: applies the same defaults as the editor schema', () => {
    const w = createComponentFromData('AIWander', {});
    expect(w).toBeInstanceOf(AIWanderComponent);
    expect(w).toMatchObject({ radius: 3, interval: 4000, speed: 60 });
    expect(createComponentFromData('AIWander', { radius: 2, interval: '1500', speed: 'x' })).toMatchObject({
      radius: 2, interval: 1500, speed: 60,
    });
  });

  it('Tag: string tag or "entity" fallback', () => {
    expect(createComponentFromData('Tag', { tag: 'npc' })).toBeInstanceOf(TagComponent);
    expect(createComponentFromData('Tag', { tag: 'npc' }).tag).toBe('npc');
    expect(createComponentFromData('Tag', {}).tag).toBe('entity');
    expect(createComponentFromData('Tag', { tag: '' }).tag).toBe('entity');
    expect(createComponentFromData('Tag', { tag: 7 }).tag).toBe('entity');
  });
});
