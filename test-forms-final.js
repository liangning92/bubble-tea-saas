const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];

  function log(name, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
    results.push({ name, status, details });
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       全系统表单保存测试 - 最终版                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  async function clickWithForce(selector) {
    const el = await page.$(selector);
    if (el) await el.click({ force: true });
    return el !== null;
  }

  try {
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
      if (r.url().includes('/api/') && r.request().method() === 'POST') {
        lastApi = { status: r.status(), body: await r.json().catch(() => null) };
      }
    });

    await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="DISCOUNT10"]', 'TEST' + Date.now());
    const dates = await page.$$('input[type="date"]');
    if (dates.length >= 2) { await dates[0].fill('2026-06-23'); await dates[1].fill('2026-12-31'); }
    await page.waitForTimeout(300);
    await clickWithForce('button.btn-primary');
    await page.waitForTimeout(2000);
    log('优惠券', lastApi?.status === 201 ? 'PASS' : 'FAIL', `API: ${lastApi?.status || '无响应'}`);

    // ========== 2. 活动Campaign ==========
    console.log('【2. 活动Campaign】');
    lastApi = null;
    await page.goto(`${BASE_URL}/marketing/promotions/campaigns/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length > 0) await textInputs[0].fill('测试活动' + Date.now());
    const campDates = await page.$$('input[type="date"]');
    if (campDates.length >= 2) { await campDates[0].fill('2026-06-23'); await campDates[1].fill('2026-12-31'); }
    await page.waitForTimeout(300);
    await clickWithForce('button.btn-primary');
    await page.waitForTimeout(2000);
    log('活动Campaign', lastApi?.status === 201 ? 'PASS' : 'FAIL', `API: ${lastApi?.status || '无响应'}`);

    // ========== 3. 促销类别 ==========
    console.log('【3. 促销类别】');
    lastApi = null;
    await page.goto(`${BASE_URL}/marketing/promotions/campaign-categories`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 先检查是否有弹窗遮罩
    const overlay = await page.$('[class*="fixed"][class*="inset-0"][class*="bg-black"]');
    if (overlay) {
      console.log('  存在遮罩，先关闭');
      const closeBtn = await page.$('[class*="fixed"] button[class*="ghost"], [class*="fixed"] button:has-text("×")');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(500);
    }

    await clickWithForce('button:has-text("Tambah")');
    await page.waitForTimeout(1500);

    const inputs3 = await page.$$('input[type="text"]');
    if (inputs3.length > 0) await inputs3[0].fill('测试类别' + Date.now());
    await page.waitForTimeout(300);

    await clickWithForce('button:has-text("Simpan"), button.btn-primary');
    await page.waitForTimeout(2000);

    log('促销类别', lastApi?.status === 201 ? 'PASS' : 'FAIL', `API: ${lastApi?.status || '无响应'}`);
    if (lastApi?.body?.errors) console.log(`  错误: ${JSON.stringify(lastApi.body.errors)}`);

    // ========== 4. 自动化规则 ==========
    console.log('【4. 自动化规则】');
    lastApi = null;
    await page.goto(`${BASE_URL}/marketing/operations/automation/rules/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const autoInputs = await page.$$('input[type="text"]');
    if (autoInputs.length > 0) await autoInputs[0].fill('测试规则' + Date.now());
    await page.waitForTimeout(300);

    await clickWithForce('button:has-text("Simpan"), button.btn-primary');
    await page.waitForTimeout(2000);

    log('自动化规则', lastApi?.status === 201 ? 'PASS' : 'FAIL', `API: ${lastApi?.status || '无响应'}`);
    if (lastApi?.body?.errors) console.log(`  错误: ${JSON.stringify(lastApi.body.errors)}`);
    if (lastApi?.body?.message) console.log(`  消息: ${lastApi.body.message}`);

    // ========== 5. 积分规则 ==========
    console.log('【5. 积分规则】');
    lastApi = null;
    await page.goto(`${BASE_URL}/marketing/points`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await clickWithForce('button:has-text("Atur"), button:has-text("Tambah")');
    await page.waitForTimeout(1500);

    const pointsInputs = await page.$$('input[type="text"]');
    if (pointsInputs.length > 0) await pointsInputs[0].fill('测试积分' + Date.now());
    await page.waitForTimeout(300);

    await clickWithForce('button:has-text("Simpan"), button.btn-primary');
    await page.waitForTimeout(2000);

    log('积分规则', lastApi?.status === 201 ? 'PASS' : 'FAIL', `API: ${lastApi?.status || '无响应'}`);
    if (lastApi?.body?.errors) console.log(`  错误: ${JSON.stringify(lastApi.body.errors)}`);

    // ========== 6. 消息渠道 ==========
    console.log('【6. 消息渠道】');
    lastApi = null;
    await page.goto(`${BASE_URL}/marketing/messages/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await clickWithForce('button:has-text("Buat"), button:has-text("Tambah")');
    await page.waitForTimeout(1500);

    const msgInputs = await page.$$('input[type="text"]');
    if (msgInputs.length > 0) await msgInputs[0].fill('测试渠道' + Date.now());
    await page.waitForTimeout(300);

    await clickWithForce('button:has-text("Simpan"), button.btn-primary');
    await page.waitForTimeout(2000);

    log('消息渠道', lastApi?.status === 201 ? 'PASS' : 'FAIL', `API: ${lastApi?.status || '无响应'}`);
    if (lastApi?.body?.error) console.log(`  错误: ${lastApi.body.error}`);
    if (lastApi?.body?.errors) console.log(`  错误: ${JSON.stringify(lastApi.body.errors)}`);

    // ========== 总结 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                       测试总结                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`通过: ${passed}, 失败: ${failed}`);

  } catch (e) {
    console.error('异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();