import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Port contract: PORT (set by scripts/dev.mjs / dev-runner) > 5174.
const PORT = parseInt(process.env.PORT || '5174', 10)
const WORKTREE_NAME = process.env.WORKTREE_NAME || process.env.VITE_WORKTREE_NAME || ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    'import.meta.env.VITE_WORKTREE_NAME': JSON.stringify(WORKTREE_NAME),
    'import.meta.env.VITE_PORT': JSON.stringify(String(PORT)),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: PORT,
    strictPort: true,
  },
})
