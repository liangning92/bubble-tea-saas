const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const errors = [];

  function log(name, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
    results.push({ name, status, details });
  }

  page.on('pageerror', err => {
    errors.push(err.message);
  });

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       表单保存问题修复验证                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

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
      lastApi = { status: r.status(), body: await r.json().catch(() => null) };
    }
  });

  await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder="DISCOUNT10"]', 'TEST' + Date.now());
  const dates = await page.$$('input[type="date"]');
  if (dates.length >= 2) { await dates[0].fill('2026-06-23'); await dates[1].fill('2026-12-31'); }
  await page.waitForTimeout(300);
  await page.click('button.btn-primary');
  await page.waitForTimeout(2000);
  log('优惠券', lastApi?.status === 201 ? '✅ 已修复' : '❌ 仍有问题', `API: ${lastApi?.status || '无响应'}`);

  // ========== 2. 活动Campaign ==========
  console.log('\n【2. 活动Campaign】');
  lastApi = null;
  await page.goto(`${BASE_URL}/marketing/promotions/campaigns/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const textInputs = await page.$$('input[type="text"]');
  if (textInputs.length > 0) await textInputs[0].fill('测试活动' + Date.now());
  const campDates = await page.$$('input[type="date"]');
  if (campDates.length >= 2) { await campDates[0].fill('2026-06-23'); await campDates[1].fill('2026-12-31'); }
  await page.waitForTimeout(300);
  await page.click('button.btn-primary');
  await page.waitForTimeout(2000);
  log('活动Campaign', lastApi?.status === 201 ? '✅ 已修复' : '❌ 仍有问题', `API: ${lastApi?.status || '无响应'}`);

  // ========== 3. 自动化规则 ==========
  console.log('\n【3. 自动化规则】');
  errors.length = 0;
  await page.goto(`${BASE_URL}/marketing/operations/automation/rules`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const autoPageError = errors.some(e => e.includes('rules.filter'));
  log('自动化规则', autoPageError ? '❌ 仍有问题' : '✅ 已修复', autoPageError ? '页面崩溃' : '正常加载');

  // ========== 4. 消息渠道 ==========
  console.log('\n【4. 消息渠道】');
  errors.length = 0;
  await page.goto(`${BASE_URL}/marketing/messages/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  lastApi = null;
  page.on('response', async r => {
    if (r.url().includes('/api/') && r.request().method() === 'POST') {
      lastApi = { status: r.status(), body: await r.json().catch(() => null) };
    }
  });

  const addChannelBtn = await page.$('button:has-text("Tambah Channel")');
  if (addChannelBtn) {
    await addChannelBtn.click();
    await page.waitForTimeout(1500);

    const msgInputs = await page.$$('input[type="text"]');
    if (msgInputs.length > 0) await msgInputs[0].fill('测试渠道' + Date.now());

    await page.waitForTimeout(300);
    const saveBtn = await page.$('button.btn-primary, button:has-text("Simpan")');
    if (saveBtn) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }
    log('消息渠道', lastApi?.status === 201 ? '✅ 已修复' : '❌ 仍有问题', `API: ${lastApi?.status || '无响应'}`);
  } else {
    log('消息渠道', '⚠️ 无法测试', '添加按钮未找到');
  }

  // ========== 总结 ==========
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                       修复总结                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const fixed = results.filter(r => r.status.includes('已修复')).length;
  const issues = results.filter(r => r.status.includes('仍有问题') || r.status.includes('无法测试')).length;

  console.log(`已修复: ${fixed}`);
  console.log(`仍有问题: ${issues}`);

  if (issues === 0) {
    console.log('\n🎉 所有表单保存问题已修复！\n');
  }

  await browser.close();
  process.exit(0);
})();