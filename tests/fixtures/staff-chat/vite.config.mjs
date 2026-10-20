import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../../../', import.meta.url))
export default defineConfig({ root: 'tests/fixtures/staff-chat', plugins: [react()], css: { postcss: { plugins: [tailwindcss({ content: [repo + 'shared/**/*.{ts,tsx}', repo + 'client-staff/src/**/*.{ts,tsx}'] }), autoprefixer()] } }, build: { outDir: '../../../output/staff-chat-layout-20261020/fixture', emptyOutDir: true } })
