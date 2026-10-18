const { chromium, expect } = require('@playwright/test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

;(async () => {
  const { createServer } = await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/index.js')).href)
  const tailwind = (await import(pathToFileURL(path.resolve('client-admin/tailwind.config.js')).href)).default
  tailwind.content = [path.resolve('client-admin/src/**/*.{js,ts,jsx,tsx}')]
  const origin = 'http://127.0.0.1:6321'
  const server = await createServer({ configFile: false, root: path.resolve('client-admin'), cacheDir: '/tmp/admin-payroll-vite', css: { postcss: { plugins: [require('tailwindcss')(tailwind), require('autoprefixer')()] } }, server: { host: '127.0.0.1', port: 6321, strictPort: true } })
  let browser
  try {
    await server.listen()
    browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' })
    const errors = []
    const requests = []
    await context.addInitScript(() => {
      localStorage.setItem('bubble-tea-language', 'zh')
      sessionStorage.setItem('auth-storage', JSON.stringify({ state: { isAuthenticated: true, token: 'synthetic-only', user: { id: 'owner', role: 'admin', storeId: 'store', staff: null } }, version: 0 }))
    })
    await context.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      requests.push(url)
      assert.equal(request.method(), 'GET')
      let data = {}
      if (url.pathname === '/api/expenses') data = { list: [{ id: 'paid-salary', storeId: 'store', type: 'salary', category: 'salary', amount: 65000000, description: 'Synthetic salary · 2026-10', date: '2026-10-11T00:00:00.000Z', createdAt: '2026-10-18T15:29:59.309Z', referenceType: 'salary', referenceId: 'salary-id' }] }
      if (url.pathname === '/api/expenses/summary') data = { total: 65000000, byCategory: [{ category: 'salary', amount: 65000000 }], pendingSalaryMinor: 245000000, count: 1 }
      if (url.pathname === '/api/expenses/categories') data = { list: [{ key: 'salary', label: '', isDefault: true }, { key: 'other', label: '', isDefault: true }] }
      if (url.pathname === '/api/expenses/recurring') data = { revision: 0, items: [] }
      if (url.pathname === '/api/finance/profit') data = { revenue: 15000000, cogs: 1000000, grossProfit: 14000000, grossMargin: 93, operatingCosts: { actual: 12729000, salary: 2450000, other: 10279000 }, totalOperatingCosts: 12729000, netProfit: 1271000, netMargin: 8, isEstimate: false }
      if (url.pathname === '/api/finance/income-statement') data = { revenue: { totalSales: 15000000, ppnCollected: null, netSales: 15000000 }, costOfGoods: { total: 1000000 }, grossProfit: { amount: 14000000, margin: 93 }, operatingExpenses: { actual: 12729000, salary: 2450000, other: 10279000 }, depreciationIncluded: false, depreciationExpense: 0, netProfit: { amount: 1271000, margin: 8 } }
      if (url.pathname === '/api/finance/cash-flow') data = { inflows: { cashSales: 15000000, otherSales: 0 }, outflows: { inventoryPurchases: 0, staffSalaries: 650000, otherExpenses: 10279000 }, totalOutflows: 10929000, netCashFlow: 4071000 }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data }) })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + '/finance/expenses')
    await expect(page.getByText('待发工资: Rp 2.450.000')).toBeVisible()
    await expect(page.getByText('Synthetic salary · 2026-10')).toBeVisible()
    await expect(page.locator('time[datetime="2026-10-18T15:29:59.309Z"]')).toHaveText('2026-10-18 22:29')
    await expect(page.getByText('Rp 650.000').first()).toBeVisible()
    const salaryRow = page.getByText('Synthetic salary · 2026-10').locator('xpath=ancestor::div[contains(@class,"shadow-sm")]')
    // Source verification is available without enabling edits or deletion of payroll amounts.
    await expect(salaryRow.getByRole('button', { name: '核对付款来源' })).toBeVisible()
    assert.equal(await salaryRow.locator('.text-right').getByRole('button').count(), 0)
    await page.goto(origin + '/finance/reports')
    await expect(page.getByText('Rp 2.450.000').first()).toBeVisible()
    await page.getByRole('button', { name: '损益表' }).click()
    await expect(page.getByText('Rp 2.450.000').first()).toBeVisible()
    const previousYear = String(new Date().getFullYear() - 1)
    await page.locator('select').filter({ has: page.locator(`option[value="${previousYear}"]`) }).first().selectOption(previousYear)
    await expect.poll(() => requests.filter(url => url.pathname === '/api/finance/income-statement').at(-1)?.searchParams.get('month')?.startsWith(previousYear + '-')).toBe(true)
    await page.getByRole('button', { name: '现金流' }).click()
    await expect(page.getByText('Rp 650.000').first()).toBeVisible()
    assert.deepEqual(errors, [])
    console.log('PASS payroll expense, pending wages and finance report breakdown render in the real admin UI')
    await context.close()
  } finally {
    if (browser) await browser.close()
    await server.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
