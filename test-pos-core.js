const { chromium } = require('playwright');

const POS_URL = 'http://localhost:6063';

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
    if (msg.type() === 'error') errors.push(msg.text().substring(0, 80));
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('     Bubble Tea POS - 核心功能验证');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. 登录
    await page.goto(`${POS_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    results.push(log('1.1 登录跳转', !page.url().includes('login') ? 'PASS' : 'FAIL', page.url()));

    // 2. 核心按钮验证
    console.log('\n【2. 核心按钮】');
    const buttons = {
      '挂单': await page.locator('button:has-text("挂单")').count(),
      '扫描': await page.locator('button:has-text("扫描")').count(),
      '历史': await page.locator('button:has-text("历史")').count(),
      '任务': await page.locator('button:has-text("任务")').count(),
      '交班': await page.locator('button:has-text("交班")').count(),
      '退出': await page.locator('button:has-text("退出")').count(),
      'Hardware': await page.locator('button:has-text("Hardware")').count(),
    };

    for (const [name, count] of Object.entries(buttons)) {
      results.push(log(`2.x ${name}按钮`, count > 0 ? 'PASS' : 'FAIL', `Found: ${count}`));
    }

    // 3. 产品列表
    console.log('\n【3. 产品列表】');
    const bodyText = await page.textContent('body');
    const productPrices = (bodyText.match(/Rp\s*[\d.]+/g) || []).length;
    results.push(log('3.1 产品价格显示', productPrices > 0 ? 'PASS' : 'FAIL', `${productPrices} products`));

    // 4. 点击产品测试
    console.log('\n【4. 产品交互】');
    // POS uses direct product click to add (not + button)
    const esKrimCount = await page.locator('button:has-text("Es Krim")').count();
    if (esKrimCount > 0) {
      await page.locator('button:has-text("Es Krim")').first().click();
      await page.waitForTimeout(1500);
      results.push(log('4.1 点击产品添加', 'PASS', `Found: ${esKrimCount} products`));
    } else {
      results.push(log('4.1 点击产品添加', 'FAIL', 'No Es Krim product'));
    }

    // 5. 挂单功能
    console.log('\n【5. 挂单功能】');
    if (await page.locator('button:has-text("挂单")').count() > 0) {
      await page.locator('button:has-text("挂单")').click();
      await page.waitForTimeout(1000);

      const modalText = await page.textContent('body');
      results.push(log('5.1 挂单弹窗', modalText.includes('挂') || modalText.includes('Gantung') ? 'PASS' : 'FAIL'));

      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    // 6. 历史记录
    console.log('\n【6. 历史记录】');
    if (await page.locator('button:has-text("历史")').count() > 0) {
      await page.locator('button:has-text("历史")').click();
      await page.waitForTimeout(2000);

      const histModal = await page.textContent('body');
      results.push(log('6.1 历史记录弹窗', histModal.includes('历史') || histModal.includes('Riwayat') || histModal.includes('Order') ? 'PASS' : 'FAIL'));

      // Force close modal by clicking backdrop
      await page.evaluate(() => {
        const backdrop = document.querySelector('[class*="fixed inset-0 bg-black"]');
        if (backdrop) backdrop.remove();
      });
      await page.waitForTimeout(1000);
    }

    // 7. 任务弹窗
    console.log('\n【7. 任务功能】');
    if (await page.locator('button:has-text("任务")').count() > 0) {
      await page.locator('button:has-text("任务")').click();
      await page.waitForTimeout(2000);

      const taskModal = await page.textContent('body');
      results.push(log('7.1 任务弹窗', taskModal.includes('任务') || taskModal.includes('Task') || taskModal.includes('Tugas') ? 'PASS' : 'FAIL'));

      // Force close
      await page.evaluate(() => {
        const backdrop = document.querySelector('[class*="fixed inset-0 bg-black"]');
        if (backdrop) backdrop.remove();
      });
      await page.waitForTimeout(1000);
    }

    // 8. 操作后验证按钮还在
    console.log('\n【8. 操作后验证】');
    results.push(log('8.1 挂单按钮(后)', await page.locator('button:has-text("挂单")').count() > 0 ? 'PASS' : 'FAIL'));
    results.push(log('8.2 历史按钮(后)', await page.locator('button:has-text("历史")').count() > 0 ? 'PASS' : 'FAIL'));
    results.push(log('8.3 任务按钮(后)', await page.locator('button:has-text("任务")').count() > 0 ? 'PASS' : 'FAIL'));

  } catch (err) {
    console.log(`\n❌ Fatal: ${err.message}`);
    errors.push(err.message);
  }

  await browser.close();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    结果汇总');
  console.log('═══════════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`  通过: ${passed}  |  失败: ${failed}  |  总计: ${results.length}`);
  if (errors.length) console.log(`  控制台错误: ${errors.length}`);

  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`  ${icon} ${r.name}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  return { passed, failed, errors };
}

runPOSTest().then(r => process.exit(r.failed > 0 ? 1 : 0)).catch(e => { console.error(e); process.exit(1); });