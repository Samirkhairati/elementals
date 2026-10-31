import { describe, it, expect, beforeEach } from 'vitest';
import type { ComparisonOp, Condition } from '@shared/engine/index.ts';
import { selectActivePage } from './PageSelector';
import { evaluateCondition, compareNumbers } from './conditions';
import { GameFlags } from './GameFlags';
import { Inventory } from './Inventory';
import { makeRig, page, TEST_DB, type Rig } from '@/test/rig';
import { SpriteComponent } from '@/ecs/components/SpriteComponent';
import { AnimationComponent } from '@/ecs/components/AnimationComponent';
import { ColliderComponent } from '@/ecs/components/ColliderComponent';
import { GridMovementComponent } from '@/ecs/components/GridMovementComponent';
import { EventComponent } from '@/ecs/components/EventComponent';
import { spriteTextureKey, objectAnimKey } from '@shared/engine/index.ts';

function ctxOf(state: GameFlags, inventory = new Inventory(), mapId = 'city', entityId = 'npc') {
  return { flags: state, inventory, mapId, entityId };
}

describe('conditions', () => {
  let state: GameFlags;
  let inv: Inventory;
  beforeEach(() => {
    state = new GameFlags(TEST_DB);
    inv = new Inventory();
  });

  it('switch', () => {
    const c: Condition = { kind: 'switch', id: 's1', value: true };
    expect(evaluateCondition(c, ctxOf(state, inv))).toBe(false);
    state.setSwitch('s1', true);
    expect(evaluateCondition(c, ctxOf(state, inv))).toBe(true);
    expect(evaluateCondition({ kind: 'switch', id: 's1', value: false }, ctxOf(state, inv))).toBe(false);
  });

  it('variable: every comparison operator', () => {
    state.setVariable('v1', 5);
    const t = (op: ComparisonOp, value: number) =>
      evaluateCondition({ kind: 'variable', id: 'v1', op, value } as Condition, ctxOf(state, inv));
    expect([t('==', 5), t('==', 4)]).toEqual([true, false]);
    expect([t('!=', 4), t('!=', 5)]).toEqual([true, false]);
    expect([t('>', 4), t('>', 5)]).toEqual([true, false]);
    expect([t('>=', 5), t('>=', 6)]).toEqual([true, false]);
    expect([t('<', 6), t('<', 5)]).toEqual([true, false]);
    expect([t('<=', 5), t('<=', 4)]).toEqual([true, false]);
    expect(compareNumbers(1, '??' as never, 1)).toBe(false);
  });

  it('selfSwitch is scoped to the entity and map in the context', () => {
    const c: Condition = { kind: 'selfSwitch', key: 'B', value: true };
    state.setSelfSwitch('city', 'npc', 'B', true);
    expect(evaluateCondition(c, ctxOf(state, inv, 'city', 'npc'))).toBe(true);
    expect(evaluateCondition(c, ctxOf(state, inv, 'city', 'other'))).toBe(false);
    expect(evaluateCondition(c, ctxOf(state, inv, 'market', 'npc'))).toBe(false);
  });

  it('hasItem uses the inventory stub (count 0 until given)', () => {
    const c: Condition = { kind: 'hasItem', item: 'potion', qty: 2 };
    expect(evaluateCondition(c, ctxOf(state, inv))).toBe(false);
    inv.add('potion', 1);
    expect(evaluateCondition(c, ctxOf(state, inv))).toBe(false);
    inv.add('potion', 1);
    expect(evaluateCondition(c, ctxOf(state, inv))).toBe(true);
  });

  it('malformed conditions are false', () => {
    expect(evaluateCondition({ kind: 'bogus' } as unknown as Condition, ctxOf(state, inv))).toBe(false);
  });
});

describe('selectActivePage', () => {
  it('last page whose conditions all hold wins; pages without conditions always hold', () => {
    const state = new GameFlags(TEST_DB);
    const pages = [
      page([]),
      page([], { conditions: [{ kind: 'switch', id: 's1', value: true }] }),
      page([], { conditions: [{ kind: 'switch', id: 's1', value: true }, { kind: 'variable', id: 'v1', op: '>=', value: 2 }] }),
    ];
    expect(selectActivePage(pages, ctxOf(state))).toBe(0);
    state.setSwitch('s1', true);
    expect(selectActivePage(pages, ctxOf(state))).toBe(1);
    state.setVariable('v1', 2);
    expect(selectActivePage(pages, ctxOf(state))).toBe(2);
    state.setSwitch('s1', false);
    expect(selectActivePage(pages, ctxOf(state))).toBe(0);
  });

  it('is -1 when no page holds', () => {
    const state = new GameFlags(TEST_DB);
    const pages = [page([], { conditions: [{ kind: 'switch', id: 's1', value: true }] })];
    expect(selectActivePage(pages, ctxOf(state))).toBe(-1);
    expect(selectActivePage([], ctxOf(state))).toBe(-1);
  });
});

