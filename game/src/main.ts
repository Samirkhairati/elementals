import { Boot } from '@/scenes/Boot';
import { Game as MainGame } from '@/scenes/Game';
import { Preloader } from '@/scenes/Preloader';
import { CONFIG } from '@/config';

import { Game, type Types } from "phaser";

import { UIScene } from '@/scenes/UIScene';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: CONFIG.backgroundColor,
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

export default new Game(config);
