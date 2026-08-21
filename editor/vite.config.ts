import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5174
const WORKTREE_NAME = process.env.WORKTREE_NAME || ''

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
