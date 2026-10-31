import { ipcMain } from 'electron';
import { createProjectChannels } from './projectApi.js';
import { registerMapHandlers } from './mapHandlers.js';
import { registerSpriteHandlers } from './spriteHandlers.js';
import { registerTilesetHandlers } from './tilesetHandlers.js';

/** Register every project-data channel (pure table + dialog channels) on the main process. */
export function registerProjectHandlers(projectDir: string): void {
  for (const [channel, handler] of Object.entries(createProjectChannels(projectDir))) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => handler(...args));
  }
  registerTilesetHandlers();
  registerSpriteHandlers();
  registerMapHandlers();
}
