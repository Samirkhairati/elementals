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

  public setInputLocked(locked: boolean, reason?: string): void {
    if (this._state.isInputLocked !== locked || this._state.lockReason !== reason) {
      this._state.isInputLocked = locked;
      this._state.lockReason = reason;
      EventBus.emit(Events.INPUT_LOCK_CHANGED, locked, reason);
      this.notify();
    }
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
