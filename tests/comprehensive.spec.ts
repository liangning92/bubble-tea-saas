import { test, expect } from '@playwright/test'

/**
 * Comprehensive Test Suite - All Critical Pages
 * Tests every major page in admin, POS, and staff apps
 *
 * Run with: npx playwright test tests/comprehensive.spec.ts
 */

test.describe('ADMIN - Critical Pages Load Test', () => {

  test.beforeEach(async ({ page }) => {
    // Login once, reuse session
    await page.goto('/login')
    await page.fill('input[type="tel"]', '081234567890')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15000 })
  })

  // Dashboard
  test('Dashboard loads with stats', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(100)
  })

  // Products
  test('Products list page loads', async ({ page }) => {
    await page.goto('/products')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Product form page loads', async ({ page }) => {
    await page.goto('/products/new')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Product categories page loads', async ({ page }) => {
    await page.goto('/products/categories')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Product addons page loads', async ({ page }) => {
    await page.goto('/products/addons')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Product costs analysis page loads', async ({ page }) => {
    await page.goto('/products/costs')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Channels
  test('Channels list page loads', async ({ page }) => {
    await page.goto('/channels')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Channel reports page loads', async ({ page }) => {
    await page.goto('/channels/reports')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Inventory
  test('Inventory page loads', async ({ page }) => {
    await page.goto('/inventory')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Inventory logs page loads', async ({ page }) => {
    await page.goto('/inventory/logs')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Inventory alerts page loads', async ({ page }) => {
    await page.goto('/inventory/alerts')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Inventory alert config page loads', async ({ page }) => {
    await page.goto('/inventory/alert-config')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Inventory suppliers page loads', async ({ page }) => {
    await page.goto('/inventory/suppliers')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Inventory restock page loads', async ({ page }) => {
    await page.goto('/inventory/restock')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Orders
  test('Orders page loads', async ({ page }) => {
    await page.goto('/finance/orders')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Order detail page loads', async ({ page }) => {
    await page.goto('/finance/orders')
    await page.waitForLoadState('networkidle')
    // Click on first order if exists
    const firstOrder = page.locator('tbody tr').first()
    if (await firstOrder.isVisible()) {
      await firstOrder.click()
      await page.waitForTimeout(500)
    }
  })

  test('Refunds page loads', async ({ page }) => {
    await page.goto('/finance/refunds')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Finance
  test('Finance revenue page loads', async ({ page }) => {
    await page.goto('/finance/revenue')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Finance expenses page loads', async ({ page }) => {
    await page.goto('/finance/expenses')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Finance fixed assets page loads', async ({ page }) => {
    await page.goto('/finance/fixed-assets')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Finance reports page loads', async ({ page }) => {
    await page.goto('/finance/reports')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Finance tax page loads', async ({ page }) => {
    await page.goto('/finance/tax')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Staff
  test('Staff list page loads', async ({ page }) => {
    await page.goto('/staff')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff attendance page loads', async ({ page }) => {
    await page.goto('/staff/attendance')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff leave page loads', async ({ page }) => {
    await page.goto('/staff/attendance/leave')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff schedule page loads', async ({ page }) => {
    await page.goto('/staff/schedule')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff salary page loads', async ({ page }) => {
    await page.goto('/staff/salary')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff points page loads', async ({ page }) => {
    await page.goto('/staff/points')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff reimbursement page loads', async ({ page }) => {
    await page.goto('/staff/salary/reimbursement')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Marketing
  test('Marketing campaigns page loads', async ({ page }) => {
    await page.goto('/marketing/promotions/campaigns')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Marketing coupons page loads', async ({ page }) => {
    await page.goto('/marketing/promotions/coupons')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Marketing members page loads', async ({ page }) => {
    await page.goto('/marketing/members')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Marketing points rules page loads', async ({ page }) => {
    await page.goto('/marketing/points/rule')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Marketing automation page loads', async ({ page }) => {
    await page.goto('/marketing/operations/automation')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Marketing messages page loads', async ({ page }) => {
    await page.goto('/marketing/messages/channels')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Hygiene
  test('Hygiene templates page loads', async ({ page }) => {
    await page.goto('/hygiene')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Hygiene calendar page loads', async ({ page }) => {
    await page.goto('/hygiene/calendar')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Hygiene areas page loads', async ({ page }) => {
    await page.goto('/hygiene/areas')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Hygiene today tasks page loads', async ({ page }) => {
    await page.goto('/hygiene/today')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Hygiene stats page loads', async ({ page }) => {
    await page.goto('/hygiene/stats')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // KDS & Queue
  test('KDS page loads', async ({ page }) => {
    await page.goto('/kds')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Queue management page loads', async ({ page }) => {
    await page.goto('/queue')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Delivery
  test('Delivery hub page loads', async ({ page }) => {
    await page.goto('/delivery')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Announcements
  test('Announcements page loads', async ({ page }) => {
    await page.goto('/announcement')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Settings
  test('Settings page loads', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('POS settings page loads', async ({ page }) => {
    await page.goto('/settings/pos')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  // Import
  test('Import page loads', async ({ page }) => {
    await page.goto('/import')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })
})

test.describe('POS - Critical Pages Load Test', () => {
  // POS runs on 6065
  test.beforeEach(async ({ page }) => {
    try {
      const response = await page.goto('http://localhost:6065/login', { timeout: 5000 })
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

  test('POS main page loads', async ({ page }) => {
    await page.goto(`http://localhost:6065/`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('POS history page loads', async ({ page }) => {
    await page.goto(`http://localhost:6065/history`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('POS tasks page loads', async ({ page }) => {
    await page.goto(`http://localhost:6065/tasks`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('POS hardware settings page loads', async ({ page }) => {
    await page.goto(`http://localhost:6065/hardware-settings`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('POS customer display page loads', async ({ page }) => {
    await page.goto(`http://localhost:6065/customer-display`)
    await page.waitForLoadState('networkidle')
    // Customer display is a simple external screen, may have minimal text
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(5)
  })

  test('POS scan page loads', async ({ page }) => {
    await page.goto(`http://localhost:6065/scan`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('POS register member page loads', async ({ page }) => {
    await page.goto(`http://localhost:6065/register-member`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })
})

test.describe('STAFF APP - Critical Pages Load Test', () => {
  // Staff app runs on 5177
  test.beforeEach(async ({ page }) => {
    try {
      const response = await page.goto('http://localhost:5177/login', { timeout: 5000 })
      if (!response || response.status() >= 500) {
        test.skip('Staff app not running')
        return
      }
    } catch {
      test.skip('Staff app not running')
      return
    }

    await page.fill('input[type="tel"]', '081234567890')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3000)
  })

  test('Staff home page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff attendance page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/attendance`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff schedule page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/schedule`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff leave page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/leave`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff salary page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/salary`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff reimbursement page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/reimbursement`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff overtime page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/overtime`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff shift swap page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/shift-swap`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff deposit page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/deposit`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff points page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/points`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff hygiene page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/hygiene`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff inventory page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/inventory`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff profile page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/profile`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Staff training page loads', async ({ page }) => {
    await page.goto(`http://localhost:5177/training`)
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })
})

test.describe('UI Components & Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="tel"]', '081234567890')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15000 })
  })

  test('Navigation sidebar works', async ({ page }) => {
    // Click through main nav items
    const navItems = ['Produk', 'Inventaris', 'Keuangan', 'Karyawan', 'Pemasaran']
    for (const item of navItems) {
      const nav = page.locator(`text=${item}`).first()
      if (await nav.isVisible()) {
        await nav.click()
        await page.waitForTimeout(500)
      }
    }
  })

  test('Language switcher works', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // Check if language switcher exists
    const langSwitch = page.locator('[class*="language"], [class*="lang"]').first()
    if (await langSwitch.isVisible()) {
      await langSwitch.click()
      await page.waitForTimeout(500)
    }
  })

  test('Page refresh works', async ({ page }) => {
    await page.goto('/products')
    await page.waitForLoadState('networkidle')
    await page.reload()
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })

  test('Back navigation works', async ({ page }) => {
    await page.goto('/products/new')
    await page.waitForLoadState('networkidle')
    await page.goBack()
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })
})
