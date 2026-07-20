const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 优惠券表单保存问题诊断 ===\n');

  try {
    // 登录
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 进入优惠券页面
    await page.goto(`${BASE_URL}/marketing/promotions/coupons`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 点击添加按钮
    const addBtn = await page.$('button:has-text("Tambah"), button:has-text("Buat Kupon")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1500);
    }

    // 捕获弹窗内容
    const modal = await page.$('[class*="fixed"], [role="dialog"]');
    if (modal) {
      console.log('弹窗已打开\n');

      // 填写表单
      const textInputs = await modal.$$('input[type="text"]');
      console.log(`文本输入框: ${textInputs.length}`);

      if (textInputs.length > 0) {
        await textInputs[0].fill('测试优惠券-' + Date.now());
        console.log('已填写名称');
      }

      // 填写代码
      const codeInput = await modal.$('input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="kode"]');
      if (codeInput) {
        await codeInput.fill('TEST' + Date.now());
        console.log('已填写代码');
      }

      // 填写折扣值
      const numInputs = await modal.$$('input[type="number"]');
      console.log(`数字输入框: ${numInputs.length}`);
      if (numInputs.length > 0) {
        await numInputs[0].fill('10');
        console.log('已填写折扣值');
      }

      // 监听对话框（alert/confirm）
      page.on('dialog', async dialog => {
        console.log(`\n对话框弹出的类型: ${dialog.type()}`);
        console.log(`对话框内容: ${dialog.message()}`);
        await dialog.dismiss();
      });

      // 监听所有API请求
      page.on('response', async response => {
        if (response.url().includes('/api/')) {
          try {
            const body = await response.json();
            console.log(`\nAPI响应: ${response.status()} ${response.url()}`);
            console.log(`响应体: ${JSON.stringify(body).substring(0, 300)}`);
          } catch {
            console.log(`\nAPI响应: ${response.status()} ${response.url()} (无法解析body)`);
          }
        }
      });

      // 点击保存
      console.log('\n--- 点击保存按钮 ---\n');
      const saveBtn = await modal.$('button[type="submit"], button:has-text("Simpan")');
      if (saveBtn) {
        const disabled = await saveBtn.getAttribute('disabled');
        console.log(`按钮状态: ${disabled !== null ? 'disabled' : 'enabled'}`);

        if (disabled === null) {
          await saveBtn.click();
          console.log('已点击保存');
          await page.waitForTimeout(5000);
        }
      }

      // 检查结果
      const stillModal = await page.$('[class*="fixed"], [role="dialog"]');
      console.log(`\n保存后弹窗: ${stillModal ? '仍在(失败)' : '已关闭(成功)'}`);
      console.log(`当前URL: ${page.url()}`);

      // 如果弹窗还在，检查是否有错误提示
      if (stillModal) {
        const errorText = await page.evaluate(() => {
          const errors = document.querySelectorAll('[class*="error"], [class*="Error"], [class*="invalid"]');
          return Array.from(errors).map(e => e.innerText).join(', ') || '无错误提示';
        });
        console.log(`错误提示: ${errorText}`);
      }
    }

  } catch (e) {
    console.error('测试异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();