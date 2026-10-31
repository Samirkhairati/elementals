import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameFlags } from './GameFlags';
import { Inventory } from './Inventory';
import { GameClock } from './GameClock';
import { EventBus, Events } from '@/utils/EventBus';
import { TEST_DB } from '@/test/rig';

describe('GameFlags', () => {
  beforeEach(() => {
    EventBus.removeAllListeners(Events.FLAGS_CHANGED);
  });

  it('initialises switches to false and variables to their initial value from the database', () => {
    const s = new GameFlags(TEST_DB);
    expect(s.getSwitch('s1')).toBe(false);
    expect(s.getVariable('v2')).toBe(5);
    expect(s.hasSwitch('s1')).toBe(true);
    expect(s.hasVariable('nope')).toBe(false);
  });

  it('unknown ids read as false / 0', () => {
    const s = new GameFlags(TEST_DB);
    expect(s.getSwitch('ghost')).toBe(false);
    expect(s.getVariable('ghost')).toBe(0);
  });

  it('notifies subscribers and the EventBus once per real change', () => {
    const s = new GameFlags(TEST_DB);
    const local = vi.fn();
    const bus = vi.fn();
    s.subscribe(local);
    EventBus.on(Events.FLAGS_CHANGED, bus);

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
    const s = new GameFlags(TEST_DB);
    const l = vi.fn();
    const off = s.subscribe(l);
    off();
    s.setSwitch('s1', true);
    expect(l).not.toHaveBeenCalled();
    s.setVariable('v1', NaN);
    expect(s.getVariable('v1')).toBe(0);
  });

  it('self switches are per map + entity + key', () => {
    const s = new GameFlags(TEST_DB);
    s.setSelfSwitch('city', 'a', 'A', true);
    expect(s.getSelfSwitch('city', 'a', 'A')).toBe(true);
    expect(s.getSelfSwitch('city', 'a', 'B')).toBe(false);
    expect(s.getSelfSwitch('city', 'b', 'A')).toBe(false);
    expect(s.getSelfSwitch('market', 'a', 'A')).toBe(false);
    s.setSelfSwitch('city', 'a', 'A', false);
    expect(s.getSelfSwitch('city', 'a', 'A')).toBe(false);
  });

  it('reset() restores the database values and notifies', () => {
    const s = new GameFlags(TEST_DB);
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

  describe('stages', () => {
    it('start at their initial value; unknown stages have no value', () => {
      const s = new GameFlags(TEST_DB);
      expect(s.getStage('cat')).toBe('none');
      expect(s.stageIndex('cat')).toBe(0);
      expect(s.hasStage('cat')).toBe(true);
      expect(s.getStage('ghost')).toBe('');
      expect(s.stageIndex('ghost')).toBe(-1);
      expect(s.hasStage('ghost')).toBe(false);
    });

    it('a missing or invalid initial falls back to the first value', () => {
      const db = { ...TEST_DB, stages: [{ id: 'q', name: 'Q', values: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], initial: 'zzz' }] };
      expect(new GameFlags(db).getStage('q')).toBe('a');
    });

    it('setStage moves to a known value and refuses unknown stages or values', () => {
      const s = new GameFlags(TEST_DB);
      expect(s.setStage('cat', 'found')).toBe(true);
      expect(s.getStage('cat')).toBe('found');
      expect(s.stageIndex('cat')).toBe(2);
      expect(s.setStage('cat', 'nope')).toBe(false);
      expect(s.setStage('ghost', 'x')).toBe(false);
      expect(s.getStage('cat')).toBe('found');
    });

    it('advanceStage steps forward and stays on the last value', () => {
      const s = new GameFlags(TEST_DB);
      for (const expected of ['accepted', 'found', 'done', 'done']) {
        s.advanceStage('cat');
        expect(s.getStage('cat')).toBe(expected);
      }
      expect(s.advanceStage('ghost')).toBe(false);
    });

    it('notifies once per real change, with the new value id', () => {
      const s = new GameFlags(TEST_DB);
      const local = vi.fn();
      s.subscribe(local);
      s.setStage('cat', 'accepted');
      s.setStage('cat', 'accepted');
      s.setStage('cat', 'bogus');
      expect(local.mock.calls).toEqual([[{ kind: 'stage', id: 'cat', value: 'accepted' }]]);
    });

    it('survive a snapshot; old snapshots without stages and values the database dropped keep the initial', () => {
      const a = new GameFlags(TEST_DB);
      a.setStage('cat', 'found');
      const snapshot = JSON.parse(JSON.stringify(a.toJSON()));
      expect(snapshot.stages).toEqual({ cat: 'found' });

      const b = new GameFlags(TEST_DB);
      b.load(snapshot);
      expect(b.getStage('cat')).toBe('found');

      const c = new GameFlags(TEST_DB);
      c.setStage('cat', 'done');
      c.load({ switches: {}, variables: {}, selfSwitches: {} }); // written before stages existed
      expect(c.getStage('cat')).toBe('none');
      c.load({ stages: { cat: 'removed_value' } });
      expect(c.getStage('cat')).toBe('none');
    });

    it('reset puts every stage back', () => {
      const s = new GameFlags(TEST_DB);
      s.setStage('cat', 'done');
      s.reset();
      expect(s.getStage('cat')).toBe('none');
    });

    it('a database without stages works (version 1 data)', () => {
      const s = new GameFlags({ switches: TEST_DB.switches, variables: TEST_DB.variables });
      expect(s.getStage('cat')).toBe('');
      expect(s.toJSON().stages).toEqual({});
    });
  });

  it('local flags accept any name, not just A-D', () => {
    const s = new GameFlags(TEST_DB);
    s.setSelfSwitch('city', 'chest', 'opened', true);
    expect(s.getSelfSwitch('city', 'chest', 'opened')).toBe(true);
    expect(s.getSelfSwitch('city', 'chest', 'A')).toBe(false);
  });

  it('serialises to JSON and loads back', () => {
    const a = new GameFlags(TEST_DB);
    a.setSwitch('s2', true);
    a.setVariable('v1', 7);
    a.setSelfSwitch('market', 'chest', 'A', true);
    const snapshot = JSON.parse(JSON.stringify(a.toJSON()));

    const b = new GameFlags(TEST_DB);
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
