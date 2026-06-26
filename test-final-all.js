const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 最终完整测试 ===\n');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const tests = [
    { name: '优惠券(/new)', url: '/marketing/promotions/coupons/new', fills: [{ sel: 'input[placeholder="DISCOUNT10"]', val: 'C' + Date.now() }, { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' }, { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }], submit: 'button.btn-primary' },
    { name: '活动(/new)', url: '/marketing/promotions/campaigns/new', fills: [{ sel: 'input[type="text"]', val: 'A' + Date.now() }, { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' }, { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }], submit: 'button.btn-primary' },
    { name: '促销类别', url: '/marketing/promotions/campaign-categories', modal: 'button:has-text("Tambah")', fills: [{ sel: '[class*="fixed"] input', val: 'C' + Date.now() }], submit: '[class*="fixed"] button:has-text("Simpan")' },
  ];

  let passed = 0, failed = 0;

  for (const test of tests) {
    let apiStatus = null;
    page.on('response', r => {
      if (r.url().includes('/api/marketing') && r.request().method() === 'POST') {
        r.json().then(b => apiStatus = b.code).catch(() => apiStatus = r.status());
      }
    });

    try {
      await page.goto(`${BASE_URL}${test.url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const addBtn = test.modal ? await page.$(test.modal) : null;
      if (addBtn) {
        await addBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }

      for (const f of test.fills) {
        const inp = await page.$(f.sel);
        if (inp) await inp.fill(f.val);
      }
      await page.waitForTimeout(500);

      const btn = await page.$(test.submit);
      if (btn) await btn.click({ force: true });
      await page.waitForTimeout(2500);

      console.log(`${test.name}: ${apiStatus === 201 ? '✅ ' + apiStatus : '❌ ' + (apiStatus || 'no response')}`);
      if (apiStatus === 201) passed++; else failed++;
    } catch (e) {
      console.log(`${test.name}: ❌ ${e.message.substring(0, 30)}`);
      failed++;
    }
    page.removeAllListeners('response');
  }

  console.log(`\n通过: ${passed}, 失败: ${failed}`);
  await browser.close();
})();
