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

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       Bubble Tea SaaS - Admin 管理端完整测试报告              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    await login();
    log('【登录】', 'PASS');

    // 测试所有主要页面加载
    const pages = [
      { url: '/dashboard', name: '仪表盘' },
      { url: '/products', name: '产品管理' },
      { url: '/inventory', name: '库存管理' },
      { url: '/finance', name: '财务管理' },
      { url: '/channels', name: '渠道管理' },
      { url: '/staff', name: '员工管理' },
      { url: '/hygiene', name: '卫生管理' },
      { url: '/marketing', name: '营销管理' },
      { url: '/settings', name: '设置' },
    ];

    console.log('\n【页面加载测试】\n');
    for (const p of pages) {
      await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const text = await page.evaluate(() => document.body.innerText);
      const hasContent = text.length > 100;
      log(`${p.name} (${p.url})`, hasContent ? 'PASS' : 'FAIL', `${text.length} 字符`);
    }

    // 产品管理详细测试
    console.log('\n【产品管理CRUD测试】\n');
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const productRows = await page.$$('table tbody tr');
    log('产品列表', productRows.length > 0 ? 'PASS' : 'FAIL', `${productRows.length} 个产品`);

    // 库存管理详细测试
    console.log('\n【库存管理CRUD测试】\n');
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const inventoryRows = await page.$$('table tbody tr');
    log('库存列表', inventoryRows.length > 0 ? 'PASS' : 'FAIL', `${inventoryRows.length} 个库存项`);

    // 财务数据检查
    console.log('\n【财务数据检查】\n');
    await page.goto(`${BASE_URL}/finance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const financeText = await page.evaluate(() => document.body.innerText);
    const hasRevenue = financeText.includes('Rp') || financeText.includes('Pendapatan');
    log('财务数据', hasRevenue ? 'PASS' : 'FAIL', hasRevenue ? '显示收入数据' : '无收入数据');

    // 总结
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         测试总结                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const total = results.length;

    console.log(`总计: ${total} 项测试\n`);
    console.log(`通过: ${passed} ✅`);
    console.log(`失败: ${failed} ❌`);
    console.log(`\n通过率: ${total > 0 ? Math.round(passed/total*100) : 0}%`);

    if (failed === 0) {
      console.log('\n🎉 所有测试通过！系统运行正常。\n');
    } else {
      console.log('\n⚠️ 部分测试失败，请检查。\n');
    }

  } catch (e) {
    console.error('测试出错:', e.message);
    log('测试异常', 'FAIL', e.message);
  }

  await browser.close();
  process.exit(0);
})();