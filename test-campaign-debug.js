const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 活动表单调试 ===\n');

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    await page.goto(`${BASE_URL}/marketing/promotions/campaigns/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log('当前URL:', page.url());

    // 监听所有API请求
    page.on('response', async response => {
      if (response.url().includes('/api/')) {
        const method = response.request()?.method();
        const status = response.status();
        const url = response.url().replace('http://localhost:7072', '');
        let body = null;
        try {
          body = await response.json();
        } catch {}

        console.log(`\nAPI: ${method} ${status} ${url}`);
        if (body) {
          console.log(`Body: ${JSON.stringify(body).substring(0, 300)}`);
        }
      }
    });

    // 检查表单结构
    const formInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      return Array.from(inputs).map(el => ({
        type: el.type || el.tagName,
        name: el.name,
        value: el.value,
        placeholder: el.placeholder,
        required: el.required
      }));
    });

    console.log('\n表单元素:');
    formInfo.forEach((el, i) => {
      console.log(`  [${i}] ${el.type} name="${el.name}" placeholder="${el.placeholder}" required=${el.required} value="${el.value}"`);
    });

    // 填写表单
    console.log('\n--- 填写表单 ---');

    // 查找所有文本输入
    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length > 0) {
      await textInputs[0].fill('测试活动-' + Date.now());
      console.log('填写了名称');
    }

    // 查找并填写日期
    const dateInputs = await page.$$('input[type="date"]');
    console.log(`日期输入框: ${dateInputs.length}`);
    if (dateInputs.length >= 2) {
      await dateInputs[0].fill('2026-06-23');
      await dateInputs[1].fill('2026-12-31');
      console.log('填写了日期');
    }

    // 检查按钮状态
    await page.waitForTimeout(500);
    const btnInfo = await page.evaluate(() => {
      const btn = document.querySelector('button.btn-primary');
      return {
        disabled: btn?.disabled,
        text: btn?.innerText
      };
    });
    console.log(`\n保存按钮: text="${btnInfo.text}" disabled=${btnInfo.disabled}`);

    // 点击保存
    console.log('\n--- 点击保存 ---');
    const saveBtn = await page.$('button.btn-primary');
    if (saveBtn && !btnInfo.disabled) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('无法点击: 按钮disabled或不存在');
    }

    console.log(`\n最终URL: ${page.url()}`);

  } catch (e) {
    console.error('异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();