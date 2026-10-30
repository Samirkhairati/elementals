import { describe, it, expect, vi, beforeEach } from 'vitest';

// EventBus wraps Phaser's EventEmitter, and importing 'phaser' needs a browser window.
vi.mock('phaser', async () => {
  const { EventEmitter } = await import('node:events');
  return { Events: { EventEmitter } };
});

import { GameState } from './GameState';
import { EventBus, Events } from '@/utils/EventBus';
import { Direction } from '@/utils/Direction';

describe('GameState', () => {
  let state: GameState;
  let lockEvents: Array<[boolean, string | undefined]>;
  const onLock = (locked: boolean, reason?: string) => lockEvents.push([locked, reason]);

  beforeEach(() => {
    state = new GameState();
    lockEvents = [];
    EventBus.removeAllListeners(Events.INPUT_LOCK_CHANGED);
    EventBus.on(Events.INPUT_LOCK_CHANGED, onLock);
  });

  it('starts unlocked at the origin facing down', () => {
    expect(state.isInputLocked).toBe(false);
    expect(state.lockReason).toBeUndefined();
    expect(state.playerPosition).toEqual({ worldX: 0, worldY: 0, gridX: 0, gridY: 0, direction: Direction.DOWN });
  });

  it('locking emits INPUT_LOCK_CHANGED exactly once and repeats are ignored', () => {
    state.setInputLocked(true, 'dialogue');
    state.setInputLocked(true, 'dialogue');
    expect(state.isInputLocked).toBe(true);
    expect(state.lockReason).toBe('dialogue');
    expect(lockEvents).toEqual([[true, 'dialogue']]);
  });

  it('unlocking emits once and clears the reason', () => {
    state.setInputLocked(true, 'menu');
    state.setInputLocked(false);
    state.setInputLocked(false);
    expect(state.isInputLocked).toBe(false);
    expect(state.lockReason).toBeUndefined();
    expect(lockEvents).toEqual([[true, 'menu'], [false, undefined]]);
  });

  it('a different reason while locked counts as a change', () => {
    state.setInputLocked(true, 'a');
    state.setInputLocked(true, 'b');
    expect(lockEvents).toEqual([[true, 'a'], [true, 'b']]);
  });

  it('notifies subscribers on lock and position changes until unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);

    state.setInputLocked(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].isInputLocked).toBe(true);

    state.updatePlayerPosition(48, 96, 1, 2, Direction.LEFT);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(state.playerPosition).toEqual({ worldX: 48, worldY: 96, gridX: 1, gridY: 2, direction: Direction.LEFT });

    unsubscribe();
    state.setInputLocked(false);
    state.updatePlayerPosition(0, 0, 0, 0, Direction.UP);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not notify subscribers when the lock does not change', () => {
    const listener = vi.fn();
    state.subscribe(listener);
    state.setInputLocked(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('getInstance returns a singleton', () => {
    expect(GameState.getInstance()).toBe(GameState.getInstance());
  });
});
