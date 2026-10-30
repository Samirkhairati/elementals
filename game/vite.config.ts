import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Port contract: GAME_PORT (set by scripts/dev.mjs) > PORT (legacy) > 5175.
const PORT = parseInt(process.env.GAME_PORT || process.env.PORT || '5175', 10);
const WORKTREE_NAME = process.env.WORKTREE_NAME || process.env.VITE_WORKTREE_NAME || '';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    'import.meta.env.VITE_WORKTREE_NAME': JSON.stringify(WORKTREE_NAME),
    'import.meta.env.VITE_PORT': JSON.stringify(String(PORT)),
  },
  server: {
    port: PORT,
    // Fail loudly on a collision instead of silently moving to another port
    // (the dev banner would then print the wrong URL).
    strictPort: true,
  }
});
