const { chromium } = require('playwright');

async function testPOSCheckout() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 监听console错误
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // 监听page错误
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  try {
    console.log('1. 打开POS登录页...');
    await page.goto('http://localhost:6063/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('2. 登录...');
    await page.fill('input[type="tel"], input[placeholder*="08"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);

    console.log('3. 检查页面URL:', page.url());

    // 检查购物车是否存在
    const cartButton = await page.locator('text=购物车').count();
    console.log('4. 购物车文本存在:', cartButton > 0);

    // 检查页面内容
    const body = await page.textContent('body');
    console.log('5. 页面包含产品:', body.includes('Es Krim') || body.includes('Teh') || body.includes('产品'));

    // 截图
    await page.screenshot({ path: 'test-results/pos-checkout-test.png', fullPage: true });
    console.log('6. 截图已保存');

    // 输出错误
    if (errors.length > 0) {
      console.log('\n=== Console Errors ===');
      errors.forEach(e => console.log('ERROR:', e));
    } else {
      console.log('\n✅ 没有控制台错误');
    }

    // 检查是否有渠道选择弹窗
    const channelModal = await page.locator('text=选择渠道').count();
    console.log('7. 渠道选择弹窗:', channelModal > 0 ? '存在' : '不存在');

    // 如果有渠道弹窗，关闭它
    if (channelModal > 0) {
      await page.click('button:has-text("🍵")');
      await page.waitForTimeout(500);
      await page.click('button:has-text("确认")');
      await page.waitForTimeout(1000);
    }

    // 再截图
    await page.screenshot({ path: 'test-results/pos-after-channel.png', fullPage: true });

    // 检查是否有折扣按钮
    const discountBtn = await page.locator('text=折扣').count();
    console.log('8. 折扣按钮:', discountBtn > 0 ? '存在' : '不存在');

    // 检查是否有结账按钮
    const checkoutBtn = await page.locator('text=结账').count();
    console.log('9. 结账按钮:', checkoutBtn > 0 ? '存在' : '不存在');

    // 尝试点击结账按钮
    if (checkoutBtn > 0) {
      console.log('10. 点击结账按钮...');
      await page.click('button:has-text("结账")');
      await page.waitForTimeout(1000);

      // 检查是否打开了支付弹窗
      const paymentModal = await page.locator('text=确认支付').count();
      console.log('11. 支付弹窗:', paymentModal > 0 ? '已打开' : '未打开');

      await page.screenshot({ path: 'test-results/pos-after-checkout.png', fullPage: true });
    }

  } catch (error) {
    console.error('Test Error:', error.message);
  }

  await browser.close();
}

testPOSCheckout().catch(console.error);
