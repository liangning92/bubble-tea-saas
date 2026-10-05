import { test, expect } from '@playwright/test'

const APP_URL = process.env.APP_URL || 'http://localhost:9222'
const TEST_PHONE = (process.env.TEST_ADMIN_PHONE || '')
const TEST_PASSWORD = (process.env.TEST_ADMIN_PASSWORD || '')

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

    // Test credentials are injected only through the test environment and are never rendered.

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

    const formPhone = TEST_PHONE || '0000000000'
    const formPassword = TEST_PASSWORD || 'non-authenticating-test-value'
    await phoneInput.fill(formPhone)
    await passwordInput.fill(formPassword)

    expect(await phoneInput.inputValue()).toBe(formPhone)
    expect(await passwordInput.inputValue()).toBe(formPassword)
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

    test.skip(!TEST_PHONE || !TEST_PASSWORD, 'Set TEST_ADMIN_PHONE and TEST_ADMIN_PASSWORD to exercise authentication')
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
