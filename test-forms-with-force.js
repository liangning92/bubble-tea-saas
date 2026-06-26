const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];

  function log(name, status, error = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${error ? ' - ' + error : ''}`);
    results.push({ name, status, error });
  }

  console.log('\n=== 测试营销模块表单(修复版) ===\n');

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // ========== 1. 优惠券 ==========
  console.log('【1. 优惠券】');
  let lastApi = null;
  page.on('response', async r => {
    if (r.url().includes('/api/marketing/coupons') && r.request().method() === 'POST') {
      try { lastApi = { status: r.status(), body: await r.json() }; } catch { lastApi = { status: r.status() }; }
    }
  });

  await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 关闭可能存在的遮罩
  const closeOverlay = await page.$('[class*="fixed"] > button:first-child');
  if (closeOverlay) await closeOverlay.click().catch(() => {});
  await page.waitForTimeout(500);

  await page.fill('input[placeholder="DISCOUNT10"]', 'TEST' + Date.now());
  const dates = await page.$$('input[type="date"]');
  if (dates.length >= 2) { await dates[0].fill('2026-06-23'); await dates[1].fill('2026-12-31'); }
  await page.waitForTimeout(300);

  // 使用force点击绕过遮罩
  await page.click('button.btn-primary', { force: true });
  await page.waitForTimeout(2000);

  if (lastApi?.status === 201) log('优惠券', 'PASS', 'API 201');
  else if (lastApi?.body?.errors) log('优惠券', 'FAIL', lastApi.body.errors[0]?.message);
  else log('优惠券', 'FAIL', `API ${lastApi?.status || '无响应'}`);

  // ========== 2. 活动 ==========
  console.log('\n【2. 活动】');
  lastApi = null;
  await page.goto(`${BASE_URL}/marketing/promotions/campaigns/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="text"]', '测试' + Date.now());
  const campDates = await page.$$('input[type="date"]');
  if (campDates.length >= 2) { await campDates[0].fill('2026-06-23'); await campDates[1].fill('2026-12-31'); }
  await page.waitForTimeout(300);
  await page.click('button.btn-primary', { force: true });
  await page.waitForTimeout(2000);
  if (lastApi?.status === 201) log('活动', 'PASS', 'API 201');
  else log('活动', 'FAIL', `API ${lastApi?.status || '无响应'}`);

  // ========== 3. 促销类别 ==========
  console.log('\n【3. 促销类别】');
  lastApi = null;
  await page.goto(`${BASE_URL}/marketing/promotions/campaign-categories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 关闭遮罩
  const overlay = await page.$('[class*="fixed"][class*="bg-black"]');
  if (overlay) {
    const xBtn = await page.$('[class*="fixed"] button[class*="ghost"]');
    if (xBtn) await xBtn.click();
    await page.waitForTimeout(500);
  }

  await page.click('button:has-text("Tambah")', { force: true });
  await page.waitForTimeout(1500);
  await page.fill('[class*="fixed"] input[type="text"]', '测试' + Date.now());
  await page.waitForTimeout(300);
  await page.click('[class*="fixed"] button:has-text("Simpan")', { force: true });
  await page.waitForTimeout(2000);
  if (lastApi?.status === 201) log('促销类别', 'PASS', 'API 201');
  else if (lastApi?.body?.errors) log('促销类别', 'FAIL', lastApi.body.errors[0]?.message);
  else log('促销类别', 'FAIL', `API ${lastApi?.status || '无响应'}`);

  // ========== 4. 推荐活动 ==========
  console.log('\n【4. 推荐活动】');
  lastApi = null;
  await page.goto(`${BASE_URL}/marketing/promotions/referrals`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 关闭遮罩
  const overlay2 = await page.$('[class*="fixed"][class*="bg-black"]');
  if (overlay2) {
    const xBtn2 = await page.$('[class*="fixed"] button[class*="ghost"]');
    if (xBtn2) await xBtn2.click();
    await page.waitForTimeout(500);
  }

  // 查找"Buat"按钮
  const buatBtn = await page.$('button:has-text("Buat")');
  if (buatBtn) {
    await buatBtn.click({ force: true });
    await page.waitForTimeout(1500);
    await page.fill('[class*="fixed"] input[type="text"]', '测试' + Date.now());
    await page.waitForTimeout(300);
    await page.click('[class*="fixed"] button:has-text("Simpan")', { force: true });
    await page.waitForTimeout(2000);
  }
  if (lastApi?.status === 201) log('推荐活动', 'PASS', 'API 201');
  else if (lastApi?.body?.errors) log('推荐活动', 'FAIL', lastApi.body.errors[0]?.message);
  else log('推荐活动', 'FAIL', `API ${lastApi?.status || '无响应'}`);

  // ========== 5. 消息渠道 ==========
  console.log('\n【5. 消息渠道】');
  lastApi = null;
  await page.goto(`${BASE_URL}/marketing/messages/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 关闭遮罩
  const overlay3 = await page.$('[class*="fixed"][class*="bg-black"]');
  if (overlay3) {
    const xBtn3 = await page.$('[class*="fixed"] button[class*="ghost"]');
    if (xBtn3) await xBtn3.click();
    await page.waitForTimeout(500);
  }

  // 点击添加渠道
  const tambahBtn = await page.$('button:has-text("Tambah Channel")');
  if (tambahBtn) {
    await tambahBtn.click({ force: true });
    await page.waitForTimeout(1500);
  }

  // 填写
  const msgInputs = await page.$$('[class*="fixed"] input[type="text"]');
  if (msgInputs.length > 0) await msgInputs[0].fill('测试渠道' + Date.now());

  await page.waitForTimeout(300);
  const msgSaveBtn = await page.$('[class*="fixed"] button:has-text("Simpan")');
  if (msgSaveBtn) {
    await msgSaveBtn.click({ force: true });
    await page.waitForTimeout(2000);
  }

  if (lastApi?.status === 201) log('消息渠道', 'PASS', 'API 201');
  else if (lastApi?.body?.error) log('消息渠道', 'FAIL', lastApi.body.error);
  else if (lastApi?.body?.errors) log('消息渠道', 'FAIL', lastApi.body.errors[0]?.message);
  else log('消息渠道', 'FAIL', `API ${lastApi?.status || '无响应'}`);

  // ========== 总结 ==========
  console.log('\n=== 总结 ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`通过: ${passed}, 失败: ${failed}`);

  await browser.close();
  process.exit(0);
})();