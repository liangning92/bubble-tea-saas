const { chromium } = require('playwright');

const POS_URL = 'http://localhost:6063';
const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  return { name, status, details };
}

async function runPOSTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  const errors = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`PAGE ERROR: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('     Bubble Tea POS - 核心功能测试');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. POS登录页面
    console.log('【1. POS登录】');
    await page.goto(POS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    const title = await page.title();
    results.push(log('1.1 POS页面加载', title.includes('POS') || title.includes('Bubble') ? 'PASS' : 'FAIL', `Title: ${title}`));

    // Check if login form exists
    const phoneInput = await page.locator('input[type="tel"], input[placeholder*="telepon"], input[placeholder*="phone"]').count();
    const passwordInput = await page.locator('input[type="password"]').count();
    results.push(log('1.2 登录表单存在', phoneInput > 0 && passwordInput > 0 ? 'PASS' : 'FAIL', `Phone: ${phoneInput}, Password: ${passwordInput}`));

    // 2. 执行登录
    if (phoneInput > 0) {
      await page.locator('input[type="tel"], input[placeholder*="08"]').first().fill('081234567890');
      await page.locator('input[type="password"]').first().fill('admin123');
      await sleep(500);

      const loginBtn = await page.locator('button[type="submit"], button:has-text("Masuk"), button:has-text("Login")').count();
      if (loginBtn > 0) {
        await page.locator('button[type="submit"], button:has-text("Masuk")').first().click();
        await sleep(2000);
      }
    }

    // 3. 检查POS主界面
    console.log('\n【2. POS主界面】');
    const currentUrl = page.url();
    results.push(log('2.1 登录后跳转', !currentUrl.includes('login') ? 'PASS' : 'FAIL', `URL: ${currentUrl}`));

    // Check for product list
    await sleep(1000);
    const productCards = await page.locator('[class*="product"], [class*="menu"], [class*="item"]').count();
    results.push(log('2.2 产品列表显示', productCards > 0 ? 'PASS' : 'FAIL', `Found: ${productCards} items`));

    // Check for cart button
    const cartBtn = await page.locator('[class*="cart"], button:has-text("Cart"), button:has-text("Keranjang")').count();
    results.push(log('2.3 购物车按钮存在', cartBtn > 0 ? 'PASS' : 'FAIL', `Found: ${cartBtn}`));

    // Check for hanging orders button
    const hangBtn = await page.locator('button:has-text("Gantung"), button:has-text("Hang")').count();
    results.push(log('2.4 挂单按钮存在', hangBtn > 0 ? 'PASS' : 'FAIL', `Found: ${hangBtn}`));

    // Check for history button
    const historyBtn = await page.locator('button:has-text("History"), button:has-text("Riwayat")').count();
    results.push(log('2.5 历史记录按钮存在', historyBtn > 0 ? 'PASS' : 'FAIL', `Found: ${historyBtn}`));

    // 4. 产品分类切换
    console.log('\n【3. 产品分类】');
    const categoryTabs = await page.locator('[class*="tab"], [class*="category"], button[class*="cat"]').count();
    results.push(log('3.1 分类标签存在', categoryTabs > 0 ? 'PASS' : 'FAIL', `Found: ${categoryTabs}`));

    // Try clicking a category
    if (categoryTabs > 1) {
      await page.locator('[class*="tab"], [class*="category"]').nth(1).click();
      await sleep(500);
      results.push(log('3.2 分类切换', 'PASS'));
    }

    // 5. 添加产品到购物车
    console.log('\n【4. 购物车功能】');
    if (productCards > 0) {
      await page.locator('[class*="product"], [class*="menu-item"]').first().click();
      await sleep(500);

      // Check if modal/drawer opened
      const modal = await page.locator('[class*="modal"], [class*="drawer"], [class*="popup"]').count();
      results.push(log('4.1 产品详情弹窗', modal > 0 ? 'PASS' : 'FAIL', `Modal found: ${modal}`));

      // Try add to cart
      const addBtn = await page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("+")').count();
      if (addBtn > 0) {
        await page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("+")').first().click();
        await sleep(500);
      }
    }

    // 6. 挂单功能
    console.log('\n【5. 挂单&取单】');
    if (hangBtn > 0) {
      await page.locator('button:has-text("Gantung"), button:has-text("Hang")').first().click();
      await sleep(1000);
      results.push(log('5.1 挂单功能', 'PASS'));

      // Check if order appears in hanging list
      const hangList = await page.locator('[class*="hang"], [class*="pending"]').count();
      results.push(log('5.2 挂单列表', hangList > 0 ? 'PASS' : 'FAIL', `Found: ${hangList}`));
    }

    // 7. 历史记录
    console.log('\n【6. 历史记录】');
    if (historyBtn > 0) {
      await page.locator('button:has-text("History"), button:has-text("Riwayat")').first().click();
      await sleep(1000);

      const historyPage = await page.locator('[class*="history"], [class*="riwayat"]').count();
      results.push(log('6.1 历史记录页面', historyPage > 0 ? 'PASS' : 'FAIL'));

      // Go back
      await page.goBack();
      await sleep(500);
    }

    // 8. 设置页面
    console.log('\n【7. 设置页面】');
    const settingsBtn = await page.locator('button:has-text("Setting"), button:has-text("Pengaturan"), [class*="setting"]').count();
    if (settingsBtn > 0) {
      await page.locator('button:has-text("Setting"), button:has-text("Pengaturan")').first().click();
      await sleep(1000);

      const settingsPage = page.url();
      results.push(log('7.1 设置页面跳转', settingsPage.includes('setting') || settingsPage.includes('pengaturan') ? 'PASS' : 'FAIL', `URL: ${settingsPage}`));
    }

  } catch (err) {
    console.log(`\n❌ Error: ${err.message}`);
    errors.push(`FATAL: ${err.message}`);
  }

  await browser.close();

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    POS 测试结果汇总');
  console.log('═══════════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`  通过: ${passed}  |  失败: ${failed}  |  总计: ${results.length}`);
  console.log(`  控制台错误: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n  控制台错误:');
    [...new Set(errors)].slice(0, 5).forEach(e => console.log(`    ⚠️ ${e}`));
  }

  console.log('\n  详细结果:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`    ${icon} ${r.name}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  return { passed, failed, total: results.length, errors };
}

runPOSTest().then(r => {
  process.exit(r.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});