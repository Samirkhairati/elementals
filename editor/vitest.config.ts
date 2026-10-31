import { defineConfig } from 'vitest/config'
import path from 'path'

const alias = { '@': path.resolve(__dirname, './src') }

// Two projects: jsdom for renderer code (src/**), node for Electron main-process code (electron/**).
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'electron',
          environment: 'node',
          include: ['electron/**/*.test.ts', '*.test.ts'],
        },
      },
    ],
  },
})
