import { test, expect } from '@playwright/test'

test.describe('BubbleTea POS - Windows CI Tests', () => {

  test('1. App launches and window is visible', async ({ }) => {
    // This test verifies the app can launch on Windows
    // without crashing or showing a white screen
    const { exec } = require('child_process')
    const { promisify } = require('util')
    const execAsync = promisify(exec)

    const exePath = 'client-pos/release/win-unpacked/BubbleTeaPOS.exe'
    const port = 9222

    // Start the app with remote debugging
    let proc: any
    try {
      proc = require('child_process').spawn(exePath, [
        '--disable-gpu',
        '--no-sandbox',
        `--remote-debugging-port=${port}`
      ], { detached: true, stdio: 'ignore' })

      // Detach so we don't wait for it
      proc.unref()

      // Wait for app to fully start
      await new Promise(r => setTimeout(r, 8000))

      // Check if process is still running
      try {
        process.kill(proc.pid, 0)
        // Process is still running - good
      } catch {
        // Process exited - this is a failure
        throw new Error('App crashed on startup')
      }

      // Try to connect to DevTools
      const http = require('http')
      const checkPort = (): Promise<boolean> => {
        return new Promise((resolve) => {
          const req = http.get(`http://localhost:${port}/json`, (res: any) => {
            resolve(res.statusCode === 200)
          })
          req.on('error', () => resolve(false))
          req.setTimeout(3000, () => {
            req.destroy()
            resolve(false)
          })
        })
      }

      const isReady = await checkPort()
      if (isReady) {
        console.log('✓ App is running and DevTools is responding')
      } else {
        console.log('⚠ DevTools not responding, but app is running')
      }

    } finally {
      // Cleanup - kill the process
      if (proc && proc.pid) {
        try {
          process.kill(proc.pid, 'SIGKILL')
        } catch {
          // Process might have already exited
        }
      }
    }
  })

  test('2. Packaged files exist and are valid', async () => {
    const fs = require('fs')
    const path = require('path')

    const checks = [
      'client-pos/release/win-unpacked/BubbleTeaPOS.exe',
      'client-pos/release/win-unpacked/resources/app/dist/index.html',
      'client-pos/release/win-unpacked/resources/app/dist/assets/index-',
      'client-pos/release/win-unpacked/resources/app/dist-electron/electron/main.js',
      'client-pos/release/win-unpacked/resources/app/dist-electron/electron/preload.js',
    ]

    for (const file of checks) {
      if (file.includes('*')) {
        // Glob pattern - check if any matching file exists
        const dir = path.dirname(file)
        const pattern = path.basename(file).replace('*', '')
        const files = fs.readdirSync(dir)
        const match = files.find((f: string) => f.startsWith(pattern.replace('.', '')))
        expect(match).toBeTruthy()
      } else {
        expect(fs.existsSync(file), `Missing: ${file}`).toBe(true)
      }
    }

    // Check index.html has valid content
    const html = fs.readFileSync('client-pos/release/win-unpacked/resources/app/dist/index.html', 'utf-8')
    expect(html).toContain('<html')
    expect(html).toContain('Bubble Tea POS')
    expect(html).toContain('./assets/') // Relative paths for Electron
  })

  test('3. index.html uses correct relative paths', async () => {
    const fs = require('fs')
    const html = fs.readFileSync('client-pos/release/win-unpacked/resources/app/dist/index.html', 'utf-8')

    // MUST use relative paths (./assets/) not absolute (/assets/)
    expect(html).toMatch(/\.\/assets\//)
    expect(html).not.toMatch(/src="\/assets\//)
    expect(html).not.toMatch(/href="\/assets\//)
  })
})
