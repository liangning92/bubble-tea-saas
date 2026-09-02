import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.APP_URL || 'http://localhost:9222'
const TEST_PHONE = '081234567890'
const TEST_PASSWORD = 'admin123'

async function getConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

test.describe('POS App E2E', () => {
  test('login page renders with form elements', async ({ page }) => {
    const consoleErrors = await getConsoleErrors(page)
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto(APP_URL)
    await page.waitForLoadState('domcontentloaded')

    // Wait for the login form to appear
    const phoneInput = page.locator('input[type="tel"]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    const submitButton = page.locator('button[type="submit"]').first()

    try {
      await expect(phoneInput).toBeVisible({ timeout: 15000 })
      await expect(passwordInput).toBeVisible({ timeout: 5000 })
      await expect(submitButton).toBeVisible({ timeout: 5000 })
    } catch (e) {
      // Page didn't load login form - capture what IS there
      const body = await page.locator('body').textContent()
      const html = await page.content()
      console.log('Page body:', body?.slice(0, 500))
      console.log('Page HTML snippet:', html.slice(0, 1000))
      throw e
    }

    // Test account card
    await expect(page.getByText(TEST_PHONE)).toBeVisible()
    await expect(page.getByText(TEST_PASSWORD)).toBeVisible()

    // Report non-network console errors
    const fatalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch') &&
      !e.includes('ECONNREFUSED') &&
      !e.includes('net::ERR_CONNECTION_REFUSED') &&
      !e.includes('404')
    )
    expect(fatalErrors).toHaveLength(0)
  })

  test('login form accepts input', async ({ page }) => {
    await page.goto(APP_URL)
    await page.waitForLoadState('domcontentloaded')

    const phoneInput = page.locator('input[type="tel"]').first()
    const passwordInput = page.locator('input[type="password"]').first()

    await phoneInput.waitFor({ timeout: 15000 })
    await phoneInput.fill(TEST_PHONE)
    await passwordInput.fill(TEST_PASSWORD)

    expect(await phoneInput.inputValue()).toBe(TEST_PHONE)
    expect(await passwordInput.inputValue()).toBe(TEST_PASSWORD)
  })

  test('app window loads without JS crash', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto(APP_URL)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Page should have some content
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(5)

    // No fatal JS errors (404s are ok - they come from the app trying to load server resources)
    const fatalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch') &&
      !e.includes('ECONNREFUSED') &&
      !e.includes('net::ERR_CONNECTION_REFUSED') &&
      !e.includes('404') &&
      !e.includes('Failed to load resource')
    )
    if (fatalErrors.length > 0) {
      console.log('Fatal errors:', fatalErrors)
    }
    expect(fatalErrors).toHaveLength(0)
  })
})
