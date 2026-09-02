import { test, expect, Page, chromium, ChromiumBrowser } from '@playwright/test'

const DEVTOOLS_URL = process.env.DEVTOOLS_URL || 'http://localhost:9222'
const TEST_PHONE = '081234567890'
const TEST_PASSWORD = 'admin123'

async function getActualPageUrl(devtoolsUrl: string): Promise<string> {
  // Get the actual page URL from DevTools JSON
  const response = await fetch(`${devtoolsUrl}/json`)
  const targets = await response.json()
  if (targets.length > 0 && targets[0].webSocketDebuggerUrl) {
    return targets[0].url
  }
  throw new Error('No page target found')
}

async function getConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

test.describe('POS App E2E', () => {
  test('login page renders and accepts input', async ({ page }) => {
    const consoleErrors = await getConsoleErrors(page)

    // Get actual app URL via DevTools JSON
    let appUrl: string
    try {
      const response = await fetch(`${DEVTOOLS_URL}/json`)
      const targets = await response.json()
      if (!targets || targets.length === 0) {
        throw new Error('No DevTools targets found')
      }
      appUrl = targets[0].url
      console.log('App URL:', appUrl)
    } catch (e) {
      console.log('Failed to get app URL from DevTools:', e)
      throw e
    }

    await page.goto(appUrl)
    await page.waitForLoadState('domcontentloaded')

    // Wait for React to render
    await page.waitForTimeout(3000)

    const phoneInput = page.locator('input[type="tel"]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    const submitButton = page.locator('button[type="submit"]').first()

    try {
      await expect(phoneInput).toBeVisible({ timeout: 20000 })
      await expect(passwordInput).toBeVisible({ timeout: 5000 })
      await expect(submitButton).toBeVisible({ timeout: 5000 })
    } catch (e) {
      const body = await page.locator('body').textContent()
      const title = await page.title()
      console.log('Page title:', title)
      console.log('Page body (first 500):', body?.slice(0, 500))
      throw e
    }

    // Fill form
    await phoneInput.fill(TEST_PHONE)
    await passwordInput.fill(TEST_PASSWORD)
    expect(await phoneInput.inputValue()).toBe(TEST_PHONE)
    expect(await passwordInput.inputValue()).toBe(TEST_PASSWORD)

    // Test account visible
    await expect(page.getByText(TEST_PHONE)).toBeVisible()

    // No fatal errors
    const fatalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch') &&
      !e.includes('ECONNREFUSED') &&
      !e.includes('404')
    )
    expect(fatalErrors).toHaveLength(0)
  })

  test('app window loads without crash', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    const response = await fetch(`${DEVTOOLS_URL}/json`)
    const targets = await response.json()
    if (!targets || targets.length === 0) throw new Error('No targets')
    const appUrl = targets[0].url

    await page.goto(appUrl)
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
  })
})
