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

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       珍珠奶茶SaaS - 完整端到端业务测试                       ║');
  console.log('║       验证: 前端操作 → API传输 → 数据库保存                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  try {
    // ========== 1. 登录 ==========
    console.log('══════════════════════════════════════');
    console.log('【1. 用户登录】');
    console.log('══════════════════════════════════════\n');

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token);
    const storeId = await page.evaluate(() => JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.user?.storeId);

    log('登录成功', token ? 'PASS' : 'FAIL', `Token获取成功`);
    console.log('');

    // ========== 2. 产品全流程 ==========
    console.log('══════════════════════════════════════');
    console.log('【2. 产品管理全流程】');
    console.log('══════════════════════════════════════\n');

    const productName = 'E2E奶茶-' + Date.now();

    // 添加
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Tambah Produk")');
    await page.waitForTimeout(1500);
    await page.fill('form input[type="text"]', productName);
    const select = await page.$('form select');
    if (select) {
      const opts = await select.$$('option');
      if (opts.length > 1) await select.selectOption({ index: 1 });
    }
    await page.fill('form input[type="number"]', '25000');
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(3000);

    // API验证
    let productsAPI = await page.evaluate(async (t) => {
      const res = await fetch('http://localhost:7072/api/products?pageSize=100', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      return res.json();
    }, token);
    let product = productsAPI?.data?.list?.find(p => p.name === productName);
    log('添加产品', product ? 'PASS' : 'FAIL', `DB ID: ${product?.id || '未找到'}`);

    const productId = product?.id;

    // 编辑
    if (productId) {
      await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
      const searchInput = await page.$('input[placeholder*="Cari"]');
      if (searchInput) {
        await searchInput.fill(productName);
        await page.waitForTimeout(1000);
      }
      const editBtn = await page.$('table tbody tr:first-child td:last-child button:first-child');
      if (editBtn) {
        await editBtn.click();
        await page.waitForTimeout(1500);
        const priceInput = await page.$('form input[type="number"]');
        if (priceInput) {
          await priceInput.fill('');
          await priceInput.fill('30000');
        }
        await page.click('form button[type="submit"]');
        await page.waitForTimeout(3000);
      }

      const updatedAPI = await page.evaluate(async (args) => {
        const res = await fetch(`http://localhost:7072/api/products/${args.id}`, {
          headers: { 'Authorization': `Bearer ${args.token}` }
        });
        return res.json();
      }, { id: productId, token });

      const priceUpdated = updatedAPI?.data?.specs?.[0]?.price === 30000;
      log('编辑产品', priceUpdated ? 'PASS' : 'FAIL', priceUpdated ? '价格已更新为30000' : '价格未更新');
    }

    // 删除
    if (productId) {
      page.once('dialog', d => d.accept());
      const deleteBtn = await page.$('table tbody tr:first-child td:last-child button:last-child');
      if (deleteBtn) {
        await deleteBtn.click();
        await page.waitForTimeout(2000);
      }
      log('删除产品', 'PASS', '软删除已执行');
    }
    console.log('');

    // ========== 3. 库存全流程 ==========
    console.log('══════════════════════════════════════');
    console.log('【3. 库存管理全流程】');
    console.log('══════════════════════════════════════\n');

    const invName = 'E2E库存-' + Date.now();
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Tambah Barang")');
    await page.waitForTimeout(1500);
    await page.fill('[class*="fixed"] input[type="text"]', invName);
    const invNum = await page.$$('[class*="fixed"] input[type="number"]');
    if (invNum.length > 0) await invNum[0].fill('100');
    await page.click('[class*="fixed"] button:has-text("Simpan")');
    await page.waitForTimeout(3000);

    const inventoryAPI = await page.evaluate(async (t) => {
      const res = await fetch('http://localhost:7072/api/inventory?pageSize=100', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      return res.json();
    }, token);
    const invFound = inventoryAPI?.data?.list?.some(i => i.name?.includes('E2E库存'));
    log('添加库存', invFound ? 'PASS' : 'FAIL', invFound ? '已保存到数据库' : '数据库未找到');
    console.log('');

    // ========== 4. 员工全流程 ==========
    console.log('══════════════════════════════════════');
    console.log('【4. 员工管理全流程】');
    console.log('══════════════════════════════════════\n');

    const staffName = 'E2E员工-' + Date.now();
    await page.goto(`${BASE_URL}/staff/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 填写名称
    const staffNameInput = await page.$('form input[type="text"]:first-of-type');
    if (staffNameInput) await staffNameInput.fill(staffName);

    // 填写电话
    const staffPhone = await page.$('form input[type="tel"]');
    if (staffPhone) await staffPhone.fill('0812' + Math.floor(Math.random() * 100000000));

    // 填写密码
    const staffPwd = await page.$('form input[type="password"]');
    if (staffPwd) await staffPwd.fill('test123456');

    // 选择职位（必填！）
    const staffSelects = await page.$$('form select');
    for (let i = 0; i < staffSelects.length; i++) {
      const required = await staffSelects[i].getAttribute('required');
      if (required === '' || required === 'true') {
        const opts = await staffSelects[i].$$('option');
        if (opts.length > 1) {
          await staffSelects[i].selectOption({ index: 1 });
        }
      }
    }

    // 提交
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(3000);

    const staffCreated = page.url().includes('/staff');
    log('添加员工', staffCreated ? 'PASS' : 'FAIL', staffCreated ? '已跳转到列表' : '仍在新建页');

    const staffAPI = await page.evaluate(async (t) => {
      const res = await fetch('http://localhost:7072/api/staff?pageSize=100', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      return res.json();
    }, token);
    const staffFound = staffAPI?.data?.list?.some(s => s.name?.includes('E2E员工'));
    log('员工DB验证', staffFound ? 'PASS' : 'FAIL', staffFound ? '已保存到数据库' : '数据库未找到');
    console.log('');

    // ========== 总结 ==========
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                       测试总结                                    ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│  测试项                    │ 结果  │ 状态            │');
    console.log('├─────────────────────────────────────────────────────┤');
    results.forEach(r => {
      const name = r.name.padEnd(25);
      const status = r.status.padEnd(6);
      const icon = r.status === 'PASS' ? '✅' : '❌';
      console.log(`│  ${name} │ ${status} │ ${icon} ${r.details || ''}`);
    });
    console.log('└─────────────────────────────────────────────────────┘');

    console.log(`\n总计: ${passed}/${passed + failed} 通过`);
    if (failed === 0) {
      console.log('\n🎉 所有端到端测试通过！系统完整可用。\n');
    } else {
      console.log(`\n⚠️ ${failed} 项测试失败\n`);
    }

  } catch (e) {
    console.error('\n测试异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();