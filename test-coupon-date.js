const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 优惠券完整填写测试 ===\n');

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    await page.goto(`${BASE_URL}/marketing/promotions/coupons`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const addBtn = await page.$('button:has-text("Tambah"), button:has-text("Buat Kupon")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1500);
    }

    const modal = await page.$('[class*="fixed"], [role="dialog"]');
    if (modal) {
      // 先获取所有输入框的类型
      const inputInfo = await modal.evaluate(() => {
        const inputs = document.querySelectorAll('[class*="fixed"] input');
        return Array.from(inputs).map((el, i) => ({
          index: i,
          type: el.type,
          name: el.name,
          value: el.value,
          placeholder: el.placeholder
        }));
      });

      console.log('输入框详情:');
      inputInfo.forEach(el => {
        console.log(`  [${el.index}] type="${el.type}" placeholder="${el.placeholder}"`);
      });

      // 按类型查找并填写
      const textInput = await modal.$('input[type="text"]');
      if (textInput) {
        await textInput.fill('测试优惠券-' + Date.now());
        console.log('\n✅ 填写名称');
      }

      // 日期输入 - type="date"
      const dateInputs = await modal.$$('input[type="date"]');
      console.log(`\n日期输入框数量: ${dateInputs.length}`);

      if (dateInputs.length >= 2) {
        await dateInputs[0].fill('2026-06-23');
        console.log('✅ 填写validFrom: 2026-06-23');

        await dateInputs[1].fill('2026-12-31');
        console.log('✅ 填写validUntil: 2026-12-31');
      } else if (dateInputs.length === 1) {
        await dateInputs[0].fill('2026-06-23');
        console.log('✅ 填写了第一个日期');

        // 找其他日期输入
        const otherInputs = await modal.$$('input');
        for (let i = 0; i < otherInputs.length; i++) {
          const type = await otherInputs[i].getAttribute('type');
          if (type === 'date') continue;
          // 检查placeholder
          const ph = await otherInputs[i].getAttribute('placeholder');
          if (ph && (ph.includes('valid') || ph.includes('until') || ph.includes('from'))) {
            await otherInputs[i].fill('2026-12-31');
            console.log(`✅ 填写了 ${ph}`);
          }
        }
      }

      // 数字输入 - type="number"
      const numInputs = await modal.$$('input[type="number"]');
      console.log(`\n数字输入框数量: ${numInputs.length}`);

      // 第一个数字输入框填折扣值
      if (numInputs.length > 0) {
        await numInputs[0].fill('10');
        console.log('✅ 填写折扣值: 10');
      }

      // 监听API
      let apiResult = null;
      page.on('response', async response => {
        if (response.url().includes('/api/marketing/coupons') && response.request().method() === 'POST') {
          try {
            const body = await response.json();
            apiResult = { status: response.status(), body };
          } catch {
            apiResult = { status: response.status() };
          }
        }
      });

      // 保存
      console.log('\n--- 保存 ---\n');
      const saveBtn = await modal.$('button[type="submit"], button:has-text("Simpan")');
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForTimeout(3000);
      }

      if (apiResult) {
        console.log(`API响应: ${apiResult.status}`);
        if (apiResult.body?.errors) {
          console.log(`验证错误: ${JSON.stringify(apiResult.body.errors)}`);
        }
      }

      const stillModal = await page.$('[class*="fixed"], [role="dialog"]');
      console.log(`\n保存结果: ${stillModal ? '❌ 失败' : '✅ 成功'}`);

    }

  } catch (e) {
    console.error('测试异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();