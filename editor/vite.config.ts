import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { projectApiPlugin } from './vite-plugin-project-api'

// Port contract: PORT (set by scripts/dev.mjs / dev-runner) > 5174.
const PORT = parseInt(process.env.PORT || '5174', 10)
// Browser harness: dev server only, see docs/editor-harness.md. ELEMENTALS_PROJECT_DIR points it at a copy.
const PROJECT_DIR = process.env.ELEMENTALS_PROJECT_DIR
  ? path.resolve(process.env.ELEMENTALS_PROJECT_DIR)
  : path.resolve(__dirname, '../project')
const WORKTREE_NAME = process.env.WORKTREE_NAME || process.env.VITE_WORKTREE_NAME || ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), projectApiPlugin({ projectDir: PROJECT_DIR })],
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
