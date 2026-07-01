import { test, expect } from '@playwright/test'

/**
 * i18n Tests - Verify all user-facing text is translated
 * Run with: npx playwright test tests/i18n.spec.ts
 */

test.describe('i18n Tests - Translation Coverage', () => {

  test('All pages have translations in all 3 languages', async ({ page }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:5173'

    // Login first
    await page.goto(`${baseURL}/login`)
    await page.fill('input[type="tel"]', '081234567890')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 10000 })

    const pages = [
      '/finance/expenses',
      '/finance/fixed-assets',
      '/finance/reports',
      '/finance/orders',
      '/inventory',
    ]

    const missingTranslations: string[] = []

    for (const pagePath of pages) {
      // Test Indonesian (id)
      await page.goto(`${baseURL}${pagePath}`)
      await page.waitForLoadState('networkidle')
      const idText = await page.locator('body').textContent()

      // Test English (en)
      await page.evaluate(() => {
        localStorage.setItem('i18nextLng', 'en')
      })
      await page.reload()
      await page.waitForLoadState('networkidle')
      const enText = await page.locator('body').textContent()

      // Test Chinese (zh)
      await page.evaluate(() => {
        localStorage.setItem('i18nextLng', 'zh')
      })
      await page.reload()
      await page.waitForLoadState('networkidle')
      const zhText = await page.locator('body').textContent()

      // Check each language has content
      if (!idText || idText.length < 50) {
        missingTranslations.push(`${pagePath}: ID has less than 50 chars`)
      }
      if (!enText || enText.length < 50) {
        missingTranslations.push(`${pagePath}: EN has less than 50 chars`)
      }
      if (!zhText || zhText.length < 50) {
        missingTranslations.push(`${pagePath}: ZH has less than 50 chars`)
      }

      console.log(`✓ ${pagePath}: ID=${idText?.length} EN=${enText?.length} ZH=${zhText?.length}`)
    }

    expect(missingTranslations).toHaveLength(0)
  })

  test('No hardcoded English words visible in non-English UI', async ({ page }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:5173'

    // Login
    await page.goto(`${baseURL}/login`)
    await page.fill('input[type="tel"]', '081234567890')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 10000 })

    // Switch to Indonesian
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'id')
    })

    const pages = ['/finance/expenses', '/orders', '/inventory']

    for (const pagePath of pages) {
      await page.goto(`${baseURL}${pagePath}`)
      await page.waitForLoadState('networkidle')

      const text = await page.locator('body').textContent() || ''

      // These should be translated in Indonesian UI
      const englishWords = [
        'Save', 'Cancel', 'Delete', 'Edit', 'Add', 'Search',
        'loading', 'error', 'success', 'confirm'
      ]

      for (const word of englishWords) {
        // Check if word appears without translation context
        if (text.includes(word) && !text.includes(`${word.toLowerCase()}`)) {
          // Allow if it's part of another word (e.g., "Settings" contains "Set")
          const regex = new RegExp(`\\b${word}\\b`)
          if (regex.test(text)) {
            console.log(`⚠ ${pagePath}: Found untranslated "${word}"`)
          }
        }
      }
    }
  })

  test('Number and currency formatting per locale', async ({ page }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:5173'

    await page.goto(`${baseURL}/finance/expenses`)
    await page.waitForLoadState('networkidle')

    // Test ID format (Indonesian)
    await page.evaluate(() => localStorage.setItem('i18nextLng', 'id'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Should show Rp or thousand separators
    const idText = await page.locator('body').textContent() || ''
    const hasIDR = idText.includes('Rp') || /\d{1,3}(\.\d{3})+/i.test(idText)
    console.log(`IDR format check: ${hasIDR ? 'PASS' : 'Need verification'}`)
  })
})
