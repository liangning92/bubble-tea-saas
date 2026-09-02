import { test, expect, _electron as electron } from '@playwright/test'

const TEST_PHONE = '081234567890'
const TEST_PASSWORD = 'admin123'

test.describe('POS App E2E', () => {
  test('login page renders with form elements', async () => {
    const exePath = process.env.ELECTRON_EXE || 'dist/win-unpacked/bubble-tea-pos.exe'
    console.log('Launching:', exePath)

    const app = await electron.launch({
      executablePath: exePath,
      args: ['--disable-gpu', '--no-sandbox'],
    })

    const errors: string[] = []
    app.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    const page = app.window()!
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

    const fatalErrors = errors.filter(e =>
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

    await app.close()
  })

  test('app loads without crash', async () => {
    const exePath = process.env.ELECTRON_EXE || 'dist/win-unpacked/bubble-tea-pos.exe'
    const app = await electron.launch({
      executablePath: exePath,
      args: ['--disable-gpu', '--no-sandbox'],
    })

    const errors: string[] = []
    app.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    const page = app.window()!
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

    await app.close()
  })
})
