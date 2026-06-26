const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 测试完整表单流程 ===\n');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // 监听API
  page.on('response', async response => {
    if (response.url().includes('/api/marketing') && response.request().method() === 'POST') {
      const body = await response.json().catch(() => null);
      console.log(`API: ${response.status()} - ${body?.message || ''}`);
    }
  });

  // ========== 活动 ==========
  console.log('【活动】');
  await page.goto(`${BASE_URL}/marketing/promotions/campaigns`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.click('button:has-text("Buat Kampanye")');
  await page.waitForTimeout(1500);

  const campBtn = await page.$('button:has-text("Simpan")');
  const campDisabled1 = await campBtn?.getAttribute('disabled');
  console.log(`只有名称时: ${campDisabled1 !== null ? 'disabled ❌' : 'enabled ✅'}`);

  // 填名称
  await page.fill('input[type="text"]', '测试活动');
  await page.waitForTimeout(300);
  const campDisabled2 = await campBtn?.getAttribute('disabled');
  console.log(`填名称后: ${campDisabled2 !== null ? 'disabled ❌' : 'enabled ❌ (缺少日期)'}`);

  // 填日期
  const campDates = await page.$$('input[type="date"]');
  if (campDates.length >= 2) {
    await campDates[0].fill('2026-06-23');
    await campDates[1].fill('2026-12-31');
  }
  await page.waitForTimeout(300);
  const campDisabled3 = await campBtn?.getAttribute('disabled');
  console.log(`填日期后: ${campDisabled3 === null ? 'enabled ✅' : 'disabled ❌'}`);

  if (campDisabled3 === null) {
    await campBtn?.click();
    await page.waitForTimeout(3000);
    console.log(`最终URL: ${page.url()}`);
  }

  // ========== 优惠券 ==========
  console.log('\n【优惠券】');
  await page.goto(`${BASE_URL}/marketing/promotions/coupons`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 找添加按钮
  const addBtn = await page.$('button:has-text("Tambah"), button:has-text("Buat")');
  if (addBtn) await addBtn.click();
  await page.waitForTimeout(1500);

  const coupBtn = await page.$('button:has-text("Simpan")');
  const coupDisabled1 = await coupBtn?.getAttribute('disabled');
  console.log(`只有代码时: ${coupDisabled1 !== null ? 'disabled ❌' : 'enabled ✅'}`);

  await page.fill('input[placeholder="DISCOUNT10"]', 'TESTCODE');
  await page.waitForTimeout(300);
  const coupDisabled2 = await coupBtn?.getAttribute('disabled');
  console.log(`填代码后: ${coupDisabled2 !== null ? 'disabled ❌' : 'enabled ❌ (缺少日期)'}`);

  const coupDates = await page.$$('input[type="date"]');
  if (coupDates.length >= 2) {
    await coupDates[0].fill('2026-06-23');
    await coupDates[1].fill('2026-12-31');
  }
  await page.waitForTimeout(300);
  const coupDisabled3 = await coupBtn?.getAttribute('disabled');
  console.log(`填日期后: ${coupDisabled3 === null ? 'enabled ✅' : 'disabled ❌'}`);

  if (coupDisabled3 === null) {
    await coupBtn?.click();
    await page.waitForTimeout(3000);
    console.log(`最终URL: ${page.url()}`);
  }

  console.log('\n=== 完成 ===');
  await browser.close();
})();