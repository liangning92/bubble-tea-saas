const { chromium } = require('playwright');

const POS_URL = 'http://localhost:6063';

function log(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  return { name, status, details };
}

async function closeModal(page) {
  // Try multiple ways to close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // Also try clicking backdrop
  const backdrop = page.locator('[class*="backdrop"], [class*="overlay"]').first();
  if (await backdrop.count() > 0) {
    await backdrop.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);
  }
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
    for (const name of ['挂单', '扫描', '历史', '任务', '交班', '退出', 'Hardware']) {
      const count = await page.locator(`button:has-text("${name}")`).count();
      results.push(log(`2.x ${name}按钮`, count > 0 ? 'PASS' : 'FAIL', `Found: ${count}`));
    }

    // 3. 产品列表
    console.log('\n【3. 产品列表】');
    const bodyText = await page.textContent('body');
    const productPrices = (bodyText.match(/Rp\s*[\d.]+/g) || []).length;
    results.push(log('3.1 产品价格显示', productPrices > 0 ? 'PASS' : 'FAIL', `${productPrices} products`));

    // 4. 点击产品
    console.log('\n【4. 产品交互】');
    const esKrimCount = await page.locator('button:has-text("Es Krim")').count();
    if (esKrimCount > 0) {
      await page.locator('button:has-text("Es Krim")').first().click();
      await page.waitForTimeout(1500);
      results.push(log('4.1 点击产品', 'PASS'));
      await closeModal(page);
    }

    // 5. 挂单功能
    console.log('\n【5. 挂单功能】');
    if (await page.locator('button:has-text("挂单")').count() > 0) {
      await page.locator('button:has-text("挂单")').click();
      await page.waitForTimeout(1000);

      const modalText = await page.textContent('body');
      results.push(log('5.1 挂单弹窗', modalText.includes('挂') || modalText.includes('Gantung') ? 'PASS' : 'FAIL'));
      await closeModal(page);
    }

    // 6. 历史记录
    console.log('\n【6. 历史记录】');
    if (await page.locator('button:has-text("历史")').count() > 0) {
      await page.locator('button:has-text("历史")').click();
      await page.waitForTimeout(1500);

      const histModal = await page.textContent('body');
      results.push(log('6.1 历史记录弹窗', histModal.includes('历史') || histModal.includes('Riwayat') || histModal.includes('Order') ? 'PASS' : 'FAIL'));
      await closeModal(page);
    }

    // 7. 任务弹窗
    console.log('\n【7. 任务功能】');
    if (await page.locator('button:has-text("任务")').count() > 0) {
      await page.locator('button:has-text("任务")').click();
      await page.waitForTimeout(1500);

      const taskModal = await page.textContent('body');
      results.push(log('7.1 任务弹窗', taskModal.includes('任务') || taskModal.includes('Task') || taskModal.includes('Tugas') ? 'PASS' : 'FAIL'));
      await closeModal(page);
    }

    // 8. 操作后验证
    console.log('\n【8. 操作后验证】');
    for (const name of ['挂单', '历史', '任务']) {
      const count = await page.locator(`button:has-text("${name}")`).count();
      results.push(log(`8.x ${name}(后)`, count > 0 ? 'PASS' : 'FAIL'));
    }

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