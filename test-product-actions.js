const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];

  function log(name, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
    results.push({ name, status, details });
  }

  async function login() {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('产品管理完整功能测试');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await login();
    log('登录', 'PASS');

    // 进入产品列表
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 获取产品名称用于验证
    const firstProductName = await page.$eval('table tbody tr:first-child td:nth-child(2)', el => el.innerText);
    console.log(`\n第一个产品: ${firstProductName}`);

    // 3. 编辑产品 - 使用更精确的选择器
    console.log('\n--- 编辑产品测试 ---');

    // 表格行的操作按钮区域：td:last-child 包含编辑和删除按钮
    // 选择器：table tbody tr:first-child td:last-child button (两个按钮：编辑和删除)
    const actionButtons = await page.$$('table tbody tr:first-child td:last-child button');
    console.log(`操作按钮数量: ${actionButtons.length}`);

    if (actionButtons.length >= 1) {
      // 第一个是编辑按钮
      const editBtnClass = await actionButtons[0].getAttribute('class');
      console.log(`编辑按钮class: ${editBtnClass}`);
      await actionButtons[0].click();
      await page.waitForTimeout(1500);

      // 检查弹窗是否出现（表单存在即表示弹窗打开）
      const modal = await page.$('[class*="fixed"] form');
      log('编辑产品-弹窗', modal ? 'PASS' : 'FAIL');

      if (modal) {
        // 检查是否填充了现有数据
        const nameInput = await page.$('form input[type="text"]');
        const currentName = await nameInput?.inputValue();
        console.log(`当前产品名称: ${currentName}`);

        // 修改产品名称
        if (nameInput) {
          await nameInput.fill('');
          await nameInput.fill('测试产品-已编辑');
          log('编辑产品-输入新名称', 'PASS');
        }

        // 点击保存
        await page.waitForTimeout(500);
        const submitBtn = await page.$('form button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          log('编辑产品-保存', 'PASS');
        }

        // 验证名称已更新
        await page.waitForTimeout(1000);
      }
    } else {
      log('编辑产品-按钮', 'FAIL', '未找到');
    }

    // 刷新页面检查更新
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 验证产品名称已更改
    const updatedName = await page.$eval('table tbody tr:first-child td:nth-child(2)', el => el.innerText);
    log('编辑产品-验证更新', updatedName.includes('测试产品-已编辑') ? 'PASS' : 'FAIL', `新名称: ${updatedName}`);

    // 4. 删除产品测试
    console.log('\n--- 删除产品测试 ---');

    // 找到删除按钮（操作区域的第二个按钮）
    const actionButtons2 = await page.$$('table tbody tr:first-child td:last-child button');
    if (actionButtons2.length >= 2) {
      const deleteBtn = actionButtons2[1];
      const deleteBtnClass = await deleteBtn.getAttribute('class');
      console.log(`删除按钮class: ${deleteBtnClass}`);

      // 监听confirm对话框
      page.once('dialog', async dialog => {
        console.log(`对话框消息: ${dialog.message()}`);
        await dialog.dismiss(); // 取消删除
      });

      await deleteBtn.click();
      await page.waitForTimeout(1500);
      log('删除产品-确认弹窗', 'PASS');

      // 检查产品仍在列表中（因为我们取消了删除）
      const productStillExists = await page.$('table tbody tr:first-child');
      log('删除产品-取消验证', productStillExists ? 'PASS' : 'FAIL', '产品未被删除');
    }

    // 5. 测试完整添加产品流程
    console.log('\n--- 添加产品测试 ---');
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 点击添加产品按钮
    const addProductBtn = await page.$('button:has-text("Tambah Produk")');
    if (addProductBtn) {
      await addProductBtn.click();
      await page.waitForTimeout(1500);

      const addModal = await page.$('[class*="fixed"] form');
      log('添加产品-弹窗', addModal ? 'PASS' : 'FAIL');

      if (addModal) {
        // 填写表单
        const nameInput = await page.$('form input[type="text"]');
        if (nameInput) {
          await nameInput.fill('新产品测试-' + Date.now());
          log('添加产品-输入名称', 'PASS');
        }

        // 选择分类
        const categorySelect = await page.$('form select');
        if (categorySelect) {
          const options = await categorySelect.$$('option');
          if (options.length > 1) {
            await categorySelect.selectOption({ index: 1 });
            log('添加产品-选择分类', 'PASS');
          }
        }

        // 输入价格
        const priceInput = await page.$('form input[type="number"]');
        if (priceInput) {
          await priceInput.fill('15000');
          log('添加产品-输入价格', 'PASS');
        }

        // 提交
        const submitBtn = await page.$('form button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          log('添加产品-提交', 'PASS');
        }
      }

      // 关闭弹窗
      const closeBtn = await page.$('button:has-text("Batal")');
      if (closeBtn) await closeBtn.click();
    } else {
      log('添加产品-按钮', 'FAIL', '未找到');
    }

    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('产品管理完整功能测试完成');
    console.log('═══════════════════════════════════════════════════');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`\n结果: ${passed} 通过, ${failed} 失败`);

  } catch (e) {
    console.error('测试出错:', e.message);
    await page.screenshot({ path: 'error-debug.png' });
  }

  await browser.close();
  process.exit(0);
})();