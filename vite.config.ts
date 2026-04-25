import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: use relative base to avoid path/MIME issues
  base: './',
  server: {
    // Frontend uses relative `/api/*`; proxy to local paper-api (server/index.mjs)
    proxy: {
      '/api': 'http://127.0.0.1:5177',
    },
  },
})