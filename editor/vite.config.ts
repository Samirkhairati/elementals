import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5174

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
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
