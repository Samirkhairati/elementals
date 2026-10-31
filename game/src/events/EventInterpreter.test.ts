import { describe, it, expect, beforeEach } from 'vitest';
import { makeRig, cmd, page, type Rig } from '@/test/rig';
import { EventInterpreter, YIELD_EVERY_COMMANDS } from './EventInterpreter';
import { registerCommandHandler } from './commands';
import { SpriteComponent } from '@/ecs/components/SpriteComponent';
import { AnimationComponent } from '@/ecs/components/AnimationComponent';
import { GridMovementComponent } from '@/ecs/components/GridMovementComponent';
import { TransformComponent } from '@/ecs/components/TransformComponent';
import { objectAnimKey, spriteTextureKey } from '@shared/engine/index.ts';
import { gameState } from '@/core/GameState';

let rig: Rig;
beforeEach(() => {
  rig = makeRig();
});

const choice = (id: string, label: string) => ({ id, label });

describe('dialogue commands', () => {
  it('showText sends speaker + text and waits for the player to dismiss it', async () => {
    rig.ui.autoDismiss = false;
    const run = rig.runCommands([
      cmd('showText', { speaker: 'Elder', text: 'Hello' }),
      cmd('setSwitch', { id: 's1', value: true }),
    ])!;
    await rig.advance();
    expect(rig.ui.texts).toEqual([{ speaker: 'Elder', text: 'Hello' }]);
    expect(rig.runtime.state.getSwitch('s1')).toBe(false); // still waiting
    rig.ui.dismiss();
    await run.done;
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
  });

  it('showText with neither speaker nor text is skipped', async () => {
    const run = rig.runCommands([cmd('showText', { speaker: ' ', text: '' })])!;
    await run.done;
    expect(rig.ui.texts).toEqual([]);
  });

  it('showChoices routes to the branch of the chosen option', async () => {
    rig.ui.choiceAnswers = [1];
    const run = rig.runCommands([
      cmd('showChoices', { options: [choice('a', 'Yes'), choice('b', 'No')], cancel: 'none' }, {
        a: [cmd('setSwitch', { id: 's1', value: true })],
        b: [cmd('setSwitch', { id: 's2', value: true })],
      }),
    ])!;
    await run.done;
    expect(rig.ui.choices[0]).toEqual({ options: ['Yes', 'No'], allowCancel: false });
    expect(rig.runtime.state.getSwitch('s1')).toBe(false);
    expect(rig.runtime.state.getSwitch('s2')).toBe(true);
  });

  const cancelCases: Array<['none' | 'last' | 'branch', string, string]> = [
    ['last', 'opt2', 'allowCancel'],
    ['branch', 'cancel', 'allowCancel'],
  ];
  it.each(cancelCases)('cancel "%s" runs the %s branch', async (mode, branch) => {
    rig.ui.choiceAnswers = [-1];
    const run = rig.runCommands([
      cmd('showChoices', { options: [choice('opt1', 'A'), choice('opt2', 'B')], cancel: mode }, {
        opt1: [cmd('setVariable', { id: 'v1', op: 'set', operand: 'const', value: 1 })],
        opt2: [cmd('setVariable', { id: 'v1', op: 'set', operand: 'const', value: 2 })],
        cancel: [cmd('setVariable', { id: 'v1', op: 'set', operand: 'const', value: 3 })],
      }),
    ])!;
    await run.done;
    expect(rig.ui.choices[0].allowCancel).toBe(true);
    expect(rig.runtime.state.getVariable('v1')).toBe(branch === 'cancel' ? 3 : 2);
  });

  it('cancel "none" never offers cancelling', async () => {
    rig.ui.choiceAnswers = [0];
    const run = rig.runCommands([cmd('showChoices', { options: [choice('a', 'A')], cancel: 'none' })])!;
    await run.done;
    expect(rig.ui.choices[0].allowCancel).toBe(false);
  });

  it('a choice without options warns and is skipped', async () => {
    const run = rig.runCommands([cmd('showChoices', { options: [], cancel: 'none' }), cmd('setSwitch', { id: 's1', value: true })])!;
    await run.done;
    expect(rig.warnings.some((w) => w.includes('no options'))).toBe(true);
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
  });
});

