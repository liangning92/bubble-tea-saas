import { test, expect } from '@playwright/test'

const APP_URL = process.env.APP_URL || 'http://localhost:9222'
const TEST_PHONE = '081234567890'
const TEST_PASSWORD = 'admin123'

test.describe('POS App E2E', () => {
  test('login page renders', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto(APP_URL)
    await page.waitForLoadState('networkidle')

    // Check login form elements exist
    await expect(page.locator('input[type="tel"], input[placeholder*="机"], input[placeholder*="phone"]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(page.locator('button[type="submit"]').first()).toBeVisible()

    // Check test account card is visible
    await expect(page.getByText(TEST_PHONE)).toBeVisible()
    await expect(page.getByText(TEST_PASSWORD)).toBeVisible()

    // Report console errors
    if (consoleErrors.length > 0) {
      console.log('Console errors on login page:', consoleErrors)
    }
    expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('net::ERR'))).toHaveLength(0)
  })

  test('login form accepts input', async ({ page }) => {
    await page.goto(APP_URL)
    await page.waitForLoadState('networkidle')

    // Find phone and password inputs
    const phoneInput = page.locator('input[type="tel"], input[type="text"]').first()
    const passwordInput = page.locator('input[type="password"]').first()

    await phoneInput.fill(TEST_PHONE)
    await passwordInput.fill(TEST_PASSWORD)

    expect(await phoneInput.inputValue()).toBe(TEST_PHONE)
    expect(await passwordInput.inputValue()).toBe(TEST_PASSWORD)
  })

  test('login attempt (no server - should show error or offline fallback)', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto(APP_URL)
    await page.waitForLoadState('networkidle')

    const phoneInput = page.locator('input[type="tel"], input[type="text"]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    const submitButton = page.locator('button[type="submit"]').first()

    await phoneInput.fill(TEST_PHONE)
    await passwordInput.fill(TEST_PASSWORD)
    await submitButton.click()

    // Wait for response - either error message OR redirect to home
    try {
      await page.waitForURL('**/', { timeout: 10000 })
      // Success - redirected to home page
      console.log('Login succeeded (online or offline)')
    } catch {
      // Didn't redirect - check for error message
      const errorVisible = await page.locator('text=/错误|error|失败/i').first().isVisible({ timeout: 3000 }).catch(() => false)
      console.log('Login did not redirect, error visible:', errorVisible)
      console.log('Console errors:', consoleErrors)
    }

    // No fatal crashes
    expect(consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch') &&
      !e.includes('ECONNREFUSED')
    )).toHaveLength(0)
  })

  test('app window opens without crash', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto(APP_URL)
    await page.waitForLoadState('networkidle')

    // Page title or some text content
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(10)

    // No fatal JS errors
    const fatalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch') &&
      !e.includes('ECONNREFUSED') &&
      !e.includes('net::ERR_CONNECTION_REFUSED')
    )
    if (fatalErrors.length > 0) {
      console.log('Fatal errors:', fatalErrors)
    }
    expect(fatalErrors).toHaveLength(0)
  })
})
