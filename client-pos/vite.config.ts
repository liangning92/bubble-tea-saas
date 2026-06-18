import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',  // 使用相对路径，打包后能正确加载资源
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 6063,
    allowedHosts: ['.serveo.net', '.serveousercontent.com', '.trycloudflare.com', '.loca.lt', '.aicube.online', 'aicube.online'],
    proxy: {
      '/api': {
        target: 'http://localhost:7072',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})