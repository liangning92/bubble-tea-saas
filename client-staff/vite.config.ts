import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    allowedHosts: ['.aicube.online', 'aicube.online'],
    proxy: {
      '/api': {
        target: 'http://localhost:7072',
        changeOrigin: true
      }
    }
  }
})