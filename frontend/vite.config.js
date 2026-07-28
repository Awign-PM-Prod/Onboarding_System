import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@obs/backend': path.resolve(__dirname, '../backend/src')
    }
  },
  server: {
    port: 8088,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:8089',
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'node',
  },
})
