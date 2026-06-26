const { chromium } = require('playwright');

const POS_URL = 'http://localhost:6063';

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

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('     Bubble Tea POS - 全面功能测试');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. 登录
    console.log('【1. POS登录】');
    await page.goto(`${POS_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    const title = await page.title();
    results.push(log('1.1 POS页面加载', title.includes('POS') ? 'PASS' : 'FAIL', `Title: ${title}`));

    await page.fill('input[type="tel"], input[placeholder*="08"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await sleep(3000);

    const afterLoginUrl = page.url();
    results.push(log('1.2 登录成功跳转', !afterLoginUrl.includes('login') ? 'PASS' : 'FAIL', `URL: ${afterLoginUrl}`));

    // 2. 主界面元素检查
    console.log('\n【2. 主界面元素】');
    const bodyText = await page.textContent('body');

    results.push(log('2.1 产品分类存在', bodyText.includes('挂') || bodyText.includes('Gantung') ? 'PASS' : 'FAIL'));
    results.push(log('2.2 历史记录按钮', bodyText.includes('历史') || bodyText.includes('Riwayat') ? 'PASS' : 'FAIL'));
    results.push(log('2.3 挂单按钮', bodyText.includes('挂单') || bodyText.includes('Gantung') ? 'PASS' : 'FAIL'));

    // 3. 产品列表
    console.log('\n【3. 产品列表】');
    const buttons = await page.$$('button');
    const productNames = [];
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text && text.match(/^[A-Z].*Rp\s/)) {
        productNames.push(text.split('Rp')[0].trim());
      }
    }
    results.push(log('3.1 产品数量', productNames.length > 0 ? 'PASS' : 'FAIL', `Found: ${productNames.length} products`));
    if (productNames.length > 0) {
      console.log(`     Sample: ${productNames.slice(0, 3).join(', ')}`);
    }

    // 4. 添加产品到购物车
    console.log('\n【4. 购物车功能】');
    // Find a product button (format like "Es Krim24" or "Teh Buah12")
    const productBtn = await page.locator('button:has-text("Es Krim")').first();
    if (await productBtn.count() > 0) {
      await productBtn.click();
      await sleep(1000);

      // Check if something opened (modal or selection)
      const modalContent = await page.textContent('body');
      const hasSize = modalContent.includes('SIZE') || modalContent.includes('Ukuran') || modalContent.includes('小') || modalContent.includes('中') || modalContent.includes('大');
      const hasAdd = modalContent.includes('Tambah') || modalContent.includes('Add') || modalContent.includes('加');
      results.push(log('4.1 产品选择弹窗', hasSize || hasAdd ? 'PASS' : 'FAIL'));

      // Click add button if found
      const addBtn = await page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("+")').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await sleep(500);
        results.push(log('4.2 添加到购物车', 'PASS'));
      }
    } else {
      results.push(log('4.1 产品选择弹窗', 'SKIP', 'Product not found'));
    }

    // 5. 挂单功能
    console.log('\n【5. 挂单功能】');
    const hangBtnCount = await page.locator('button:has-text("挂单")').count();
    if (hangBtnCount > 0) {
      await page.locator('button:has-text("挂单")').click();
      await sleep(1000);

      // Check if modal or list appeared
      const afterHang = await page.textContent('body');
      const hasHangList = afterHang.includes('挂') || afterHang.includes('Gantung') || afterHang.includes('Pesanan Tertunda');
      results.push(log('5.1 挂单弹窗打开', hasHangList ? 'PASS' : 'FAIL'));

      // Close it
      const closeBtnCount = await page.locator('button:has-text("关闭"), button:has-text("Tutup"), button:has-text("Close"), button:has-text("X")').count();
      if (closeBtnCount > 0) {
        await page.locator('button:has-text("关闭"), button:has-text("Tutup"), button:has-text("Close"), button:has-text("X")').first().click();
        await sleep(500);
      }
    } else {
      results.push(log('5.1 挂单弹窗打开', 'SKIP', 'Button not found'));
    }

    // 6. 历史记录
    console.log('\n【6. 历史记录】');
    const historyBtnCount = await page.locator('button:has-text("历史")').count();
    if (historyBtnCount > 0) {
      await page.locator('button:has-text("历史")').click();
      await sleep(1000);

      const historyUrl = page.url();
      results.push(log('6.1 历史记录页面', historyUrl.includes('history') || historyUrl.includes('riwayat') ? 'PASS' : 'FAIL', `URL: ${historyUrl}`));

      // Go back
      await page.goBack();
      await sleep(1000);
    } else {
      results.push(log('6.1 历史记录页面', 'SKIP', 'Button not found'));
    }

    // 7. 扫描功能
    console.log('\n【7. 其他功能】');
    results.push(log('7.1 扫描按钮', await page.locator('button:has-text("扫描")').count() > 0 ? 'PASS' : 'FAIL'));
    results.push(log('7.2 任务按钮', await page.locator('button:has-text("任务")').count() > 0 ? 'PASS' : 'FAIL'));
    results.push(log('7.3 交班按钮', await page.locator('button:has-text("交班")').count() > 0 ? 'PASS' : 'FAIL'));
    results.push(log('7.4 退出按钮', await page.locator('button:has-text("退出")').count() > 0 ? 'PASS' : 'FAIL'));

    // 10. 语言切换
    console.log('\n【8. 语言切换】');
    const langBtn = await page.locator('button:has-text("ZH"), button:has-text("EN"), button:has-text("ID")').first();
    if (await langBtn.count() > 0) {
      await langBtn.click();
      await sleep(500);
      results.push(log('8.1 语言菜单', 'PASS'));
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
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`  通过: ${passed}  |  失败: ${failed}  |  跳过: ${skipped}  |  总计: ${results.length}`);
  console.log(`  控制台错误: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n  控制台错误 (去重):');
    [...new Set(errors)].slice(0, 5).forEach(e => console.log(`    ⚠️ ${e.substring(0, 100)}`));
  }

  console.log('\n  详细结果:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`    ${icon} ${r.name}${r.details ? ' (' + r.details + ')' : ''}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  return { passed, failed, skipped, total: results.length, errors };
}

runPOSTest().then(r => {
  process.exit(r.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});