const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 简单表单测试 ===\n');

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // ========== 1. 优惠券 ==========
  console.log('【1. 优惠券】');
  await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder="DISCOUNT10"]', 'TEST' + Date.now());
  const d1 = await page.$$('input[type="date"]');
  if (d1.length >= 2) { await d1[0].fill('2026-06-23'); await d1[1].fill('2026-12-31'); }
  await page.click('button.btn-primary', { force: true });
  await page.waitForTimeout(2000);
  console.log(`URL: ${page.url()}`);
  console.log(`结果: ${page.url().includes('/coupons') && !page.url().includes('/new') ? '✅ 通过' : '❌ 失败'}`);

  // ========== 2. 活动 ==========
  console.log('\n【2. 活动】');
  await page.goto(`${BASE_URL}/marketing/promotions/campaigns/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="text"]', '测试' + Date.now());
  const d2 = await page.$$('input[type="date"]');
  if (d2.length >= 2) { await d2[0].fill('2026-06-23'); await d2[1].fill('2026-12-31'); }
  await page.click('button.btn-primary', { force: true });
  await page.waitForTimeout(2000);
  console.log(`URL: ${page.url()}`);
  console.log(`结果: ${page.url().includes('/campaigns') && !page.url().includes('/new') ? '✅ 通过' : '❌ 失败'}`);

  // ========== 3. 促销类别 ==========
  console.log('\n【3. 促销类别】');
  await page.goto(`${BASE_URL}/marketing/promotions/campaign-categories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 关闭任何遮罩
  const closeBtn = await page.$('[class*="fixed"] button[class*="ghost"]');
  if (closeBtn) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);

  await page.click('button:has-text("Tambah")', { force: true });
  await page.waitForTimeout(1500);
  const inp = await page.$('[class*="fixed"] input[type="text"]');
  if (inp) await inp.fill('测试' + Date.now());
  await page.click('[class*="fixed"] button:has-text("Simpan")', { force: true });
  await page.waitForTimeout(2000);
  console.log(`URL: ${page.url()}`);

  // 检查是否有新数据
  const pageText = await page.evaluate(() => document.body.innerText);
  const hasNewData = pageText.includes('测试');
  console.log(`结果: ${hasNewData ? '✅ 通过' : '⚠️ 需要验证'}`);

  // ========== 4. 消息渠道 ==========
  console.log('\n【4. 消息渠道】');
  await page.goto(`${BASE_URL}/marketing/messages/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 关闭遮罩
  const closeBtn2 = await page.$('[class*="fixed"] button[class*="ghost"]');
  if (closeBtn2) await closeBtn2.click().catch(() => {});
  await page.waitForTimeout(300);

  await page.click('button:has-text("Tambah Channel")', { force: true });
  await page.waitForTimeout(1500);
  const chanInp = await page.$('[class*="fixed"] input[type="text"]');
  if (chanInp) await chanInp.fill('测试渠道' + Date.now());
  await page.click('[class*="fixed"] button:has-text("Simpan")', { force: true });
  await page.waitForTimeout(2000);

  // 检查是否有错误弹窗
  const errorModal = await page.$('[class*="fixed"]:not([class*="bg-transparent"])');
  const pageText2 = await page.evaluate(() => document.body.innerText);
  const hasError = pageText2.includes('error') || pageText2.includes('Error') || pageText2.includes('错误');
  console.log(`URL: ${page.url()}`);
  console.log(`结果: ${hasError ? '❌ 失败' : '⚠️ 需要验证'}`);

  console.log('\n=== 测试完成 ===');

  await browser.close();
  process.exit(0);
})();