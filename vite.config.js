import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev-only: forward the frontend's relative /api calls to the Express
      // backend (Task E1). The /api prefix is preserved (no rewrite), so the
      // browser can fetch "/api/menu/items/taco-suave" and Express receives the
      // same path. changeOrigin keeps the request Host consistent with the target.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
