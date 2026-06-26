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
  console.log('库存管理模块测试');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await login();
    log('登录', 'PASS');

    // 进入库存页面
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 获取页面内容
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('页面内容 (前1500字符):\n' + pageText.substring(0, 1500));

    // 查找所有按钮
    console.log('\n--- 页面按钮分析 ---');
    const buttons = await page.$$('button');
    console.log(`总按钮数: ${buttons.length}`);
    
    // 查找标题和主要按钮
    const mainButtons = await page.$$('button[class*="btn"]');
    console.log(`主要按钮数: ${mainButtons.length}`);
    for (let i = 0; i < Math.min(mainButtons.length, 10); i++) {
      const text = await mainButtons[i].innerText();
      console.log(`  按钮 ${i}: "${text}"`);
    }

    // 检查是否有库存相关的输入框和表格
    const inputs = await page.$$('input');
    const selects = await page.$$('select');
    const tables = await page.$$('table');
    console.log(`\n输入框: ${inputs.length}, 下拉框: ${selects.length}, 表格: ${tables.length}`);

    log('库存页面加载', 'PASS');

  } catch (e) {
    console.error('测试出错:', e.message);
    log('库存页面加载', 'FAIL', e.message);
  }

  console.log('\n═══════════════════════════════════════════════════');
  await browser.close();
  process.exit(0);
})();
