import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Mirrors the build-time define in vite.config.ts. Without it, importing any
  // module that reads __APP_VERSION__ (e.g. syncService) throws under test.
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', 'e2e/'],
  },
})
