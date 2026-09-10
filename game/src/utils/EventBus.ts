import { Events as PhaserEvents } from 'phaser';

// Global Event Bus
export const EventBus = new PhaserEvents.EventEmitter();

// Centralized event names to avoid typos
export const Events = {
    // Input Events
    INPUT_DIRECTION: 'input-direction',
    INPUT_UI_DIRECTION: 'input-ui-direction',
    INPUT_ACTION: 'input-action',
    MENU_TOGGLED: 'menu-toggled',
    
    // Game State Events
    MAP_SWITCH_REQUEST: 'map-switch-request',
    PLAYER_MOVED: 'player-moved',
    RENDER_SCALE_CHANGED: 'render-scale-changed',
    MOVEMENT_MODE_CHANGED: 'movement-mode-changed',
    
    // UI Events
    SHOW_DIALOGUE: 'show-dialogue',
    DIALOGUE_CLOSED: 'dialogue-closed',
    PLAYER_READY: 'player-ready',
} as const;