describe('PageSelector: applying pages', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
  });

  it('applies appearance overrides through the Sprite component and restores them when the page changes back', () => {
    const chest = rig.add({
      sprite: { asset: 'objects/chest', frame: 0 },
      pages: [
        page([]),
        page([], { conditions: [{ kind: 'switch', id: 's1', value: true }], appearance: { frame: 1 } }),
      ],
    });
    const sprite = rig.world.getComponent(chest, SpriteComponent)!;
    expect(sprite.frame).toBe(0);

    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    expect(rig.world.getComponent(chest, EventComponent)!.activePage).toBe(1);
    expect(rig.world.getComponent(chest, SpriteComponent)).toBe(sprite); // same component, updated in place
    expect(sprite.frame).toBe(1);

    rig.runtime.flags.setSwitch('s1', false);
    rig.runtime.update(16);
    expect(sprite.frame).toBe(0);
  });

  it('swaps the asset (character -> object adds/removes the animation component)', () => {
    const e = rig.add({
      sprite: { asset: 'characters/npc' },
      pages: [page([]), page([], { conditions: [{ kind: 'switch', id: 's1', value: true }], appearance: { asset: 'objects/chest', frame: 2 } })],
    });
    expect(rig.world.hasComponent(e, AnimationComponent)).toBe(true);
    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    const sprite = rig.world.getComponent(e, SpriteComponent)!;
    expect(sprite.texture).toBe(spriteTextureKey('objects/chest', 'sheet'));
    expect(sprite.frame).toBe(2);
    expect(rig.world.hasComponent(e, AnimationComponent)).toBe(false);
  });

  it('a named animation of the asset plays as the sprite animation', () => {
    const e = rig.add({
      sprite: { asset: 'objects/chest' },
      pages: [page([]), page([], { conditions: [{ kind: 'switch', id: 's1', value: true }], appearance: { animation: 'shine' } })],
    });
    expect(rig.world.getComponent(e, SpriteComponent)!.animKey).toBeUndefined();
    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    expect(rig.world.getComponent(e, SpriteComponent)!.animKey).toBe(objectAnimKey('objects/chest', 'shine'));
  });

  it('visible: false hides the sprite; facing turns the entity', () => {
    const e = rig.add({
      sprite: { asset: 'characters/npc', facing: 'down' },
      movement: { controller: 'none' },
      pages: [page([]), page([], { conditions: [{ kind: 'switch', id: 's1', value: true }], appearance: { visible: false, facing: 'left' } })],
    });
    expect(rig.world.getComponent(e, SpriteComponent)!.visible).toBe(true);
    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    expect(rig.world.getComponent(e, SpriteComponent)!.visible).toBe(false);
    expect(rig.world.getComponent(e, GridMovementComponent)!.direction).toBe('left');
    expect(rig.world.getComponent(e, AnimationComponent)!.direction).toBe('left');
  });

  it('solid override replaces Collider.isSolid and null keeps the authored value', () => {
    const e = rig.add({
      collider: { isSolid: true },
      pages: [page([]), page([], { conditions: [{ kind: 'switch', id: 's1', value: true }], solid: false })],
    });
    const collider = rig.world.getComponent(e, ColliderComponent)!;
    expect(collider.isSolid).toBe(true);
    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    expect(collider.isSolid).toBe(false);
    rig.runtime.flags.setSwitch('s1', false);
    rig.runtime.update(16);
    expect(collider.isSolid).toBe(true);

    const passable = rig.add({ collider: { isSolid: false }, pages: [page([], { solid: null })] });
    expect(rig.world.getComponent(passable, ColliderComponent)!.isSolid).toBe(false);
  });

  it('a page can make an entity solid that was not (solid: true)', () => {
    const e = rig.add({ collider: { isSolid: false }, pages: [page([], { solid: true })] });
    expect(rig.world.getComponent(e, ColliderComponent)!.isSolid).toBe(true);
  });

  it('an unknown override asset warns and keeps the authored graphic', () => {
    const e = rig.add({
      sprite: { asset: 'objects/chest', frame: 1 },
      pages: [page([], { appearance: { asset: 'objects/missing' } })],
    });
    expect(rig.warnings.some((w) => w.includes('objects/missing'))).toBe(true);
    const sprite = rig.world.getComponent(e, SpriteComponent)!;
    expect(sprite.assetId).toBe('objects/chest');
    expect(sprite.frame).toBe(1);
  });

  it('an entity with no active page is inactive: hidden and not solid', () => {
    const e = rig.add({
      pages: [page([], { conditions: [{ kind: 'switch', id: 's1', value: true }] })],
    });
    expect(rig.world.getComponent(e, EventComponent)!.activePage).toBe(-1);
    expect(rig.world.getComponent(e, SpriteComponent)!.visible).toBe(false);
    expect(rig.world.getComponent(e, ColliderComponent)!.isSolid).toBe(false);
    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    expect(rig.world.getComponent(e, SpriteComponent)!.visible).toBe(true);
    expect(rig.world.getComponent(e, ColliderComponent)!.isSolid).toBe(true);
  });

  it('re-evaluates on self switch and inventory changes; only applies overrides on a page CHANGE', () => {
    const e = rig.add({
      id: 'chest1',
      sprite: { asset: 'objects/chest', frame: 0 },
      pages: [
        page([]),
        page([], { conditions: [{ kind: 'selfSwitch', key: 'A', value: true }], appearance: { frame: 1 } }),
        page([], { conditions: [{ kind: 'hasItem', item: 'key', qty: 1 }], appearance: { frame: 2 } }),
      ],
    });
    const sprite = rig.world.getComponent(e, SpriteComponent)!;
    rig.runtime.flags.setSelfSwitch('test', 'chest1', 'A', true);
    rig.runtime.update(16);
    expect(sprite.frame).toBe(1);
    sprite.frame = 7; // a runtime tweak survives while the page stays active
    rig.runtime.flags.setSwitch('s2', true);
    rig.runtime.update(16);
    expect(sprite.frame).toBe(7);
    rig.runtime.inventory.add('key');
    rig.runtime.update(16);
    expect(sprite.frame).toBe(2);
  });
});
