import { DEFAULT_CONTROLS, GAME_CONSTANTS } from "@/constants/game";
import { EventBus, Events } from "@/utils/EventBus";
import {
  defaultGameSettings,
  normalizeGameSettings,
  viewSizeForTiles,
  type CameraSettings,
  type DisplaySettings,
  type GameSettings,
  type MovementSettings,
} from "@shared/gameSettings.ts";

export type { CameraSettings, DisplaySettings, MovementSettings };

export interface DebugSettings {
  enabled: boolean;
  showKeys: boolean;
  showCoords: boolean;
  showGrid: boolean;
  showFPS: boolean;
}

export interface ControlSettings {
  run: string;
  action: string;
  menu: string;
}

export interface GameSettingsState {
  tileBasedMovement: boolean;
  renderScale: number;
  debug: DebugSettings;
  /** From the project's game settings (project/game-settings.json -> data/settings.json). */
  display: DisplaySettings;
  camera: CameraSettings;
  movement: MovementSettings;
  controls: ControlSettings;
}

type Listener = (state: Readonly<GameSettingsState>) => void;

export class SettingsStore {
  private static instance: SettingsStore;

  private _state: GameSettingsState = {
    tileBasedMovement: defaultGameSettings().movement.tileBased,
    renderScale: 1,
    debug: {
      enabled: false,
      showKeys: true,
      showCoords: true,
      showGrid: true,
      showFPS: true,
    },
    display: defaultGameSettings().display,
    camera: defaultGameSettings().camera,
    movement: defaultGameSettings().movement,
    controls: {
      run: DEFAULT_CONTROLS.RUN,
      action: DEFAULT_CONTROLS.ACTION,
      menu: DEFAULT_CONTROLS.MENU,
    },
  };

  private listeners: Set<Listener> = new Set();

  public static getInstance(): SettingsStore {
    if (!SettingsStore.instance) {
      SettingsStore.instance = new SettingsStore();
    }
    return SettingsStore.instance;
  }

  public get state(): Readonly<GameSettingsState> {
    return this._state;
  }

  public get tileBasedMovement(): boolean {
    return this._state.tileBasedMovement;
  }

  public set tileBasedMovement(value: boolean) {
    if (this._state.tileBasedMovement !== value) {
      this._state.tileBasedMovement = value;
      EventBus.emit(Events.MOVEMENT_MODE_CHANGED, value);
      this.notify();
    }
  }

  public toggleTileBasedMovement(): boolean {
    this.tileBasedMovement = !this._state.tileBasedMovement;
    return this._state.tileBasedMovement;
  }

  public get renderScale(): number {
    return this._state.renderScale;
  }

  public setRenderScale(newScale: number): void {
    const oldScale = this._state.renderScale;
    if (oldScale !== newScale) {
      this._state.renderScale = newScale;
      EventBus.emit(Events.RENDER_SCALE_CHANGED, newScale, oldScale);
      this.notify();
    }
  }

  public get debug(): Readonly<DebugSettings> {
    return this._state.debug;
  }

  public setDebugEnabled(enabled: boolean): void {
    this._state.debug.enabled = enabled;
    this.notify();
  }

  public get display(): Readonly<DisplaySettings> {
    return this._state.display;
  }

  public get camera(): Readonly<CameraSettings> {
    return this._state.camera;
  }

  public get movement(): Readonly<MovementSettings> {
    return this._state.movement;
  }

  /** The view in world pixels (16:9) for the current "tiles across" setting. */
  public get view(): { width: number; height: number; tilesX: number; tilesY: number } {
    const { width, height } = viewSizeForTiles(this._state.display.visibleTilesX, GAME_CONSTANTS.TILE_SIZE);
    return { width, height, tilesX: width / GAME_CONSTANTS.TILE_SIZE, tilesY: height / GAME_CONSTANTS.TILE_SIZE };
  }

  /** Takes the project's game settings (cleaned: anything missing or out of range falls back). Called once, before the game scene starts. */
  public applyGameSettings(raw: unknown): GameSettings {
    const settings = normalizeGameSettings(raw);
    this._state.display = settings.display;
    this._state.camera = settings.camera;
    this._state.movement = settings.movement;
    this._state.tileBasedMovement = settings.movement.tileBased;
    this.notify();
    return settings;
  }

  public get controls(): Readonly<ControlSettings> {
    return this._state.controls;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this._state);
    }
  }
}

export const settingsStore = SettingsStore.getInstance();
