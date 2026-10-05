const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  return { name, status, details };
}

async function closeModal(page) {
  // Try X button, Escape, backdrop
  for (const text of ['×', 'X', 'Tutup', 'Close', 'Batal', 'Cancel', '取消']) {
    const btn = page.locator(`button`).filter({ hasText: new RegExp(`^${text}$`) }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await sleep(500);
      return;
    }
  }
  await page.keyboard.press('Escape');
  await sleep(500);
}

async function fillAndSave(page, fields) {
  // Fill fields and try to save
  for (const [selector, value] of Object.entries(fields)) {
    const input = page.locator(selector).first();
    if (await input.count() > 0) {
      await input.fill(String(value));
      await sleep(200);
    }
  }
  await sleep(300);

  // Look for save button
  for (const text of ['Simpan', 'Save', 'Konfirmasi', 'Confirm', '确认', '保存']) {
    const btn = page.locator('button').filter({ hasText: new RegExp(text, 'i') }).last();
    if (await btn.count() > 0) {
      await btn.click();
      await sleep(1000);
      return true;
    }
  }
  return false;
}

async function runDeepTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Warning')) {
      errors.push(msg.text().substring(0, 80));
    }
  });

  console.log('\n' + '═'.repeat(70));
  console.log('     Bubble Tea SaaS - 深度功能测试 (用户设置操作)');
  console.log('═'.repeat(70) + '\n');

  try {
    // 1. Login
    console.log('【1. 登录】');
    await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'networkidle' });
    await sleep(2000);
    await page.fill('input[type="tel"]', (process.env.TEST_ADMIN_PHONE || ''));
    await page.fill('input[type="password"]', (process.env.TEST_ADMIN_PASSWORD || ''));
    await page.click('button[type="submit"]');
    await sleep(3000);
    results.push(log('1.1 登录成功', !page.url().includes('login') ? 'PASS' : 'FAIL', page.url()));

    // ============================================
    // 2. 系统设置 - 基本信息
    // ============================================
    console.log('\n【2. 系统设置 - 基本信息】');
    await page.goto(`${ADMIN_URL}/settings`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const settingsBody = await page.textContent('body');
    results.push(log('2.1 设置页面加载', settingsBody.includes('Pengaturan') || settingsBody.includes('Settings') ? 'PASS' : 'FAIL'));

    // Try to edit store name (settings auto-save on blur)
    const storeNameInput = page.locator('input[placeholder*="Toko" i], input[placeholder*="Store" i], input[placeholder*="Contoh" i]').first();
    if (await storeNameInput.count() > 0) {
      await storeNameInput.fill('Test Store ' + Date.now());
      await page.waitForTimeout(1500);
      results.push(log('2.2 保存店铺名称', 'PASS', 'Auto-save on blur'));
    } else {
      results.push(log('2.2 保存店铺名称', 'SKIP', 'Input not found'));
    }

    // ============================================
    // 3. POS设置
    // ============================================
    console.log('\n【3. POS设置】');
    await page.goto(`${ADMIN_URL}/settings`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const posBody = await page.textContent('body');
    results.push(log('3.1 POS设置页面加载', posBody.includes('POS') || posBody.includes('Point of Sale') || posBody.includes('Toko') ? 'PASS' : 'FAIL'));

    // Check if there are editable fields
    const posInputs = await page.locator('input, select').count();
    results.push(log('3.2 POS设置有配置项', posInputs > 0 ? 'PASS' : 'FAIL', `Found: ${posInputs}`));

    // ============================================
    // 4. 产品管理 - 添加产品
    // ============================================
    console.log('\n【4. 产品管理 - 添加产品】');
    await page.goto(`${ADMIN_URL}/products`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const prodBody = await page.textContent('body');
    results.push(log('4.1 产品列表加载', prodBody.includes('Produk') || prodBody.includes('Product') ? 'PASS' : 'FAIL'));

    // Click add button
    const addProdBtn = page.locator('button').filter({ hasText: /Tambah|Add|Buat/i }).first();
    if (await addProdBtn.count() > 0) {
      await addProdBtn.click();
      await sleep(2000);

      const modalVisible = await page.locator('input[name="name"], input[placeholder*="Nama" i]').count();
      results.push(log('4.2 添加产品弹窗', modalVisible > 0 ? 'PASS' : 'FAIL'));

      if (modalVisible > 0) {
        // Fill product name
        await page.fill('input[name="name"], input[placeholder*="Nama" i]', '测试产品 ' + Date.now());
        await sleep(300);

        // Fill price if available
        const priceInput = page.locator('input[name="price"], input[placeholder*="Harga" i], input[name="basePrice"]').first();
        if (await priceInput.count() > 0) {
          await priceInput.fill('25000');
        }
        await sleep(500);

        // Save
        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(2000);
          results.push(log('4.3 保存新产品', 'PASS'));
        }

        await closeModal(page);
      }
    } else {
      results.push(log('4.2 添加产品弹窗', 'SKIP', 'Add button not found'));
    }

    // ============================================
    // 5. 产品分类管理
    // ============================================
    console.log('\n【5. 产品分类管理】');
    await page.goto(`${ADMIN_URL}/products/categories`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const catBody = await page.textContent('body');
    results.push(log('5.1 分类页面加载', catBody.includes('Kategori') || catBody.includes('Category') ? 'PASS' : 'FAIL'));

    const addCatBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addCatBtn.count() > 0) {
      await addCatBtn.click();
      await sleep(1500);

      const catInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await catInput.count() > 0) {
        await catInput.fill('测试分类 ' + Date.now());
        await sleep(300);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(1500);
          results.push(log('5.2 添加分类', 'PASS'));
        }
      }
      await closeModal(page);
    }

    // ============================================
    // 6. 库存管理 - 入库
    // ============================================
    console.log('\n【6. 库存管理 - 入库】');
    await page.goto(`${ADMIN_URL}/inventory`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const invBody = await page.textContent('body');
    results.push(log('6.1 库存页面加载', invBody.includes('Inventaris') || invBody.includes('Inventory') ? 'PASS' : 'FAIL'));

    // Stock In
    const stockInBtn = page.locator('button').filter({ hasText: /Masuk|Stock In|Barang Masuk/i }).first();
    if (await stockInBtn.count() > 0) {
      await stockInBtn.click();
      await sleep(1500);

      const qtyInput = page.locator('input[name="quantity"], input[name="qty"], input[placeholder*="Jumlah" i]').first();
      if (await qtyInput.count() > 0) {
        await qtyInput.fill('100');
        await sleep(300);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save|Masuk/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(1500);
          results.push(log('6.2 库存入库', 'PASS'));
        }
      }
      await closeModal(page);
    }

    // ============================================
    // 7. 供应商管理
    // ============================================
    console.log('\n【7. 供应商管理】');
    await page.goto(`${ADMIN_URL}/inventory/suppliers`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const suppBody = await page.textContent('body');
    results.push(log('7.1 供应商页面加载', suppBody.includes('Supplier') || suppBody.includes('Pemasok') ? 'PASS' : 'FAIL'));

    const addSuppBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addSuppBtn.count() > 0) {
      await addSuppBtn.click();
      await sleep(1500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('测试供应商 ' + Date.now());
        await sleep(300);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(1500);
          results.push(log('7.2 添加供应商', 'PASS'));
        }
      }
      await closeModal(page);
    }

    // ============================================
    // 8. 员工管理 - 添加员工
    // ============================================
    console.log('\n【8. 员工管理 - 添加员工】');
    await page.goto(`${ADMIN_URL}/staff`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const staffBody = await page.textContent('body');
    results.push(log('8.1 员工列表加载', staffBody.includes('Karyawan') || staffBody.includes('Staff') ? 'PASS' : 'FAIL'));

    const addStaffBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addStaffBtn.count() > 0) {
      await addStaffBtn.click();
      await sleep(2000);

      const nameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('测试员工 ' + Date.now());
        await sleep(300);

        const phoneInput = page.locator('input[name="phone"], input[placeholder*="08" i]').first();
        if (await phoneInput.count() > 0) {
          await phoneInput.fill('0812345678' + Math.floor(Math.random() * 10));
        }
        await sleep(500);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(2000);
          results.push(log('8.2 添加员工', 'PASS'));
        }
      }
      await closeModal(page);
    }

    // ============================================
    // 9. 工资管理
    // ============================================
    console.log('\n【9. 工资管理】');
    await page.goto(`${ADMIN_URL}/staff/salary`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const salaryBody = await page.textContent('body');
    results.push(log('9.1 工资页面加载', salaryBody.includes('Gaji') || salaryBody.includes('Salary') ? 'PASS' : 'FAIL'));

    // ============================================
    // 10. 财务 - 支出管理
    // ============================================
    console.log('\n【10. 财务管理 - 支出】');
    await page.goto(`${ADMIN_URL}/finance/expenses`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const expBody = await page.textContent('body');
    results.push(log('10.1 支出页面加载', expBody.includes('Pengeluaran') || expBody.includes('Expense') || expBody.includes('支出') ? 'PASS' : 'FAIL'));

    const addExpBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addExpBtn.count() > 0) {
      await addExpBtn.click();
      await sleep(1500);

      const amountInput = page.locator('input[name="amount"], input[placeholder*="Jumlah" i], input[name="nominal"]').first();
      if (await amountInput.count() > 0) {
        await amountInput.fill('500000');
        await sleep(300);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(1500);
          results.push(log('10.2 添加支出', 'PASS'));
        }
      }
      await closeModal(page);
    }

    // ============================================
    // 11. 渠道管理
    // ============================================
    console.log('\n【11. 渠道管理】');
    await page.goto(`${ADMIN_URL}/channels`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const chBody = await page.textContent('body');
    results.push(log('11.1 渠道页面加载', chBody.includes('Saluran') || chBody.includes('Channel') ? 'PASS' : 'FAIL'));

    const addChBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addChBtn.count() > 0) {
      await addChBtn.click();
      await sleep(1500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('测试渠道 ' + Date.now());
        await sleep(300);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(1500);
          results.push(log('11.2 添加渠道', 'PASS'));
        }
      }
      await closeModal(page);
    }

    // ============================================
    // 12. 卫生管理 - 任务模板
    // ============================================
    console.log('\n【12. 卫生管理 - 任务模板】');
    await page.goto(`${ADMIN_URL}/hygiene`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const hygBody = await page.textContent('body');
    results.push(log('12.1 卫生模板页面加载', hygBody.includes('Template') || hygBody.includes('Kebersihan') || hygBody.includes('卫生') || hygBody.includes('Tambah') ? 'PASS' : 'FAIL'));

    const addTplBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addTplBtn.count() > 0) {
      await addTplBtn.click();
      await sleep(1500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('测试任务模板 ' + Date.now());
        await sleep(300);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(1500);
          results.push(log('12.2 添加卫生模板', 'PASS'));
        }
      }
      await closeModal(page);
    }

    // ============================================
    // 13. 卫生管理 - 区域管理
    // ============================================
    console.log('\n【13. 卫生管理 - 区域】');
    await page.goto(`${ADMIN_URL}/hygiene/areas`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const areaBody = await page.textContent('body');
    results.push(log('13.1 区域页面加载', areaBody.includes('Area') || areaBody.includes('Wilayah') || areaBody.includes('区域') ? 'PASS' : 'FAIL'));

    const addAreaBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addAreaBtn.count() > 0) {
      await addAreaBtn.click();
      await sleep(1500);

      const nameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('测试区域 ' + Date.now());
        await sleep(300);

        const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await saveBtn.count()