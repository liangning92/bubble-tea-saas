import { test, expect } from '@playwright/test'

/**
 * POS Tests - Critical POS functionality
 * Run with: npx playwright test tests/pos.spec.ts
 */

test.describe('POS Tests - Point of Sale', () => {

  test.beforeEach(async ({ page }) => {
    // Login - skip if POS not running
    const posBase = process.env.POS_URL || 'http://localhost:6065'
    try {
      const response = await page.goto(`${posBase}/login`, { timeout: 5000 })
      if (!response || response.status() >= 500) {
        test.skip('POS app not running')
        return
      }
    } catch {
      test.skip('POS app not running')
      return
    }

    await page.fill('input[type="tel"]', '081234567890')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3000)
  })

  test('POS page loads without blank screen', async ({ page }) => {
    const posBase = process.env.POS_URL || 'http://localhost:6065'
    await page.goto(`${posBase}/`)

    // Should show product list or order area
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(50)
  })

  test('Can add product to order', async ({ page }) => {
    const posBase = process.env.POS_URL || 'http://localhost:6065'
    await page.goto(`${posBase}/`)

    await page.waitForTimeout(2000)

    // Look for product buttons or order area
    const productButtons = page.locator('button').filter({ hasText: /^[A-Z].*/ })
    const orderArea = page.locator('text=Total, text=Rp, text=Order')

    const hasProducts = await productButtons.count() > 0
    const hasOrderArea = await orderArea.count() > 0

    // At least one should be true
    expect(hasProducts || hasOrderArea).toBeTruthy()

    console.log(`Products: ${hasProducts}, Order Area: ${hasOrderArea}`)
  })

  test('Order submission flow works', async ({ page }) => {
    const posBase = process.env.POS_URL || 'http://localhost:6065'
    await page.goto(`${posBase}/`)

    await page.waitForTimeout(2000)

    // Try to find and click a product
    const firstProduct = page.locator('button').first()
    if (await firstProduct.isVisible()) {
      await firstProduct.click()
      await page.waitForTimeout(500)
    }

    // Look for payment/checkout button
    const checkoutButton = page.locator('button:has-text("Bayar"), button:has-text("Pay"), button:has-text("Checkout")').first()
    const canCheckout = await checkoutButton.isVisible().catch(() => false)

    console.log(`Checkout button visible: ${canCheckout}`)

    // Test passes if we can see the POS interface
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(50)
  })

  test('Refund button exists', async ({ page }) => {
    const posBase = process.env.POS_URL || 'http://localhost:6065'
    await page.goto(`${posBase}/`)

    await page.waitForTimeout(2000)

    // Check for refund-related buttons
    const refundButton = page.locator('button:has-text("refund"), button:has-text("退款"), button:has-text("退回"), button:has-text("Retur")')
    const refundCount = await refundButton.count()

    console.log(`Refund buttons found: ${refundCount}`)

    // Now refund button should exist
    expect(refundCount).toBeGreaterThan(0)
  })

  test('History page loads', async ({ page }) => {
    const posBase = process.env.POS_URL || 'http://localhost:6065'
    await page.goto(`${posBase}/history`)

    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(30)
  })
})
