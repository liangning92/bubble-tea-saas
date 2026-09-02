import { test, expect, chromium, Browser, Page } from '@playwright/test'

const DEVTOOLS_URL = process.env.DEVTOOLS_URL || 'http://localhost:9222'
const TEST_PHONE = '081234567890'
const TEST_PASSWORD = 'admin123'

async function getAppUrl(): Promise<string> {
  // Fetch DevTools targets to get the actual page URL
  const response = await fetch(`${DEVTOOLS_URL}/json`)
  const targets = await response.json()
  if (targets && targets.length > 0) {
    return targets[0].url
  }
  throw new Error('No DevTools targets found')
}

async function attachToElectronPage(): Promise<{ browser: Browser; page: Page }> {
  // We need to use Playwright's CDP connection to attach to the Electron app
  // The Electron app is already running with --remote-debugging-port=9222
  // We connect via HTTP to get the WebSocket URL, then attach
  const response = await fetch(`${DEVTOOLS_URL}/json`)
  const targets = await response.json()
  if (!targets || targets.length === 0) {
    throw new Error('No targets found')
  }

  const wsUrl = targets[0].webSocketDebuggerUrl
  console.log('WebSocket URL:', wsUrl)

  // Connect to the existing browser via CDP
  const browser = await chromium.connectOverCDP(wsUrl)
  const context = browser.contexts()[0] || await browser.newContext()
  const page = context.pages()[0] || await context.newPage()

  return { browser, page }
}

test.describe('POS App E2E', () => {
  test('login page renders with form elements', async () => {
    const { browser, page } = await attachToElectronPage()
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.waitForLoadState('domcontentloaded')
    // Wait for React to render
    await page.waitForTimeout(5000)

    const title = await page.title()
    console.log('Page title:', title)
    const body = await page.locator('body').textContent()
    console.log('Body preview:', body?.slice(0, 300))

    // Check for login form inputs
    const phoneInput = page.locator('input[type="tel"]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    const submitButton = page.locator('button[type="submit"]').first()

    const phoneVisible = await phoneInput.isVisible({ timeout: 5000 }).catch(() => false)
    console.log('Phone input visible:', phoneVisible)

    if (!phoneVisible) {
      // Dump all inputs for debugging
      const inputs = await page.locator('input').all()
      console.log('Total inputs:', inputs.length)
      for (const inp of inputs.slice(0, 10)) {
        const attrs = {
          type: await inp.getAttribute('type'),
          placeholder: await inp.getAttribute('placeholder'),
          id: await inp.getAttribute('id'),
          class: (await inp.getAttribute('class') || '').slice(0, 50)
        }
        console.log('Input:', attrs)
      }
    }

    await expect(phoneInput).toBeVisible({ timeout: 20000 })
    await expect(passwordInput).toBeVisible({ timeout: 5000 })
    await expect(submitButton).toBeVisible({ timeout: 5000 })

    // Test account visible
    await expect(page.getByText(TEST_PHONE)).toBeVisible()

    // Fill form
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
  })

  test('app loads without crash', async () => {
    const { browser, page } = await attachToElectronPage()
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

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
  })
})
