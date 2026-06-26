const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 深度调试表单保存问题 ===\n');

  // 监听所有请求响应
  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      const method = response.request().method();
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const status = response.status();
        let body = null;
        try { body = await response.json(); } catch {}
        console.log(`\n[${method}] ${response.url()}`);
        console.log(`状态: ${status}`);
        if (body) console.log(`响应: ${JSON.stringify(body).substring(0, 500)}`);
      }
    }
  });

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // ========== 测试优惠券表单 ==========
  console.log('\n\n===== 优惠券表单 =====');
  await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 填写表单
  await page.fill('input[placeholder="DISCOUNT10"]', 'DEBUG' + Date.now());
  const dates = await page.$$('input[type="date"]');
  if (dates.length >= 2) {
    await dates[0].fill('2026-06-23');
    await dates[1].fill('2026-12-31');
  }

  // 检查按钮状态
  const saveBtn = await page.$('button.btn-primary');
  const isDisabled = await saveBtn?.getAttribute('disabled');
  console.log(`\n保存按钮disabled: ${isDisabled}`);

  // 点击保存
  if (saveBtn) {
    console.log('点击保存...');
    await saveBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log(`\n最终URL: ${page.url()}`);

  // ========== 测试促销类别弹窗 ==========
  console.log('\n\n===== 促销类别弹窗 =====');
  await page.goto(`${BASE_URL}/marketing/promotions/campaign-categories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 关闭遮罩
  const overlay = await page.$('[class*="fixed"][class*="bg-black"]');
  if (overlay) {
    const closeBtn = await page.$('[class*="fixed"] button');
    if (closeBtn) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // 点击添加
  const tambahBtn = await page.$('button:has-text("Tambah")');
  if (tambahBtn) {
    console.log('点击Tambah...');
    await tambahBtn.click();
    await page.waitForTimeout(1500);
  }

  // 填写
  const inp = await page.$('[class*="fixed"] input[type="text"]');
  if (inp) {
    await inp.fill('测试类别' + Date.now());
    console.log('已填写名称');
  }

  // 点击保存
  const simpanBtn = await page.$('[class*="fixed"] button:has-text("Simpan")');
  if (simpanBtn) {
    console.log('点击Simpan...');
    await simpanBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log(`最终URL: ${page.url()}`);

  console.log('\n\n=== 调试完成 ===');
  await browser.close();
  process.exit(0);
})();