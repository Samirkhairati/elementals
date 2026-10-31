// Global vitest setup: importing 'phaser' needs a browser window, but the game's pure logic only
// uses Phaser's EventEmitter (via utils/EventBus). Tests that need more mock 'phaser' themselves.
import { vi } from 'vitest';

vi.mock('phaser', async () => {
  const { EventEmitter } = await import('node:events');
  return { Events: { EventEmitter } };
});
