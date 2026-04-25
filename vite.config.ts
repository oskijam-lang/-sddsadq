import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: 强制相对路径，避免读取源码入口导致 MIME 报错
  base: './',
  server: {
    // Frontend uses relative `/api/*`; proxy to local paper-api (server/index.mjs)
    proxy: {
      '/api': 'http://127.0.0.1:5177',
    },
  },
})