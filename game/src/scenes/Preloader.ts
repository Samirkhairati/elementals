import { Scene } from 'phaser';
import { AnimationManager } from '../utils/AnimationManager';

export class Preloader extends Scene {
  constructor() {
    super('Preloader');
  }

  init() {
    this.cameras.main.setBackgroundColor(0xffffff);
  }

  preload() {
    this.load.setPath('assets');

    // UI & Effect Assets
    this.load.image('logo', 'logo.png');
    this.load.image('star', 'star.png');
    
    // Player Assets
    // Spritesheet: 4x4 grid (Down, Left, Right, Up)
    this.load.spritesheet('player', 'player/spritesheet.png', {
      frameWidth: 32,
      frameHeight: 48,
    });
  }

  create() {
    this.initializeAnimations();
    this.scene.start('Game');
  }

  private initializeAnimations() {
    const animManager = AnimationManager.getInstance(this);
    animManager.createCharacterAnimations('player', 'player');
  }
}