describe('flow commands', () => {
  it('conditional: then / else, all conditions must hold, empty list holds', async () => {
    rig.runtime.state.setSwitch('s1', true);
    const mk = (conditions: unknown[], target: string) =>
      cmd('conditional', { conditions }, {
        then: [cmd('setSwitch', { id: target, value: true })],
        else: [cmd('setVariable', { id: 'v1', op: 'add', operand: 'const', value: 1 })],
      });
    const run = rig.runCommands([
      mk([{ kind: 'switch', id: 's1', value: true }, { kind: 'variable', id: 'v2', op: '==', value: 5 }], 's2'),
      mk([{ kind: 'switch', id: 's1', value: true }, { kind: 'variable', id: 'v2', op: '==', value: 6 }], 'intro_done'),
      mk([], 'intro_done'),
    ])!;
    await run.done;
    expect(rig.runtime.state.getSwitch('s2')).toBe(true); // all hold
    expect(rig.runtime.state.getVariable('v1')).toBe(1); // second went to else
    expect(rig.runtime.state.getSwitch('intro_done')).toBe(true); // empty list -> then
  });

  it('conditional supports self switch and hasItem conditions', async () => {
    rig.runtime.inventory.add('potion', 2);
    const e = rig.add({ id: 'npcA', pages: [page([
      cmd('setSelfSwitch', { key: 'C', value: true }),
      cmd('conditional', { conditions: [{ kind: 'selfSwitch', key: 'C', value: true }, { kind: 'hasItem', item: 'potion', qty: 2 }] }, {
        then: [cmd('setSwitch', { id: 's1', value: true })],
      }),
    ])] });
    await rig.runtime.start(e, 0)!.done;
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
  });

  it('loop repeats until breakLoop; nested loops break only the inner one', async () => {
    const run = rig.runCommands([
      cmd('loop', {}, {
        body: [
          cmd('setVariable', { id: 'v1', op: 'add', operand: 'const', value: 1 }),
          cmd('loop', {}, { body: [cmd('setVariable', { id: 'v3', op: 'add', operand: 'const', value: 10 }), cmd('breakLoop')] }),
          cmd('conditional', { conditions: [{ kind: 'variable', id: 'v1', op: '>=', value: 3 }] }, { then: [cmd('breakLoop')] }),
        ],
      }),
      cmd('setSwitch', { id: 's1', value: true }),
    ])!;
    await rig.advance(200);
    await run.done;
    expect(rig.runtime.state.getVariable('v1')).toBe(3);
    expect(rig.runtime.state.getVariable('v3')).toBe(30);
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
  });

  it('exitEvent stops the whole event, even from inside loops and branches', async () => {
    const run = rig.runCommands([
      cmd('loop', {}, { body: [cmd('conditional', { conditions: [] }, { then: [cmd('exitEvent')] })] }),
      cmd('setSwitch', { id: 's1', value: true }),
    ])!;
    await rig.advance(100);
    expect(await run.done).toBe('completed');
    expect(rig.runtime.state.getSwitch('s1')).toBe(false);
  });

  it('breakLoop outside of a loop warns and continues', async () => {
    const run = rig.runCommands([cmd('breakLoop'), cmd('setSwitch', { id: 's1', value: true })])!;
    await run.done;
    expect(rig.warnings.some((w) => w.includes('breakLoop outside'))).toBe(true);
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
  });

  it('wait pauses for game time; comment does nothing', async () => {
    const run = rig.runCommands([cmd('comment', { text: 'hi' }), cmd('wait', { ms: 500 }), cmd('setSwitch', { id: 's1', value: true })])!;
    await rig.advance(300);
    expect(rig.runtime.state.getSwitch('s1')).toBe(false);
    await rig.advance(300);
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
    expect(run.interpreter.finished).toBe(true);
  });

  it('a bare empty loop yields frames instead of freezing', async () => {
    const run = rig.runCommands([cmd('loop', {}, { body: [] })])!;
    await rig.advance(0);
    expect(run.interpreter.finished).toBe(false);
    // The loop consumed YIELD_EVERY_COMMANDS commands and now waits for the next frame
    expect(rig.runtime.clock.pending).toBe(1);
    expect(YIELD_EVERY_COMMANDS).toBeGreaterThan(100);
    run.interpreter.cancel();
    expect(await run.done).toBe('cancelled');
  });
});

