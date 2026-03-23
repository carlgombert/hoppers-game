import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/levels': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/parties': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/saves': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
