import { test, expect, chromium } from '@playwright/test'
import { spawn } from 'child_process'
import * as http from 'http'

const TEST_PHONE = '081234567890'
const TEST_PASSWORD = 'admin123'

async function getDevToolsTarget(port: number): Promise<{ wsUrl: string; pageUrl: string } | null> {
  return new Promise((resolve) => {
    let attempts = 0
    const tryConnect = () => {
      const req = http.get(`http://localhost:${port}/json`, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const targets = JSON.parse(data)
            if (targets && targets.length > 0 && targets[0].webSocketDebuggerUrl) {
              resolve({
                wsUrl: targets[0].webSocketDebuggerUrl,
                pageUrl: targets[0].url,
              })
            } else if (targets && targets.length > 0) {
              // Try with page URL directly
              resolve({
                wsUrl: `ws://localhost:${port}`,
                pageUrl: targets[0].url || `http://localhost:${port}`,
              })
            } else {
              attempts++
              if (attempts > 30) resolve(null)
              else setTimeout(tryConnect, 1000)
            }
          } catch {
            attempts++
            if (attempts > 30) resolve(null)
            else setTimeout(tryConnect, 1000)
          }
        })
      })
      req.on('error', () => {
        attempts++
        if (attempts > 30) resolve(null)
        else setTimeout(tryConnect, 1000)
      })
    }
    // Wait 3s for app to start
    setTimeout(tryConnect, 3000)
  })
}

test.describe('POS App E2E', () => {
  test('login page renders and accepts input', async () => {
    const exePath = process.env.ELECTRON_EXE || 'dist/win-unpacked/bubble-tea-pos.exe'
    console.log('Launching:', exePath)

    const appProcess = spawn(exePath, ['--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222'], {
      stdio: 'ignore',
      detached: false,
    })

    try {
      const target = await getDevToolsTarget(9222)
      if (!target) {
        throw new Error('Could not connect to Electron DevTools')
      }
      console.log('Got CDP target, WS:', target.wsUrl)

      const browser = await chromium.connectOverCDP(target.wsUrl)
      const context = browser.contexts()[0] || await browser.newContext()
      const page = context.pages()[0] || await context.newPage()

      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await page.goto(target.pageUrl)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(5000)

      const title = await page.title()
      console.log('Page title:', title)
      const body = await page.locator('body').textContent()
      console.log('Body preview:', body?.slice(0, 300))

      const phoneInput = page.locator('input[type="tel"]').first()
      const passwordInput = page.locator('input[type="password"]').first()
      const submitButton = page.locator('button[type="submit"]').first()

      const phoneVisible = await phoneInput.isVisible({ timeout: 5000 }).catch(() => false)
      console.log('Phone visible:', phoneVisible)

      if (!phoneVisible) {
        const inputs = await page.locator('input').all()
        console.log('Inputs count:', inputs.length)
        for (const inp of inputs.slice(0, 10)) {
          console.log('Input:', {
            type: await inp.getAttribute('type'),
            placeholder: await inp.getAttribute('placeholder'),
          })
        }
      }

      await expect(phoneInput).toBeVisible({ timeout: 20000 })
      await expect(passwordInput).toBeVisible({ timeout: 5000 })
      await expect(submitButton).toBeVisible({ timeout: 5000 })
      await expect(page.getByText(TEST_PHONE)).toBeVisible()

      await phoneInput.fill(TEST_PHONE)
      await passwordInput.fill(TEST_PASSWORD)
      expect(await phoneInput.inputValue()).toBe(TEST_PHONE)

      const fatalErrors = consoleErrors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('net::ERR') &&
        !e.includes('Failed to fetch') &&
        !e.includes('ECONNREFUSED') &&
        !e.includes('404')
      )
      if (fatalErrors.length > 0) {
        console.log('Fatal errors:', fatalErrors)
      }
      expect(fatalErrors).toHaveLength(0)

      await browser.close()
    } finally {
      appProcess.kill()
    }
  })

  test('app loads without crash', async () => {
    const exePath = process.env.ELECTRON_EXE || 'dist/win-unpacked/bubble-tea-pos.exe'
    const appProcess = spawn(exePath, ['--disable-gpu', '--no-sandbox', '--remote-debugging-port=9223'], {
      stdio: 'ignore',
      detached: false,
    })

    try {
      const target = await getDevToolsTarget(9223)
      if (!target) {
        throw new Error('Could not connect to Electron DevTools')
      }

      const browser = await chromium.connectOverCDP(target.wsUrl)
      const context = browser.contexts()[0] || await browser.newContext()
      const page = context.pages()[0] || await context.newPage()

      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })

      await page.goto(target.pageUrl)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(3000)

      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
      expect(body!.length).toBeGreaterThan(5)

      const fatalErrors = errors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('net::ERR') &&
        !e.includes('Failed to fetch') &&
        !e.includes('ECONNREFUSED') &&
        !e.includes('404') &&
        !e.includes('Failed to load resource')
      )
      if (fatalErrors.length > 0) {
        console.log('Fatal errors:', fatalErrors)
      }
      expect(fatalErrors).toHaveLength(0)

      await browser.close()
    } finally {
      appProcess.kill()
    }
  })
})
