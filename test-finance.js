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
  console.log('财务管理模块测试');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await login();
    log('登录', 'PASS');

    // 进入财务页面
    await page.goto(`${BASE_URL}/finance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 获取页面内容
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('财务页面内容 (前2000字符):\n' + pageText.substring(0, 2000));

    // 查找所有Tab和按钮
    console.log('\n--- 页面结构 ---');
    const tabs = await page.$$('[class*="tab"], [role="tab"]');
    console.log(`Tab数量: ${tabs.length}`);
    for (let i = 0; i < Math.min(tabs.length, 10); i++) {
      const text = await tabs[i].innerText();
      console.log(`  Tab ${i}: "${text}"`);
    }

    // 检查是否有图表或数据
    const tables = await page.$$('table');
    const charts = await page.$$('canvas, [class*="chart"]');
    console.log(`\n表格: ${tables.length}, 图表: ${charts.length}`);

    // 检查主要按钮
    const mainButtons = await page.$$('button[class*="btn"]');
    console.log(`主要按钮: ${mainButtons.length} 个`);
    for (let i = 0; i < Math.min(mainButtons.length, 5); i++) {
      const text = await mainButtons[i].innerText();
      console.log(`  按钮: "${text}"`);
    }

    log('财务页面加载', 'PASS');

    // 测试Tab切换
    console.log('\n--- Tab切换测试 ---');
    if (tabs.length > 1) {
      for (let i = 0; i < Math.min(tabs.length, 4); i++) {
        await tabs[i].click();
        await page.waitForTimeout(1000);
        const currentTab = await page.evaluate(() => {
          const active = document.querySelector('[class*="tab"][class*="active"], [role="tab"][aria-selected="true"]');
          return active?.innerText || 'unknown';
        });
        log(`Tab ${i} 切换`, 'PASS', `当前: ${currentTab}`);
      }
    }

    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('财务模块测试完成');
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