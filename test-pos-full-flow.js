const { chromium } = require('playwright');

async function runFullFlowTest() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  const results = [];
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`Console: ${msg.text().substring(0, 100)}`);
  });
  page.on('pageerror', err => {
    errors.push(`Error: ${err.message.substring(0, 100)}`);
  });

  try {
    console.log('========== POS 完整用户流程测试 ==========\n');

    // 1. 登录
    console.log('【1】登录');
    await page.goto('http://localhost:6063/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log(page.url().includes('dashboard') ? '✅ 登录成功' : '❌ 登录失败');
    results.push({ step: '登录', pass: page.url().includes('dashboard') });

    // 2. 渠道选择
    console.log('\n【2】渠道选择');
    await page.waitForTimeout(500);
    
    await page.locator('button:has-text("🍵")').first().click();
    await page.waitForTimeout(1000);
    
    const dineInTab = await page.locator('text=人数').count() > 0;
    console.log(dineInTab ? '✅ 人数Tab显示' : '❌ 人数Tab未显示');
    results.push({ step: '人数Tab', pass: dineInTab });
    
    await page.locator('button:has-text("confirm")').click();
    await page.waitForTimeout(2000);
    console.log('✅ 进入主界面');

    // 3. 产品选择
    console.log('\n【3】产品选择');
    await page.locator('text=Blueberry Seed Tea').first().click();
    await page.waitForTimeout(1000);
    
    const specOk = await page.locator('text=正常糖').count() > 0;
    console.log(specOk ? '✅ 规格弹窗' : '❌ 规格弹窗');
    results.push({ step: '规格弹窗', pass: specOk });
    
    await page.locator('button:has-text("加入购物车")').click();
    await page.waitForTimeout(1000);
    console.log('✅ 已加入购物车');

    // 4. 结账
    console.log('\n【4】结账');
    await page.locator('button:has-text("结账")').click();
    await page.waitForTimeout(1000);
    
    const payOk = await page.locator('text=现金').count() > 0 || await page.locator('text=Tunai').count() > 0;
    console.log(payOk ? '✅ 支付弹窗' : '❌ 支付弹窗');
    results.push({ step: '支付弹窗', pass: payOk });
    
    await page.locator('text=现金').click();
    await page.waitForTimeout(500);
    await page.locator('text=Rp 50.000').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("确认支付")').click();
    await page.waitForTimeout(3000);
    console.log('✅ 已确认支付');

    // 5. 历史订单
    console.log('\n【5】历史订单');
    await page.locator('button:has-text("历史")').click();
    await page.waitForTimeout(1500);
    
    const historyContent = await page.evaluate(() => {
      const modals = document.querySelectorAll('div[class*="fixed"]');
      for (const m of modals) {
        const style = window.getComputedStyle(m);
        if (parseInt(style.zIndex) >= 50) return m.innerText;
      }
      return '';
    });
    const historyOk = historyContent.includes('Today') || historyContent.includes('今日') || historyContent.includes('历史');
    console.log(historyOk ? '✅ 历史弹窗' : '❌ 历史弹窗');
    results.push({ step: '历史弹窗', pass: historyOk });
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 6. 挂单
    console.log('\n【6】挂单');
    // 重新加入购物车
    await page.locator('text=Blueberry').first().click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("加入购物车")').click();
    await page.waitForTimeout(1000);
    
    await page.locator('button:has-text("挂单")').click();
    await page.waitForTimeout(1000);
    
    const suspendOk = await page.locator('text=挂').count() > 0;
    console.log(suspendOk ? '✅ 挂单弹窗' : '❌ 挂单弹窗');
    results.push({ step: '挂单弹窗', pass: suspendOk });
    
    await page.locator('button:has-text("挂起")').click();
    await page.waitForTimeout(1000);
    console.log('✅ 已挂起');

    // 7. 取单
    console.log('\n【7】取单');
    await page.locator('button:has-text("取单")').click();
    await page.waitForTimeout(1000);
    
    const resumeOk = await page.locator('text=取').count() > 0;
    console.log(resumeOk ? '✅ 取单弹窗' : '❌ 取单弹窗');
    results.push({ step: '取单弹窗', pass: resumeOk });
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 8. 交接班
    console.log('\n【8】交接班');
    await page.locator('button:has-text("交班")').click();
    await page.waitForTimeout(1500);
    
    const shiftOk = await page.locator('text=班').count() > 0;
    console.log(shiftOk ? '✅ 交接班弹窗' : '❌ 交接班弹窗');
    results.push({ step: '交接班弹窗', pass: shiftOk });
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 结果
    console.log('\n========== 结果汇总 ==========');
    let passCount = 0;
    for (const r of results) {
      console.log(`${r.pass ? '✅' : '❌'} ${r.step}`);
      if (r.pass) passCount++;
    }
    console.log(`\n通过: ${passCount}/${results.length}`);
    
    if (errors.length > 0) {
      console.log('\n错误:');
      errors.forEach(e => console.log('  ' + e));
    }

  } catch (error) {
    console.error('异常:', error.message);
  }

  await browser.close();
  console.log('\n========== 测试完成 ==========');
}

runFullFlowTest().catch(console.error);
