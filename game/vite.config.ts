import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5175;

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: PORT,
  }
});
