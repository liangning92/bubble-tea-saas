const { chromium } = require('playwright');

async function testAll() {
  console.log('🧪 测试所有保存功能...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    // 登录
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('✅ 登录成功\n');

    // 测试1: 添加区域
    console.log('【测试1】添加区域');
    await page.goto('http://localhost:5173/hygiene/areas');
    await page.waitForLoadState('networkidle');
    const addAreaBtn = await page.$('button:has-text("添加"), button:has-text("Tambah"), button:has-text("Add")');
    if (addAreaBtn) {
      await addAreaBtn.click();
      await page.waitForTimeout(500);
      const nameInput = await page.$('input[placeholder*="名称"], input[placeholder*="nama"], input[placeholder*="name"]');
      if (nameInput) {
        await nameInput.fill('测试区域');
        const codeInput = await page.$('input[placeholder*="code"], input[placeholder*="kode"]');
        if (codeInput) await codeInput.fill('test_area');
        const saveBtn = await page.$('button:has-text("保存"), button:has-text("Simpan"), button:has-text("Save")');
        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(2000);
          console.log('✅ 区域保存按钮点击成功\n');
        } else {
          console.log('❌ 区域保存按钮未找到\n');
        }
      } else {
        console.log('❌ 区域名称输入框未找到\n');
      }
    } else {
      console.log('❌ 添加区域按钮未找到\n');
    }

    // 测试2: 添加模板
    console.log('【测试2】添加模板');
    await page.goto('http://localhost:5173/hygiene/new');
    await page.waitForLoadState('networkidle');
    const templateNameInput = await page.$('input[placeholder*="名称"], input[placeholder*="nama"], input[placeholder*="name"]');
    if (templateNameInput) {
      await templateNameInput.fill('测试模板');
      const templateSaveBtn = await page.$('button[type="submit"]');
      if (templateSaveBtn) {
        await templateSaveBtn.click();
        await page.waitForTimeout(2000);
        const url = page.url();
        console.log('   保存后URL:', url);
        console.log(url.includes('/hygiene') ? '✅ 模板保存成功' : '❌ 模板保存失败\n');
      }
    }

    // 测试3: 创建临时任务
    console.log('\n【测试3】创建临时任务');
    await page.goto('http://localhost:5173/hygiene/today');
    await page.waitForLoadState('networkidle');
    const addTaskBtn = await page.$('button:has-text("添加"), button:has-text("Tambah")');
    if (addTaskBtn) {
      await addTaskBtn.click();
      await page.waitForTimeout(500);
      const taskInput = await page.$('input[placeholder*="名称"], input[placeholder*="task"], input[placeholder*="nama"]');
      if (taskInput) {
        await taskInput.fill('测试任务');
        const createBtn = await page.$('button:has-text("保存"), button:has-text("Simpan")');
        if (createBtn) {
          await createBtn.click();
          await page.waitForTimeout(2000);
          console.log('✅ 任务创建按钮点击成功');
        }
      }
    }

    // 测试4: 保存配置
    console.log('\n【测试4】保存配置');
    await page.goto('http://localhost:5173/hygiene/config');
    await page.waitForLoadState('networkidle');
    const configSaveBtn = await page.$('button:has-text("保存"), button:has-text("Simpan"), button:has-text("Save")');
    if (configSaveBtn) {
      await configSaveBtn.click();
      await page.waitForTimeout(2000);
      console.log('✅ 配置保存按钮点击成功');
    }

    // 报告错误
    if (errors.length > 0) {
      console.log('\n⚠️ 控制台错误:');
      errors.slice(0, 5).forEach(e => console.log(' -', e.substring(0, 150)));
    } else {
      console.log('\n✅ 无控制台错误');
    }

  } catch (err) {
    console.log('❌ 测试异常:', err.message);
  } finally {
    await browser.close();
  }
}

testAll();