describe('state commands', () => {
  async function runVar(params: Record<string, unknown>, setup?: () => void) {
    setup?.();
    const run = rig.runCommands([cmd('setVariable', { id: 'v1', op: 'set', operand: 'const', value: 0, ...params })])!;
    await run.done;
    return rig.runtime.state.getVariable('v1');
  }

  it('setSwitch on/off', async () => {
    await rig.runCommands([cmd('setSwitch', { id: 's1', value: true }), cmd('setSwitch', { id: 's2', value: false })])!.done;
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
    expect(rig.runtime.state.getSwitch('s2')).toBe(false);
  });

  it('setVariable: every operation with a constant', async () => {
    rig.runtime.state.setVariable('v1', 10);
    const apply = async (op: string, value: number) => {
      await rig.runCommands([cmd('setVariable', { id: 'v1', op, operand: 'const', value })])!.done;
      return rig.runtime.state.getVariable('v1');
    };
    expect(await apply('set', 7)).toBe(7);
    expect(await apply('add', 3)).toBe(10);
    expect(await apply('sub', 4)).toBe(6);
    expect(await apply('mul', 5)).toBe(30);
    expect(await apply('div', 7)).toBe(4); // integer division
    expect(await apply('mod', 3)).toBe(1);
  });

  it('division and modulo by zero leave the variable unchanged and warn', async () => {
    rig.runtime.state.setVariable('v1', 9);
    expect(await runVar({ op: 'div', value: 0 })).toBe(9);
    expect(await runVar({ op: 'mod', value: 0 })).toBe(9);
    expect(rig.warnings.filter((w) => w.includes('by zero'))).toHaveLength(2);
  });

  it('setVariable with another variable as operand', async () => {
    expect(await runVar({ op: 'add', operand: 'variable', sourceId: 'v2' })).toBe(5);
    expect(await runVar({ op: 'mul', operand: 'variable', sourceId: 'v2' })).toBe(25);
    expect(await runVar({ op: 'set', operand: 'variable', sourceId: 'ghost' })).toBe(0);
  });

  it('setVariable random is an inclusive integer in [min, max] (swapped when reversed)', async () => {
    const lowRig = makeRig({ random: () => 0 });
    const highRig = makeRig({ random: () => 0.999999 });
    await lowRig.runCommands([cmd('setVariable', { id: 'v1', op: 'set', operand: 'random', min: 3, max: 6 })])!.done;
    await highRig.runCommands([cmd('setVariable', { id: 'v1', op: 'set', operand: 'random', min: 6, max: 3 })])!.done;
    expect(lowRig.runtime.state.getVariable('v1')).toBe(3);
    expect(highRig.runtime.state.getVariable('v1')).toBe(6);
  });

  it('setSelfSwitch targets the event\'s own entity on the current map', async () => {
    const e = rig.add({ id: 'chest9', pages: [page([cmd('setSelfSwitch', { key: 'B', value: true })])] });
    await rig.runtime.start(e, 0)!.done;
    expect(rig.runtime.state.getSelfSwitch('test', 'chest9', 'B')).toBe(true);
    expect(rig.runtime.state.getSelfSwitch('test', 'chest9', 'A')).toBe(false);
  });

  it('giveItem / removeItem work on the in-memory inventory', async () => {
    await rig.runCommands([cmd('giveItem', { item: 'potion', qty: 3 }), cmd('removeItem', { item: 'potion', qty: 1 })])!.done;
    expect(rig.runtime.inventory.get('potion')).toBe(2);
    await rig.runCommands([cmd('removeItem', { item: 'potion', qty: 9 })])!.done;
    expect(rig.runtime.inventory.get('potion')).toBe(0);
  });

  it('emit fires the custom event with payload, entity and map', async () => {
    const e = rig.add({ id: 'lever', pages: [page([cmd('emit', { event: 'OPEN_GATE', payload: 'north' })])] });
    await rig.runtime.start(e, 0)!.done;
    expect(rig.emitted).toEqual([{ event: 'OPEN_GATE', payload: { payload: 'north', entity: 'lever', map: 'test' } }]);
  });

  it('commands with missing required params warn and are skipped', async () => {
    await rig.runCommands([cmd('setSwitch', { id: '' }), cmd('setVariable', { id: '' }), cmd('emit', { event: ' ' }), cmd('giveItem', { item: '' })])!.done;
    expect(rig.warnings.length).toBeGreaterThanOrEqual(4);
  });
});

