import { DEFAULT_CONTROLS } from "@/constants/game";
import { EventBus, Events } from "@/utils/EventBus";

export interface DebugSettings {
  enabled: boolean;
  showKeys: boolean;
  showCoords: boolean;
  showGrid: boolean;
  showFPS: boolean;
}

export interface CameraSettings {
  smoothFollow: boolean;
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
  camera: CameraSettings;
  controls: ControlSettings;
}

type Listener = (state: Readonly<GameSettingsState>) => void;

export class SettingsStore {
  private static instance: SettingsStore;

  private _state: GameSettingsState = {
    tileBasedMovement: true,
    renderScale: 1,
    debug: {
      enabled: false,
      showKeys: true,
      showCoords: true,
      showGrid: true,
      showFPS: true,
    },
    camera: {
      smoothFollow: true,
    },
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

  public get camera(): Readonly<CameraSettings> {
    return this._state.camera;
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
