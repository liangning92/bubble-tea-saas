const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 优惠券表单问题诊断 ===\n');

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 检查表单初始状态
    const initialState = await page.evaluate(() => {
      return {
        codeInput: document.querySelector('input[placeholder="DISCOUNT10"]')?.value,
        codeValue: document.querySelector('input[placeholder="DISCOUNT10"]')?.value,
        allInputs: Array.from(document.querySelectorAll('input')).map(el => ({
          type: el.type,
          value: el.value,
          placeholder: el.placeholder
        })),
        saveButton: document.querySelector('button[type="submit"]')?.disabled
      };
    });

    console.log('初始状态:');
    console.log(`  code输入框值: "${initialState.codeValue}"`);
    console.log(`  保存按钮disabled: ${initialState.saveButton}`);
    console.log('  所有输入框:');
    initialState.allInputs.forEach((el, i) => {
      console.log(`    [${i}] type="${el.type}" value="${el.value}" placeholder="${el.placeholder}"`);
    });

    // 填写表单
    console.log('\n--- 填写表单 ---');

    // 填写code
    await page.fill('input[placeholder="DISCOUNT10"]', 'TESTCODE' + Date.now());
    console.log('已填写code');

    // 填写折扣值
    const numInputs = await page.$$('input[type="number"]');
    console.log(`数字输入框数量: ${numInputs.length}`);
    if (numInputs.length > 0) {
      await numInputs[0].fill('10');
      console.log('已填写折扣值');
    }

    // 填写日期 - 用fill方法
    const dateInputs = await page.$$('input[type="date"]');
    console.log(`日期输入框数量: ${dateInputs.length}`);

    if (dateInputs.length >= 2) {
      // 用fill方法
      await dateInputs[0].fill('2026-06-23');
      await dateInputs[1].fill('2026-12-31');
      console.log('已填写日期(用fill)');
    }

    // 检查React状态
    const afterFill = await page.evaluate(() => {
      const dateEls = document.querySelectorAll('input[type="date"]');
      return {
        dateValues: Array.from(dateEls).map(el => el.value),
        buttonDisabled: document.querySelector('button[type="submit"]')?.disabled
      };
    });

    console.log('\n填写后状态:');
    console.log(`  日期值: ${afterFill.dateValues}`);
    console.log(`  按钮disabled: ${afterFill.buttonDisabled}`);

    // 如果还是disabled，尝试用不同方式填写日期
    if (afterFill.buttonDisabled) {
      console.log('\n--- 尝试其他方式填写日期 ---');

      // 方式2: 通过JS设置值并触发input事件
      await dateInputs[0].evaluate(el => {
        el.value = '2026-06-23';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await dateInputs[1].evaluate(el => {
        el.value = '2026-12-31';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      console.log('通过JS设置了日期');

      await page.waitForTimeout(500);

      const afterJS = await page.evaluate(() => {
        const dateEls = document.querySelectorAll('input[type="date"]');
        return {
          dateValues: Array.from(dateEls).map(el => el.value),
          buttonDisabled: document.querySelector('button[type="submit"]')?.disabled
        };
      });

      console.log(`日期值: ${afterJS.dateValues}`);
      console.log(`按钮disabled: ${afterJS.buttonDisabled}`);
    }

    // 尝试保存
    if (!(await page.evaluate(() => document.querySelector('button[type="submit"]')?.disabled))) {
      console.log('\n--- 点击保存 ---');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      console.log(`保存后URL: ${page.url()}`);
      console.log(`结果: ${page.url().includes('/coupons') && !page.url().includes('/new') ? '✅ 成功' : '❌ 失败'}`);
    } else {
      console.log('\n❌ 保存按钮仍是disabled，无法点击');
    }

  } catch (e) {
    console.error('异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();