describe('character commands', () => {
  it('setFacing / faceTowards turn entities (target self, player, entity id)', async () => {
    const player = rig.addPlayer(5, 5);
    const npc = rig.add({ id: 'npc1', col: 5, row: 3, movement: { controller: 'none' }, pages: [page([
      cmd('faceTowards', { target: 'self', other: 'player' }),
      cmd('setFacing', { target: 'player', facing: 'left' }),
      cmd('setFacing', { target: { entity: 'npc2' }, facing: 'right' }),
    ])] });
    const other = rig.add({ id: 'npc2', col: 1, row: 1, movement: { controller: 'none' } });
    await rig.runtime.start(npc, 0)!.done;
    expect(rig.world.getComponent(npc, GridMovementComponent)!.direction).toBe('down'); // player is south of npc1
    expect(rig.world.getComponent(player, GridMovementComponent)!.direction).toBe('left');
    expect(rig.world.getComponent(other, AnimationComponent)!.direction).toBe('right');
  });

  it('a missing target warns once and the event continues', async () => {
    const run = rig.runCommands([
      cmd('setFacing', { target: { entity: 'ghost' }, facing: 'up' }),
      cmd('setFacing', { target: { entity: 'ghost' }, facing: 'up' }),
      cmd('setSwitch', { id: 's1', value: true }),
    ])!;
    await run.done;
    expect(rig.warnings.filter((w) => w.includes('ghost'))).toHaveLength(1);
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
  });

  it('setVisible hides / shows a sprite', async () => {
    const e = rig.add({ pages: [page([cmd('setVisible', { target: 'self', visible: false })])] });
    await rig.runtime.start(e, 0)!.done;
    expect(rig.world.getComponent(e, SpriteComponent)!.visible).toBe(false);
  });

  it('changeSprite swaps the asset keeping facing; unknown assets warn and change nothing', async () => {
    const e = rig.add({ sprite: { asset: 'characters/npc', facing: 'left' }, movement: { controller: 'none' }, pages: [page([
      cmd('changeSprite', { target: 'self', asset: 'objects/chest', animation: '' }),
      cmd('changeSprite', { target: 'self', asset: 'objects/ghost', animation: '' }),
    ])] });
    await rig.runtime.start(e, 0)!.done;
    const s = rig.world.getComponent(e, SpriteComponent)!;
    expect(s.assetId).toBe('objects/chest');
    expect(s.texture).toBe(spriteTextureKey('objects/chest', 'sheet'));
    expect(rig.world.hasComponent(e, AnimationComponent)).toBe(false);
    expect(rig.warnings.some((w) => w.includes('objects/ghost'))).toBe(true);
  });

  it('playAnimation plays a named animation of an object asset and bumps the revision; unknown names warn', async () => {
    const e = rig.add({ sprite: { asset: 'objects/chest' }, pages: [page([
      cmd('playAnimation', { target: 'self', animation: 'open' }),
      cmd('playAnimation', { target: 'self', animation: 'nope' }),
    ])] });
    const s = rig.world.getComponent(e, SpriteComponent)!;
    await rig.runtime.start(e, 0)!.done;
    expect(s.animKey).toBe(objectAnimKey('objects/chest', 'open'));
    expect(s.animRevision).toBe(1);
    expect(rig.warnings.some((w) => w.includes('no animation "nope"'))).toBe(true);
  });

  it('playAnimation on a character forces idle/walk/run', async () => {
    const e = rig.add({ sprite: { asset: 'characters/player' }, movement: { controller: 'none' }, pages: [page([cmd('playAnimation', { target: 'self', animation: 'run' })])] });
    await rig.runtime.start(e, 0)!.done;
    expect(rig.world.getComponent(e, AnimationComponent)!.forcedPhase).toBe('run');
  });

  it('moveRoute passes normalised steps to the movement system and waits (or not) per `wait`', async () => {
    const calls: Array<{ steps: unknown[]; hasSignal: boolean }> = [];
    let resolveRoute: (() => void) | undefined;
    rig.runtime.ops.moveRoute = (_entity, steps, signal) => {
      calls.push({ steps, hasSignal: !!signal });
      return new Promise((resolve) => {
        resolveRoute = () => resolve({ completed: true, blocked: 0 });
      });
    };
    const steps = [{ type: 'up' }, { type: 'turn', value: 'left' }, { type: 'turn', value: 'sideways' }, { type: 'wait', value: 100 }, { type: 'speed', value: 0 }, { type: 'dance' }];
    const waiting = rig.runCommands([cmd('moveRoute', { target: 'self', steps, wait: true }), cmd('setSwitch', { id: 's1', value: true })])!;
    await rig.advance();
    expect(calls[0].steps).toEqual([{ type: 'up' }, { type: 'turn', value: 'left' }, { type: 'wait', value: 100 }]);
    expect(calls[0].hasSignal).toBe(true);
    expect(rig.runtime.state.getSwitch('s1')).toBe(false);
    resolveRoute!();
    await waiting.done;
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);

    const fire = rig.runCommands([cmd('moveRoute', { target: 'self', steps: [{ type: 'down' }], wait: false }), cmd('setSwitch', { id: 's2', value: true })])!;
    await fire.done; // does not wait
    expect(rig.runtime.state.getSwitch('s2')).toBe(true);
    expect(calls[1].hasSignal).toBe(false);
  });

  it('moveRoute with no valid steps does nothing', async () => {
    let called = false;
    rig.runtime.ops.moveRoute = () => {
      called = true;
      return Promise.resolve({ completed: true, blocked: 0 });
    };
    await rig.runCommands([cmd('moveRoute', { target: 'self', steps: [{ type: 'bogus' }] })])!.done;
    expect(called).toBe(false);
  });

  it('target "self" resolves to the event entity', async () => {
    const e = rig.add({ col: 4, row: 4, pages: [page([cmd('setFacing', { target: 'self', facing: 'up' })])] });
    await rig.runtime.start(e, 0)!.done;
    expect(rig.world.getComponent(e, AnimationComponent)!.direction).toBe('up');
    expect(rig.world.getComponent(e, TransformComponent)!.x).toBe(4 * 32 + 16);
  });
});

