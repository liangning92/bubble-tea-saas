const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  let token, storeId, staffId, userId;
  let productId, staffName, invName;

  function log(name, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
    results.push({ name, status, details });
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       完整业务流程测试 - 前端+API+数据库全链路验证            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  try {
    // ========== 1. 登录 ==========
    console.log('【1. 登录】\n');

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 获取token
    const authData = await page.evaluate(() => {
      const data = localStorage.getItem('auth-storage');
      if (data) {
        const parsed = JSON.parse(data);
        return {
          token: parsed.state?.token,
          userId: parsed.state?.user?.id,
          storeId: parsed.state?.user?.storeId,
          staffId: parsed.state?.user?.staff?.id
        };
      }
      return null;
    });

    if (!authData?.token) {
      console.log('❌ 无法获取认证token');
      await browser.close();
      process.exit(1);
    }

    token = authData.token;
    userId = authData.userId;
    storeId = authData.storeId;
    staffId = authData.staffId;
    log('登录成功', 'PASS', `用户: ${userId}, 店铺: ${storeId}`);

    // ========== 2. 添加产品 ==========
    console.log('\n【2. 添加产品】\n');

    const productName = 'E2E奶茶-' + Date.now();
    console.log(`产品名称: ${productName}`);

    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

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

    // ========== 3. API验证产品 ==========
    console.log('\n【3. API验证产品保存】\n');

    const productsAPI = await page.evaluate(async (t) => {
      const res = await fetch('http://localhost:7072/api/products?pageSize=100', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      return res.json();
    }, token);

    const createdProduct = productsAPI?.data?.list?.find(p => p.name === productName);
    log('产品API验证', createdProduct ? 'PASS' : 'FAIL', createdProduct ? `ID: ${createdProduct.id}` : '数据库未找到');
    productId = createdProduct?.id;

    // ========== 4. 编辑产品 ==========
    console.log('\n【4. 编辑产品】\n');

    if (productId) {
      await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const searchInput = await page.$('input[placeholder*="Cari"], input[placeholder*="Search"]');
      if (searchInput) {
        await searchInput.fill(productName);
        await page.waitForTimeout(1000);
      }

      const editBtn = await page.$('table tbody tr:first-child td:last-child button:first-child');
      if (editBtn) {
        await editBtn.click();
        await page.waitForTimeout(1500);
      }

      const priceInput = await page.$('form input[type="number"]');
      if (priceInput) {
        await priceInput.fill('');
        await priceInput.fill('30000');
      }

      await page.click('form button[type="submit"]');
      await page.waitForTimeout(3000);

      // API验证编辑 - 使用对象传递多个参数
      const updatedAPI = await page.evaluate(async (args) => {
        const res = await fetch(`http://localhost:7072/api/products/${args.id}`, {
          headers: { 'Authorization': `Bearer ${args.token}` }
        });
        return res.json();
      }, { id: productId, token });

      const priceUpdated = updatedAPI?.data?.specs?.[0]?.price === 30000;
      log('产品编辑验证', priceUpdated ? 'PASS' : 'FAIL', priceUpdated ? '价格已更新为30000' : `价格: ${updatedAPI?.data?.specs?.[0]?.price}`);
    } else {
      log('产品编辑', 'FAIL', '产品ID不存在');
    }

    // ========== 5. 删除产品 ==========
    console.log('\n【5. 删除产品】\n');

    if (productId) {
      page.once('dialog', d => d.accept());

      const deleteBtn = await page.$('table tbody tr:first-child td:last-child button:last-child');
      if (deleteBtn) {
        await deleteBtn.click();
        await page.waitForTimeout(2000);
      }

      const deletedAPI = await page.evaluate(async (args) => {
        const res = await fetch(`http://localhost:7072/api/products/${args.id}`, {
          headers: { 'Authorization': `Bearer ${args.token}` }
        });
        return { status: res.status };
      }, { id: productId, token });

      log('产品删除验证', deletedAPI.status === 404 ? 'PASS' : 'FAIL', deletedAPI.status === 404 ? '产品已从数据库删除' : `状态码: ${deletedAPI.status}`);
    }

    // ========== 6. 库存添加 ==========
    console.log('\n【6. 库存添加流程】\n');

    invName = 'E2E库存-' + Date.now();
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

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
    log('库存API验证', invFound ? 'PASS' : 'FAIL', invFound ? '库存已保存到数据库' : '数据库未找到');

    // ========== 7. 员工添加 ==========
    console.log('\n【7. 员工添加流程】\n');

    staffName = 'E2E员工-' + Date.now();
    await page.goto(`${BASE_URL}/staff`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.click('a:has-text("Tambah")');
    await page.waitForTimeout(2000);

    const staffInputs = await page.$$('form input[type="text"]');
    if (staffInputs.length > 0) await staffInputs[0].fill(staffName);

    const staffPhone = await page.$('form input[type="tel"]');
    if (staffPhone) await staffPhone.fill('0812' + Math.floor(Math.random() * 100000000));

    const staffPwd = await page.$('form input[type="password"]');
    if (staffPwd) await staffPwd.fill('test123456');

    await page.click('form button[type="submit"]');
    await page.waitForTimeout(3000);

    const staffAPI = await page.evaluate(async (t) => {
      const res = await fetch('http://localhost:7072/api/staff?pageSize=100', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      return res.json();
    }, token);

    const staffFound = staffAPI?.data?.list?.some(s => s.name?.includes('E2E员工'));
    log('员工API验证', staffFound ? 'PASS' : 'FAIL', staffFound ? '员工已保存到数据库' : '数据库未找到');

    // ========== 总结 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                      全链路测试总结                            ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${icon} ${r.name}: ${r.status} ${r.details || ''}`);
    });

    console.log(`\n总计: ${passed}/${passed + failed} 通过`);
    if (failed > 0) console.log(`失败: ${failed}`);

  } catch (e) {
    console.error('\n异常:', e.message);
    console.error(e.stack);
  }

  await browser.close();
  process.exit(0);
})();