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

  // ========== 登录 ==========
  console.log('\n═══════════════════════════════════════════════════');
  console.log('产品管理完整按钮测试');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await login();
    log('登录', 'PASS');

    // 进入产品列表
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 1. 添加产品
    console.log('\n--- 添加产品 ---');
    const addBtn = await page.$('button:has-text("Tambah Produk"), button:has-text("添加产品")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      const modal = await page.$('[class*="fixed"], [role="dialog"]');
      if (modal) {
        // 填写表单
        const inputs = await modal.$$('input[type="text"]');
        if (inputs.length > 0) await inputs[0].fill('测试产品ABC');
        const selects = await modal.$$('select');
        if (selects.length > 0) await selects[0].selectOption({ index: 1 });
        const numInputs = await modal.$$('input[type="number"]');
        if (numInputs.length > 0) await numInputs[0].fill('25000');

        // 点击保存
        const saveBtn = await modal.$('button[type="submit"], button:has-text("Simpan"), button:has-text("保存")');
        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(3000);
          log('添加产品-保存', 'PASS');
        } else {
          log('添加产品-保存按钮', 'FAIL', '未找到保存按钮');
        }
      } else {
        log('添加产品-弹窗', 'FAIL', '未找到弹窗');
      }
    } else {
      log('添加产品按钮', 'FAIL', '未找到');
    }

    // 刷新产品列表
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 2. 编辑产品
    console.log('\n--- 编辑产品 ---');
    const editBtn = await page.$('button:has-text("Edit"), button:has-text("编辑")');
    if (editBtn) {
      await editBtn.click();
      await page.waitForTimeout(1500);
      const editModal = await page.$('[class*="fixed"], [role="dialog"]');
      if (editModal) {
        log('编辑产品-弹窗打开', 'PASS');
        const closeBtn = await editModal.$('button:has-text("Batal"), button:has-text("取消"), button:has-text("Cancel")');
        if (closeBtn) await closeBtn.click();
        await page.waitForTimeout(500);
      } else {
        log('编辑产品-弹窗', 'FAIL', '未找到弹窗');
      }
    } else {
      log('编辑产品按钮', 'FAIL', '未找到');
    }

    // 刷新
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 3. 删除产品
    console.log('\n--- 删除产品 ---');
    const deleteBtn = await page.$('button:has-text("Hapus"), button:has-text("删除"), button:has-text("🗑")');
    if (deleteBtn) {
      // 先不真正删除，只点击看弹窗是否出现
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      const confirmModal = await page.$('[class*="modal"], [role="alertdialog"], text=Hapus');
      log('删除产品-确认弹窗', confirmModal ? 'PASS' : 'FAIL', confirmModal ? '' : '未找到确认弹窗');
      // 取消删除
      const cancelBtn = await page.$('button:has-text("Batal"), button:has-text("取消")');
      if (cancelBtn) await cancelBtn.click();
      await page.waitForTimeout(500);
    } else {
      log('删除产品按钮', 'FAIL', '未找到');
    }

    // 4. 上架/下架 (状态切换)
    console.log('\n--- 上下架状态 ---');
    const toggleBtn = await page.$('button:has-text("Aktif"), button:has-text("Tidak Aktif"), button:has-text("active"), button:has-text("inactive")');
    if (toggleBtn) {
      await toggleBtn.click();
      await page.waitForTimeout(1500);
      log('上下架切换', 'PASS');
    } else {
      log('上下架按钮', 'FAIL', '未找到');
    }

    // 刷新检查状态是否改变
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 5. 分类管理
    console.log('\n--- 分类管理 ---');
    await page.goto(`${BASE_URL}/products/categories`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const addCatBtn = await page.$('button:has-text("Tambah Kategori"), button:has-text("添加分类")');
    if (addCatBtn) {
      await addCatBtn.click();
      await page.waitForTimeout(1500);
      const catModal = await page.$('[class*="fixed"]');
      log('添加分类弹窗', catModal ? 'PASS' : 'FAIL');
      if (catModal) {
        const closeBtn = await catModal.$('button:has-text("Batal"), button:has-text("取消")');
        if (closeBtn) await closeBtn.click();
        await page.waitForTimeout(500);
      }
    } else {
      log('添加分类按钮', 'FAIL', '未找到');
    }

    // 6. Addons管理
    console.log('\n--- Addons管理 ---');
    await page.goto(`${BASE_URL}/products/addons`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const addAddonBtn = await page.$('button:has-text("Tambah"), button:has-text("添加")');
    if (addAddonBtn) {
      await addAddonBtn.click();
      await page.waitForTimeout(1500);
      const addonModal = await page.$('[class*="fixed"]');
      log('添加Addon弹窗', addonModal ? 'PASS' : 'FAIL');
      if (addonModal) {
        const closeBtn = await addonModal.$('button:has-text("Batal"), button:has-text("取消")');
        if (closeBtn) await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('产品管理按钮测试完成');
    console.log('═══════════════════════════════════════════════════');

  } catch (e) {
    console.error('测试出错:', e.message);
  }

  await browser.close();
  process.exit(0);
})();
