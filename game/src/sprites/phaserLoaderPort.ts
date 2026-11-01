import type { Scene } from "phaser";
import type { LoaderPort } from "./characterLoader";
import { createPlannedAnimations } from "./spritePlan";

/** The Phaser side of the character loader: spritesheets through the scene's loader, animations through the global manager. */
export function phaserLoaderPort(scene: Scene): LoaderPort {
  return {
    textureExists: (key) => scene.textures.exists(key),
    queueSheet: (s) => {
      // Manifest URLs are relative to the web root; the scene's loader may still carry another path (e.g. data/maps).
      scene.load.setPath("");
      scene.load.spritesheet(s.textureKey, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight, margin: s.margin, spacing: s.spacing });
    },
    start: (done) => {
      scene.load.once("complete", done);
      scene.load.start();
    },
    createAnimations: (animations) => void createPlannedAnimations(scene.anims, animations),
  };
}
