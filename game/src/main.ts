import { Boot } from '@/scenes/Boot';
import { Game as MainGame } from '@/scenes/Game';
import { Preloader } from '@/scenes/Preloader';
import { GAME_CONSTANTS } from '@/constants/game';

import { Game, type Types } from "phaser";

import { UIScene } from '@/scenes/UIScene';
import { bootParams } from '@/core/bootParams';
import { settingsStore } from '@/core/SettingsStore';

// URL params: ?renderer=canvas (browsers where WebGL fails), ?map=<id>, ?debug=1
if (bootParams.debug) settingsStore.setDebugEnabled(true);

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Types.Core.GameConfig = {
    type: bootParams.renderer === 'canvas' ? Phaser.CANVAS : bootParams.renderer === 'webgl' ? Phaser.WEBGL : Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: GAME_CONSTANTS.DEFAULT_BG_COLOR,
    pixelArt: true,
    roundPixels: true,
    scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [
        Boot,
        Preloader,
        MainGame,
        UIScene
    ]
};

// Set document title with worktree and port
const worktree = (import.meta.env as any).VITE_WORKTREE_NAME || (typeof window !== 'undefined' && window.location.port && window.location.port !== '5175' ? `port ${window.location.port}` : 'main');
const port = (import.meta.env as any).VITE_PORT || (typeof window !== 'undefined' ? window.location.port || '5175' : '5175');
if (typeof document !== 'undefined') {
  document.title = `Elementals — [${worktree}] (Port: ${port})`;
}

export default new Game(config);
