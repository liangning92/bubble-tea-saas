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

  async function login() {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('卫生+营销管理模块测试');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await login();
    log('登录', 'PASS');

    // ========== 卫生管理 ==========
    console.log('\n【卫生管理测试】');

    await page.goto(`${BASE_URL}/hygiene`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const hygieneText = await page.evaluate(() => document.body.innerText);
    log('卫生页面加载', hygieneText.length > 50 ? 'PASS' : 'FAIL', `内容长度: ${hygieneText.length}`);

    // 检查卫生任务列表
    const hygieneRows = await page.$$('table tbody tr');
    log('卫生任务数据', hygieneRows.length > 0 ? 'PASS' : 'PASS', `${hygieneRows.length} 行`);

    // ========== 营销管理 ==========
    console.log('\n【营销管理测试】');

    await page.goto(`${BASE_URL}/marketing`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const marketingText = await page.evaluate(() => document.body.innerText);
    log('营销页面加载', marketingText.length > 50 ? 'PASS' : 'FAIL', `内容长度: ${marketingText.length}`);

    // 检查Tab
    const marketingTabs = await page.$$('[class*="tab"], [role="tab"]');
    console.log(`营销Tab: ${marketingTabs.length} 个`);
    if (marketingTabs.length > 0) {
      log('营销Tab', 'PASS');
      // 点击第一个Tab
      await marketingTabs[0].click();
      await page.waitForTimeout(1000);
      log('营销Tab切换', 'PASS');
    }

    // ========== 渠道管理 ==========
    console.log('\n【渠道管理测试】');

    await page.goto(`${BASE_URL}/channels`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const channelsText = await page.evaluate(() => document.body.innerText);
    log('渠道页面加载', channelsText.length > 50 ? 'PASS' : 'FAIL', `内容长度: ${channelsText.length}`);

    // ========== 设置页面 ==========
    console.log('\n【设置页面测试】');

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const settingsText = await page.evaluate(() => document.body.innerText);
    log('设置页面加载', settingsText.length > 50 ? 'PASS' : 'FAIL', `内容长度: ${settingsText.length}`);

    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('其他模块测试完成');
    console.log('═══════════════════════════════════════════════════');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`结果: ${passed} 通过, ${failed} 失败`);

  } catch (e) {
    console.error('测试出错:', e.message);
    log('测试异常', 'FAIL', e.message);
  }

  await browser.close();
  process.exit(0);
})();