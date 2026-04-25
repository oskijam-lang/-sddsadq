import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({`n  base: "/-SDDSADQ/",
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5177',
    },
  },
})
