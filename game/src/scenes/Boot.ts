 import { Scene } from "phaser";

export class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or a loading bar.
    //  The path is relative to the `public` folder of your project
  }

  create() {
    this.scene.start("Preloader");
  }
}
