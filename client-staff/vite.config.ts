import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'

export default defineConfig({
  plugins: [react(), {
    name: 'employee-offline-shell',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).sort().map(name => '/' + name)
      const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16)
      this.emitFile({ type: 'asset', fileName: 'employee-shell.json', source: JSON.stringify({ version, assets: ['/', ...assets] }) })
    }
  }],
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