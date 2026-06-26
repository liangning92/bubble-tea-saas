const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 测试活动弹窗保存流程 ===\n');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // 监听API
  page.on('response', async response => {
    if (response.url().includes('/api/marketing/campaigns') && response.request().method() === 'POST') {
      const body = await response.json().catch(() => null);
      console.log(`API: ${response.status()} - ${body?.message || ''}`);
    }
  });

  await page.goto(`${BASE_URL}/marketing/promotions/campaigns`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('1. 点击"Buat Kampanye"按钮');
  await page.click('button:has-text("Buat Kampanye")');
  await page.waitForTimeout(1500);

  // 检查按钮状态
  const btn = await page.$('button:has-text("Simpan")');
  const isDisabled = await btn?.getAttribute('disabled');
  console.log(`2. 弹窗打开后保存按钮状态: ${isDisabled !== null ? 'disabled' : 'enabled'}`);

  // 填写名称
  console.log('3. 填写活动名称');
  const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
  if (nameInput) {
    await nameInput.fill('测试活动-' + Date.now());
    await page.waitForTimeout(500);
  }

  // 再次检查按钮
  const isDisabled2 = await btn?.getAttribute('disabled');
  console.log(`4. 填写名称后按钮状态: ${isDisabled2 !== null ? 'disabled' : 'enabled'}`);

  // 点击保存
  console.log('5. 点击保存');
  if (btn && isDisabled2 === null) {
    await btn.click();
    await page.waitForTimeout(3000);
    console.log(`6. 最终URL: ${page.url()}`);
  }

  await browser.close();
})();