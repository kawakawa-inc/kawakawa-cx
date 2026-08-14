import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Get commit SHA from environment (set in CI/CD)
const COMMIT_SHA = process.env.COMMIT_SHA || 'dev'

export default defineConfig({
  plugins: [vue()],
  define: {
    // Inject build version into the app
    __APP_VERSION__: JSON.stringify(COMMIT_SHA),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true, // Better for WSL2
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        // `changeOrigin` is deliberately NOT set. It rewrites the Host header to
        // the proxy target, so the API would see `localhost:3000` while the
        // browser sent `Origin: http://localhost:5173` — and the CSRF check
        // (middleware/csrf.ts), which compares the two, would 403 every mutation
        // in local dev. Preserving the browser's Host makes them agree with no
        // per-developer configuration. The target is a plain Express server on
        // localhost, not a virtual host, so it has no use for the rewrite.
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
  optimizeDeps: {
    exclude: [
      '@kawakawa/types',
      '@kawakawa/types/settings',
      '@kawakawa/types/xit',
      '@kawakawa/types/shopping-list',
    ],
  },
})
