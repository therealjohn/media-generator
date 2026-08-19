import path from 'node:path'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    coverage: {
      enabled: false,
    },
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
