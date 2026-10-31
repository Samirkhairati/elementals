import { Direction } from "@/utils/Direction";
import { EventBus, Events } from "@/utils/EventBus";

export interface PlayerPositionState {
  worldX: number;
  worldY: number;
  gridX: number;
  gridY: number;
  direction: Direction;
}

export interface GameStateSnapshot {
  isInputLocked: boolean;
  lockReason?: string;
  playerPosition: PlayerPositionState;
}

type StateListener = (state: Readonly<GameStateSnapshot>) => void;

export class GameState {
  private static instance: GameState;

  private _state: GameStateSnapshot = {
    isInputLocked: false,
    playerPosition: {
      worldX: 0,
      worldY: 0,
      gridX: 0,
      gridY: 0,
      direction: Direction.DOWN,
    },
  };

  private listeners: Set<StateListener> = new Set();
  /** Why input is locked, oldest first. Input is locked while at least one reason is held. */
  private lockReasons: string[] = [];

  public static getInstance(): GameState {
    if (!GameState.instance) {
      GameState.instance = new GameState();
    }
    return GameState.instance;
  }

  public get state(): Readonly<GameStateSnapshot> {
    return this._state;
  }

  public get isInputLocked(): boolean {
    return this._state.isInputLocked;
  }

  public get lockReason(): string | undefined {
    return this._state.lockReason;
  }

  public get playerPosition(): Readonly<PlayerPositionState> {
    return this._state.playerPosition;
  }

  /**
   * Locks/unlocks player input. Locks are owned by reasons ('menu', 'dialogue', 'event', ...) so that
   * independent systems cannot unlock each other:
   *  - `setInputLocked(true, reason)` holds `reason` (no reason = 'default');
   *  - `setInputLocked(false, reason)` releases only that reason;
   *  - `setInputLocked(false)` without a reason releases everything (map switches).
   * `lockReason` is the most recently added reason that is still held.
   */
  public setInputLocked(locked: boolean, reason?: string): void {
    const before = this.snapshotLock();
    if (locked) {
      const key = reason ?? "default";
      this.lockReasons = this.lockReasons.filter((r) => r !== key);
      this.lockReasons.push(key);
    } else if (reason === undefined) {
      this.lockReasons = [];
    } else {
      this.lockReasons = this.lockReasons.filter((r) => r !== reason);
    }
    this.applyLock(before);
  }

  /** Holds a lock for `reason`; the returned function releases it (safe to call more than once). */
  public lockInput(reason: string): () => void {
    this.setInputLocked(true, reason);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.setInputLocked(false, reason);
    };
  }

  /** True while `reason` holds a lock. */
  public isLockedBy(reason: string): boolean {
    return this.lockReasons.includes(reason);
  }

  private snapshotLock(): { locked: boolean; reason: string | undefined } {
    return { locked: this._state.isInputLocked, reason: this._state.lockReason };
  }

  private applyLock(before: { locked: boolean; reason: string | undefined }): void {
    const locked = this.lockReasons.length > 0;
    const top = locked ? this.lockReasons[this.lockReasons.length - 1] : undefined;
    // "default" is the reasonless lock of old callers: it reports no reason.
    const reason = top === "default" ? undefined : top;
    if (before.locked === locked && before.reason === reason) return;
    this._state.isInputLocked = locked;
    this._state.lockReason = reason;
    EventBus.emit(Events.INPUT_LOCK_CHANGED, locked, reason);
    this.notify();
  }

  public updatePlayerPosition(
    worldX: number,
    worldY: number,
    gridX: number,
    gridY: number,
    direction: Direction
  ): void {
    this._state.playerPosition = {
      worldX,
      worldY,
      gridX,
      gridY,
      direction,
    };
    this.notify();
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this._state);
    }
  }
}

export const gameState = GameState.getInstance();
