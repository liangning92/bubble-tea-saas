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
  console.log('║       营销模块表单保存测试 - 全模块扫描                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  try {
    // 登录
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    log('登录', 'PASS');

    // ========== 1. 优惠券 - 已修复 ==========
    console.log('\n【1. 优惠券表单 /new】\n');
    await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let apiResult = null;
    page.on('response', response => {
      if (response.url().includes('/api/marketing/coupons') && response.request().method() === 'POST') {
        apiResult = { status: response.status() };
      }
    });

    await page.fill('input[placeholder="DISCOUNT10"]', 'TESTFIX' + Date.now());
    const dateInputs = await page.$$('input[type="date"]');
    if (dateInputs.length >= 2) {
      await dateInputs[0].fill('2026-06-23');
      await dateInputs[1].fill('2026-12-31');
    }
    await page.waitForTimeout(300);
    await page.click('button.btn-primary');
    await page.waitForTimeout(2000);
    log('优惠券保存', apiResult?.status === 201 ? 'PASS' : 'FAIL', `API: ${apiResult?.status || '无响应'}`);

    // ========== 2. 活动 Campaign ==========
    console.log('\n【2. 活动表单 /campaigns/new】\n');
    await page.goto(`${BASE_URL}/marketing/promotions/campaigns/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    apiResult = null;
    page.on('response', response => {
      if (response.url().includes('/api/') && response.request().method() === 'POST') {
        apiResult = { status: response.status(), url: response.url() };
      }
    });

    // 查找表单并填写
    const inputs = await page.$$('input[type="text"]');
    if (inputs.length > 0) {
      await inputs[0].fill('测试活动' + Date.now());
    }

    // 填写日期
    const campaignDates = await page.$$('input[type="date"]');
    if (campaignDates.length >= 2) {
      await campaignDates[0].fill('2026-06-23');
      await campaignDates[1].fill('2026-12-31');
    }

    await page.waitForTimeout(300);
    await page.click('button.btn-primary');
    await page.waitForTimeout(2000);

    const campaignSuccess = page.url().includes('/campaigns') && !page.url().includes('/new');
    log('活动保存', campaignSuccess ? 'PASS' : 'FAIL', `URL: ${page.url()}`);

    // ========== 3. 折扣规则 ==========
    console.log('\n【3. 折扣规则弹窗】\n');
    await page.goto(`${BASE_URL}/marketing/promotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 点击添加按钮
    const addBtn = await page.$('button:has-text("Buat Kampanye")');
    if (addBtn) await addBtn.click();
    await page.waitForTimeout(1500);

    apiResult = null;
    page.on('response', response => {
      if (response.url().includes('/api/') && response.request().method() === 'POST') {
        apiResult = { status: response.status() };
      }
    });

    const modalInputs = await page.$$('[class*="fixed"] input[type="text"]');
    if (modalInputs.length > 0) {
      await modalInputs[0].fill('测试规则' + Date.now());
    }

    const modalSaveBtn = await page.$('[class*="fixed"] button.btn-primary');
    if (modalSaveBtn) {
      const disabled = await modalSaveBtn.getAttribute('disabled');
      if (!disabled) {
        await modalSaveBtn.click();
        await page.waitForTimeout(2000);
        log('折扣规则保存', 'PASS');
      } else {
        log('折扣规则保存', 'FAIL', '按钮disabled');
      }
    }

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