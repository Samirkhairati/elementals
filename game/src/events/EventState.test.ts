import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventState } from './EventState';
import { Inventory } from './Inventory';
import { GameClock } from './GameClock';
import { EventBus, Events } from '@/utils/EventBus';
import { TEST_DB } from '@/test/rig';

describe('EventState', () => {
  beforeEach(() => {
    EventBus.removeAllListeners(Events.EVENT_STATE_CHANGED);
  });

  it('initialises switches to false and variables to their initial value from the database', () => {
    const s = new EventState(TEST_DB);
    expect(s.getSwitch('s1')).toBe(false);
    expect(s.getVariable('v2')).toBe(5);
    expect(s.hasSwitch('s1')).toBe(true);
    expect(s.hasVariable('nope')).toBe(false);
  });

  it('unknown ids read as false / 0', () => {
    const s = new EventState(TEST_DB);
    expect(s.getSwitch('ghost')).toBe(false);
    expect(s.getVariable('ghost')).toBe(0);
  });

  it('notifies subscribers and the EventBus once per real change', () => {
    const s = new EventState(TEST_DB);
    const local = vi.fn();
    const bus = vi.fn();
    s.subscribe(local);
    EventBus.on(Events.EVENT_STATE_CHANGED, bus);

    s.setSwitch('s1', true);
    s.setSwitch('s1', true); // unchanged: silent
    s.setVariable('v1', 3);
    s.setVariable('v1', 3);
    s.setSelfSwitch('city', 'npc', 'A', true);
    s.setSelfSwitch('city', 'npc', 'A', true);

    expect(local.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'switch', id: 's1', value: true },
      { kind: 'variable', id: 'v1', value: 3 },
      { kind: 'selfSwitch', id: 'city/npc/A', value: true },
    ]);
    expect(bus).toHaveBeenCalledTimes(3);
  });

  it('unsubscribe stops notifications; non-finite variable values are ignored', () => {
    const s = new EventState(TEST_DB);
    const l = vi.fn();
    const off = s.subscribe(l);
    off();
    s.setSwitch('s1', true);
    expect(l).not.toHaveBeenCalled();
    s.setVariable('v1', NaN);
    expect(s.getVariable('v1')).toBe(0);
  });

  it('self switches are per map + entity + key', () => {
    const s = new EventState(TEST_DB);
    s.setSelfSwitch('city', 'a', 'A', true);
    expect(s.getSelfSwitch('city', 'a', 'A')).toBe(true);
    expect(s.getSelfSwitch('city', 'a', 'B')).toBe(false);
    expect(s.getSelfSwitch('city', 'b', 'A')).toBe(false);
    expect(s.getSelfSwitch('market', 'a', 'A')).toBe(false);
    s.setSelfSwitch('city', 'a', 'A', false);
    expect(s.getSelfSwitch('city', 'a', 'A')).toBe(false);
  });

  it('reset() restores the database values and notifies', () => {
    const s = new EventState(TEST_DB);
    s.setSwitch('s1', true);
    s.setVariable('v2', 99);
    s.setSelfSwitch('city', 'a', 'C', true);
    const l = vi.fn();
    s.subscribe(l);
    s.reset();
    expect(s.getSwitch('s1')).toBe(false);
    expect(s.getVariable('v2')).toBe(5);
    expect(s.getSelfSwitch('city', 'a', 'C')).toBe(false);
    expect(l).toHaveBeenCalledWith({ kind: 'reset', id: '' });
  });

  it('serialises to JSON and loads back', () => {
    const a = new EventState(TEST_DB);
    a.setSwitch('s2', true);
    a.setVariable('v1', 7);
    a.setSelfSwitch('market', 'chest', 'A', true);
    const snapshot = JSON.parse(JSON.stringify(a.toJSON()));

    const b = new EventState(TEST_DB);
    b.load(snapshot);
    expect(b.getSwitch('s2')).toBe(true);
    expect(b.getVariable('v1')).toBe(7);
    expect(b.getSelfSwitch('market', 'chest', 'A')).toBe(true);
    expect(b.getVariable('v2')).toBe(5);
  });
});

describe('Inventory', () => {
  it('adds, removes (clamped at 0) and reports changes', () => {
    const inv = new Inventory();
    const l = vi.fn();
    inv.subscribe(l);
    expect(inv.get('potion')).toBe(0);
    inv.add('potion', 2);
    inv.add('potion');
    expect(inv.get('potion')).toBe(3);
    expect(inv.has('potion', 3)).toBe(true);
    expect(inv.has('potion', 4)).toBe(false);
    expect(inv.remove('potion', 5)).toBe(3);
    expect(inv.get('potion')).toBe(0);
    expect(inv.remove('potion', 1)).toBe(0);
    expect(l).toHaveBeenCalledTimes(3); // 2 adds + 1 remove (the empty remove is silent)
    inv.add('', 3);
    inv.add('x', -2);
    expect(inv.toJSON()).toEqual({});
  });
});

describe('GameClock', () => {
  it('resolves waits after enough game time and next-frame waits on the next tick', async () => {
    const clock = new GameClock();
    const ac = new AbortController();
    const done: string[] = [];
    void clock.wait(100, ac.signal).then(() => done.push('wait'));
    void clock.nextFrame(ac.signal).then(() => done.push('frame'));
    clock.tick(0);
    await Promise.resolve();
    expect(done).toEqual(['frame']);
    clock.tick(60);
    await Promise.resolve();
    expect(done).toEqual(['frame']);
    clock.tick(60);
    await Promise.resolve();
    expect(done).toEqual(['frame', 'wait']);
    expect(clock.pending).toBe(0);
  });

  it('abort drops the timer', async () => {
    const clock = new GameClock();
    const ac = new AbortController();
    const p = clock.wait(1000, ac.signal);
    expect(clock.pending).toBe(1);
    ac.abort();
    await p;
    expect(clock.pending).toBe(0);
  });
});
