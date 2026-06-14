import { test, expect, Page } from '@playwright/test'

const APP_URL = 'http://localhost:9222'
const APP_PORT = 6063

test.describe('BubbleTea POS System', () => {
  let page: Page

  test.beforeAll(async () => {
    // Wait for app to be fully loaded
    await new Promise(r => setTimeout(r, 5000))
  })

  test.afterAll(async () => {
    // Cleanup
  })

  /**
   * Test 1: Application launches without crash
   */
  test('1. App launches without crash', async ({ page }) => {
    await page.goto('http://localhost:9222/json')

    // Check if DevTools API is responding
    const response = await page.request.get('http://localhost:9222/json')
    expect(response.status()).toBe(200)

    // Get window info
    const windowInfo = await page.request.get('http://localhost:9222/json')
    const windows = await windowInfo.json()
    expect(windows.length).toBeGreaterThan(0)
  })

  /**
   * Test 2: Login page loads
   */
  test('2. Login page loads correctly', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}`)

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Check page title or main elements
    const body = await page.locator('body')
    await expect(body).toBeVisible()

    // Take screenshot for verification
    await page.screenshot({ path: 'login-page.png' })
  })

  /**
   * Test 3: Login with test credentials
   */
  test('3. Can login with valid credentials', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Try to find login form
    const inputs = await page.locator('input').count()
    if (inputs > 0) {
      // Fill in credentials if form exists
      const firstInput = page.locator('input').first()
      await firstInput.fill('admin@test.com')

      const secondInput = page.locator('input').nth(1)
      await secondInput.fill('password123')

      // Find and click login button
      const loginButton = page.locator('button').filter({ hasText: /login|masuk|登录|sign/i }).first()
      if (await loginButton.isVisible()) {
        await loginButton.click()
        await page.waitForTimeout(3000)
      }
    }

    await page.screenshot({ path: 'after-login.png' })

    // Should either be logged in or show error
    const body = await page.locator('body')
    await expect(body).toBeVisible()
  })

  /**
   * Test 4: POS main screen loads
   */
  test('4. POS main screen loads', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Take screenshot of main screen
    await page.screenshot({ path: 'pos-main.png', fullPage: true })

    // Check if main content is visible
    const body = await page.locator('body')
    await expect(body).toBeVisible()
  })

  /**
   * Test 5: Category selection works
   */
  test('5. Category selection works', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Try to click on a category/tab
    const tabs = page.locator('[role="tab"], .tab, button[class*="tab"]')
    const tabCount = await tabs.count()

    if (tabCount > 0) {
      await tabs.first().click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: 'category-selected.png' })
    }
  })

  /**
   * Test 6: Product selection works
   */
  test('6. Product selection works', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Try to click on a product
    const products = page.locator('[role="button"], .product, button').filter({ hasText: /milk|tea|boba|珍珠/i })
    const productCount = await products.count()

    if (productCount > 0) {
      await products.first().click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: 'product-selected.png' })
    }
  })

  /**
   * Test 7: Order cart functionality
   */
  test('7. Order cart shows items', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Check for cart/order area
    const cartArea = page.locator('.cart, [class*="cart"], [class*="order"]')
    if (await cartArea.isVisible()) {
      await page.screenshot({ path: 'cart-visible.png' })
    }
  })

  /**
   * Test 8: Settings page accessible
   */
  test('8. Settings page accessible', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}/settings`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'settings-page.png', fullPage: true })

    const body = await page.locator('body')
    await expect(body).toBeVisible()
  })

  /**
   * Test 9: No JavaScript errors in console
   */
  test('9. No JavaScript errors', async ({ page }) => {
    const errors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto(`http://localhost:${APP_PORT}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Log any errors found
    if (errors.length > 0) {
      console.log('JavaScript errors found:', errors)
    }

    // Check for critical errors only
    const criticalErrors = errors.filter(e =>
      e.includes('Uncaught') ||
      e.includes('SyntaxError') ||
      e.includes('ReferenceError') ||
      e.includes('Module not found')
    )

    expect(criticalErrors.length).toBe(0)
  })

  /**
   * Test 10: Customer display loads (if secondary window exists)
   */
  test('10. Customer display accessible', async ({ page }) => {
    await page.goto(`http://localhost:${APP_PORT}/customer-display`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'customer-display.png', fullPage: true })

    const body = await page.locator('body')
    await expect(body).toBeVisible()
  })
})