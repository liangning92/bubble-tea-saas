const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 优惠券保存完整测试 ===\n');

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log('--- 页面所有按钮 ---');
    const allButtons = await page.$$('button');
    console.log(`总按钮数: ${allButtons.length}`);
    for (let i = 0; i < allButtons.length; i++) {
      const text = await allButtons[i].innerText();
      const cls = await allButtons[i].getAttribute('class');
      const type = await allButtons[i].getAttribute('type');
      console.log(`  [${i}] text="${text}" type=${type} class="${cls?.substring(0, 50)}"`);
    }

    // 填写表单
    await page.fill('input[placeholder="DISCOUNT10"]', 'TESTCODE' + Date.now());
    const dateInputs = await page.$$('input[type="date"]');
    if (dateInputs.length >= 2) {
      await dateInputs[0].fill('2026-06-23');
      await dateInputs[1].fill('2026-12-31');
    }

    await page.waitForTimeout(500);

    // 找到保存按钮 (应该有btn-primary或btn-secondary类)
    const saveBtn = await page.$('button.btn-primary');
    console.log(`\n保存按钮: ${saveBtn ? '找到' : '未找到'}`);

    if (saveBtn) {
      const btnText = await saveBtn.innerText();
      const btnDisabled = await saveBtn.getAttribute('disabled');
      console.log(`保存按钮文本: "${btnText}"`);
      console.log(`保存按钮disabled: ${btnDisabled}`);

      // 监听API
      let apiResult = null;
      page.on('response', async response => {
        if (response.url().includes('/api/marketing/coupons')) {
          const body = await response.json().catch(() => null);
          apiResult = { status: response.status(), body };
        }
      });

      console.log('\n点击保存...');
      await saveBtn.click();
      await page.waitForTimeout(3000);

      console.log(`API结果: ${apiResult ? `${apiResult.status}` : '无响应'}`);
      console.log(`当前URL: ${page.url()}`);

      const success = page.url().includes('/coupons') && !page.url().includes('/new');
      console.log(`\n结果: ${success ? '✅ 保存成功!' : '❌ 保存失败'}`);

      if (!success && apiResult) {
        console.log(`失败原因: ${JSON.stringify(apiResult.body)}`);
      }
    }

  } catch (e) {
    console.error('\n异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();