describe('screen and map commands', () => {
  it('warp requests the destination tile / facing / fade; unknown or empty maps warn and are skipped', async () => {
    await rig.runCommands([
      cmd('warp', { map: 'market', x: 4, y: 7, facing: 'up', fade: false }),
      cmd('warp', { map: 'atlantis', x: 1, y: 1, facing: '', fade: true }),
      cmd('warp', { map: '', x: 1, y: 1 }),
    ])!.done;
    expect(rig.maps.warps).toEqual([{ map: 'market', x: 4, y: 7, facing: 'up', fade: false }]);
    expect(rig.warnings.filter((w) => w.includes('warp'))).toHaveLength(2);
  });

  it('warp keeps the facing when empty and fades by default', async () => {
    await rig.runCommands([cmd('warp', { map: 'city', x: 2, y: 3, facing: '' })])!.done;
    expect(rig.maps.warps[0]).toEqual({ map: 'city', x: 2, y: 3, facing: undefined, fade: true });
  });

  it('fadeScreen and shakeScreen go to the UI (shake power is clamped to 1..10)', async () => {
    await rig.runCommands([
      cmd('fadeScreen', { mode: 'out', ms: 300 }),
      cmd('fadeScreen', { mode: 'in', ms: 100 }),
      cmd('shakeScreen', { power: 99, ms: 200 }),
    ])!.done;
    expect(rig.ui.fades).toEqual([{ mode: 'out', ms: 300 }, { mode: 'in', ms: 100 }]);
    expect(rig.ui.shakes).toEqual([{ power: 10, ms: 200 }]);
  });
});

