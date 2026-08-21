import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5175;
const WORKTREE_NAME = process.env.WORKTREE_NAME || '';

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
  }
});
