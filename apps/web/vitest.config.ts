import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Compiles .vue single-file components for component tests.
  plugins: [vue()],
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
    server: {
      // Vuetify ships CSS imports inside its JS; let Vite transform them.
      deps: { inline: ['vuetify'] },
    },
  },
})