describe('planned and unknown commands', () => {
  it('log one warning per command type and carry on', async () => {
    const planned = ['playSound', 'playMusic', 'tintScreen', 'setWeather', 'runScript', 'callCommonEvent', 'healParty', 'startBattle'];
    const run = rig.runCommands([
      ...planned.map((t) => cmd(t)),
      ...planned.map((t) => cmd(t)),
      cmd('totallyUnknown'),
      cmd('totallyUnknown'),
      cmd('setSwitch', { id: 's1', value: true }),
    ])!;
    expect(await run.done).toBe('completed');
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
    const planWarnings = rig.warnings.filter((w) => w.includes('not implemented yet'));
    expect(planWarnings).toHaveLength(planned.length);
    for (const t of planned) expect(planWarnings.filter((w) => w.includes(`"${t}"`))).toHaveLength(1);
    expect(rig.warnings.filter((w) => w.includes('unknown command'))).toHaveLength(1);
  });

  it('a handler that throws is logged and skipped', async () => {
    registerCommandHandler('explode', () => {
      throw new Error('kaboom');
    });
    const run = rig.runCommands([cmd('explode'), cmd('setSwitch', { id: 's1', value: true })])!;
    expect(await run.done).toBe('completed');
    expect(rig.warnings.some((w) => w.includes('kaboom'))).toBe(true);
    expect(rig.runtime.state.getSwitch('s1')).toBe(true);
  });

  it('custom commands can be registered (docs: Adding a command)', async () => {
    registerCommandHandler('testSetV3', (command, rt) => {
      rt.ctx.state.setVariable('v3', Number(command.params.value));
    });
    await rig.runCommands([cmd('testSetV3', { value: 42 })])!.done;
    expect(rig.runtime.state.getVariable('v3')).toBe(42);
  });
});

describe('cancellation', () => {
  it('cancel during showText stops the event and the UI call is aborted', async () => {
    const run = rig.runCommands([cmd('showText', { text: 'hi' }), cmd('setSwitch', { id: 's1', value: true })])!;
    await rig.advance();
    expect(rig.ui.waitingText).toBe(true);
    run.interpreter.cancel();
    expect(await run.done).toBe('cancelled');
    expect(rig.runtime.state.getSwitch('s1')).toBe(false);
  });

  it('cancel during wait and during showChoices', async () => {
    const waiting = rig.runCommands([cmd('wait', { ms: 5000 }), cmd('setSwitch', { id: 's1', value: true })])!;
    await rig.advance(100);
    waiting.interpreter.cancel();
    expect(await waiting.done).toBe('cancelled');
    expect(rig.runtime.clock.pending).toBe(0);

    const choosing = rig.runCommands([cmd('showChoices', { options: [choice('a', 'A')], cancel: 'none' }, { a: [cmd('setSwitch', { id: 's2', value: true })] })])!;
    await rig.advance();
    choosing.interpreter.cancel();
    expect(await choosing.done).toBe('cancelled');
    expect(rig.runtime.state.getSwitch('s2')).toBe(false);
  });

  it('cancel before the run started cancels at once', async () => {
    const e = rig.add({ pages: [page([cmd('setSwitch', { id: 's1', value: true })])] });
    const interpreter = new EventInterpreter(rig.world.getComponent(e, (await import('@/ecs/components/EventComponent')).EventComponent)!.pages[0].commands, {
      entity: e, entityId: 'x', getMapId: () => 'test', state: rig.runtime.state, inventory: rig.runtime.inventory, ui: rig.ui,
      clock: rig.runtime.clock, ops: rig.runtime.ops, maps: rig.maps, emit: () => {}, warn: () => {}, warnOnce: () => {}, random: () => 0,
    });
    interpreter.cancel();
    expect(await interpreter.run()).toBe('cancelled');
    expect(rig.runtime.state.getSwitch('s1')).toBe(false);
  });

  it('cancelAll (map switch) cancels every interpreter and releases the input lock immediately', async () => {
    const run = rig.runCommands([cmd('showText', { text: 'hi' })])!;
    await rig.advance();
    expect(gameState.isLockedBy('event')).toBe(true);
    expect(rig.runtime.isBlocking).toBe(true);
    rig.runtime.cancelAll();
    expect(gameState.isLockedBy('event')).toBe(false);
    expect(rig.runtime.isBlocking).toBe(false);
    expect(await run.done).toBe('cancelled');
  });
});
