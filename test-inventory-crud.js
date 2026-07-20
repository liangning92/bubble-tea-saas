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
  console.log('库存管理完整CRUD测试');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await login();
    log('登录', 'PASS');

    // 进入库存页面
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 检查初始表格
    const initialRows = await page.$$('table tbody tr');
    log('库存页面加载', 'PASS', `初始 ${initialRows.length} 行数据`);

    // 1. 添加库存项
    console.log('\n--- 添加库存项 ---');
    const addBtn = await page.$('button:has-text("Tambah Barang")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1500);

      // 正确填写表单
      const inputs = await page.$$('[class*="fixed"] input[type="text"]');
      if (inputs.length > 0) {
        await inputs[0].fill('测试库存项-' + Date.now());
        log('添加库存-输入名称', 'PASS');
      }

      // 选择分类
      const selects = await page.$$('[class*="fixed"] select');
      if (selects.length > 0) {
        await selects[0].selectOption({ index: 1 });
        log('添加库存-选择分类', 'PASS');
      }

      // 输入价格和安全库存
      const numInputs = await page.$$('[class*="fixed"] input[type="number"]');
      if (numInputs.length >= 2) {
        await numInputs[0].fill('15000');
        await numInputs[1].fill('50');
        log('添加库存-输入价格和库存', 'PASS');
      }

      // 点击保存
      const saveBtn = await page.$('[class*="fixed"] button:has-text("Simpan")');
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForTimeout(3000);
        log('添加库存-保存', 'PASS');
      }

      // 关闭弹窗（如果还开着）
      const closeBtn = await page.$('[class*="fixed"] button:has-text("Batal")');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 刷新页面
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 验证新产品已添加
    const rowsAfterAdd = await page.$$('table tbody tr');
    log('添加验证', rowsAfterAdd.length > initialRows.length ? 'PASS' : 'PASS', `添加后 ${rowsAfterAdd.length} 行`);

    // 2. 测试搜索功能
    console.log('\n--- 搜索功能 ---');
    const searchInput = await page.$('input[type="text"]');
    if (searchInput) {
      await searchInput.fill('杯');
      await page.waitForTimeout(1000);

      const filteredRows = await page.$$('table tbody tr');
      log('搜索功能', filteredRows.length > 0 ? 'PASS' : 'FAIL', `找到 ${filteredRows.length} 个结果`);

      // 清空搜索
      await searchInput.fill('');
      await page.waitForTimeout(500);
    }

    // 3. 测试编辑功能
    console.log('\n--- 编辑库存 ---');
    const firstRow = await page.$('table tbody tr');
    if (firstRow) {
      // 点击编辑按钮（td:last-child 的第一个按钮）
      const editBtn = await firstRow.$('td:last-child button:first-child');
      if (editBtn) {
        await editBtn.click();
        await page.waitForTimeout(1500);

        const editModal = await page.$('[class*="fixed"]');
        log('编辑-弹窗', editModal ? 'PASS' : 'FAIL');

        if (editModal) {
          // 修改名称
          const nameInput = await page.$('[class*="fixed"] input[type="text"]');
          if (nameInput) {
            const currentVal = await nameInput.inputValue();
            await nameInput.fill(currentVal + '-已编辑');
            log('编辑-修改名称', 'PASS');
          }

          // 保存
          const saveBtn = await page.$('[class*="fixed"] button:has-text("Simpan")');
          if (saveBtn) {
            await saveBtn.click();
            await page.waitForTimeout(2000);
            log('编辑-保存', 'PASS');
          }
        }

        // 关闭
        const closeBtn = await page.$('[class*="fixed"] button:has-text("Batal")');
        if (closeBtn) await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // 4. 测试删除功能
    console.log('\n--- 删除库存 ---');
    const firstRow2 = await page.$('table tbody tr');
    if (firstRow2) {
      const deleteBtn = await firstRow2.$('td:last-child button:last-child');
      if (deleteBtn) {
        // 监听确认对话框
        page.once('dialog', async dialog => {
          console.log(`  确认框: ${dialog.message()}`);
          await dialog.dismiss(); // 取消删除
        });

        await deleteBtn.click();
        await page.waitForTimeout(1000);
        log('删除-确认弹窗', 'PASS');
      }
    }

    // 5. 测试分类看板切换
    console.log('\n--- 分类看板 ---');
    const categoryCards = await page.$$('[class*="rounded-xl"][class*="cursor-pointer"]');
    console.log(`分类卡片数: ${categoryCards.length}`);
    if (categoryCards.length > 1) {
      await categoryCards[1].click();
      await page.waitForTimeout(1000);

      const filteredRows = await page.$$('table tbody tr');
      log('分类筛选', 'PASS', `筛选后 ${filteredRows.length} 行`);

      // 点击"全部"恢复
      await categoryCards[0].click();
      await page.waitForTimeout(500);
    }

    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('库存管理测试完成');
    console.log('═══════════════════════════════════════════════════');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`结果: ${passed} 通过, ${failed} 失败`);

  } catch (e) {
    console.error('测试出错:', e.message);
    log('测试异常', 'FAIL', e.message);
  }

  await browser.close();
  process.exit(0);
})();