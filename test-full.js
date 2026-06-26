const { chromium } = require('playwright');

async function testFull() {
  console.log('🧪 开始完整测试...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    // 1. 登录
    console.log('1. 登录...');
    await page.goto('http://localhost:5173/login');
    await page.waitForSelector('input[type="tel"]', { timeout: 5000 });

    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('   ✅ 登录成功');

    // 2. 进入卫生管理
    console.log('2. 进入卫生管理...');
    await page.goto('http://localhost:5173/hygiene/new');
    await page.waitForSelector('form', { timeout: 5000 });
    console.log('   ✅ 打开模板表单');

    // 3. 填写表单
    console.log('3. 填写表单...');
    const nameInput = await page.$('input[placeholder*="名称"], input[placeholder*="nama"], input[placeholder*="name"]');
    if (nameInput) {
      await nameInput.fill('Playwright测试模板');
      console.log('   ✅ 已填写模板名称');
    } else {
      console.log('   ⚠️ 未找到名称输入框');
    }

    // 4. 点击保存
    console.log('4. 点击保存...');
    const saveBtn = await page.$('button[type="submit"]');
    if (saveBtn) {
      await saveBtn.click();

      // 等待响应
      await page.waitForTimeout(3000);

      // 检查是否跳转或显示错误
      const currentUrl = page.url();
      console.log('   当前URL:', currentUrl);

      if (currentUrl.includes('/hygiene')) {
        console.log('   ✅ 保存成功，跳转到列表页');
      } else if (errors.length > 0) {
        console.log('   ❌ 错误:', errors[0].substring(0, 100));
      } else {
        console.log('   ⚠️ 未知状态');
      }
    }

    // 5. 检查模板列表
    console.log('5. 检查模板列表...');
    await page.goto('http://localhost:5173/hygiene');
    await page.waitForLoadState('networkidle');
    const templateCount = await page.$$eval('tbody tr', rows => rows.length).catch(() => 0);
    console.log('   模板数量:', templateCount);

    // 总结
    console.log('\n========== 测试结果 ==========');
    if (errors.length > 0) {
      console.log('控制台错误:');
      errors.slice(0, 3).forEach(e => console.log(' -', e.substring(0, 100)));
    } else {
      console.log('✅ 无控制台错误');
    }
    console.log('================================\n');

  } catch (err) {
    console.log('❌ 测试失败:', err.message);
  } finally {
    await browser.close();
  }
}

testFull();
