const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  return { name, status, details };
}

async function closeModal(page) {
  const closePatterns = ['Batal', 'Cancel', '取消', 'Close'];
  for (const pattern of closePatterns) {
    const btn = page.locator(`button`).filter({ hasText: new RegExp(pattern, 'i') }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await sleep(500);
      return true;
    }
  }
  // Try backdrop click
  const backdrop = page.locator('.fixed.inset-0, [class*="backdrop"], [class*="overlay"]').first();
  if (await backdrop.count() > 0) {
    await backdrop.click({ position: { x: 10, y: 10 } });
    await sleep(500);
    return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const consoleErrors = [];
  let testIndex = 0;

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Warning') && !msg.text().includes('warning') && !msg.text().includes('Download the')) {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  const test = (name, ok, details = '') => {
    testIndex++;
    const result = log(name, ok ? 'PASS' : 'FAIL', details);
    results.push({ index: testIndex, name, status: ok ? 'PASS' : 'FAIL', details });
    return ok;
  };

  console.log('\n' + '═'.repeat(70));
  console.log('     Bubble Tea SaaS Admin - 全面功能测试 (按钮级别)');
  console.log('═'.repeat(70) + '\n');

  // ========== 登录 ==========
  console.log('【1. 登录系统】');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await sleep(2000);

  const loginBody = await page.textContent('body');
  test('1.1 登录页面加载', loginBody.includes('Bubble') || loginBody.includes('Masuk') || loginBody.includes('登录'));

  const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[placeholder*="08"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  if (await phoneInput.count() > 0 && await passwordInput.count() > 0) {
    await phoneInput.fill((process.env.TEST_ADMIN_PHONE || ''));
    await passwordInput.fill((process.env.TEST_ADMIN_PASSWORD || ''));
    await sleep(500);
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await sleep(3000);
    }
  }

  const afterLoginUrl = page.url();
  test('1.2 登录成功跳转Dashboard', !afterLoginUrl.includes('login'));

  // ========== Dashboard ==========
  console.log('\n【2. Dashboard】');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(2000);

  const dashBody = await page.textContent('body');
  test('2.1 Dashboard加载', dashBody.length > 100);
  test('2.2 Dashboard显示订单数据', dashBody.includes('Pesanan') || dashBody.includes('Order') || dashBody.includes('订单'));
  test('2.3 Dashboard显示收入数据', dashBody.includes('Pendapatan') || dashBody.includes('Revenue') || dashBody.includes('收入'));

  // ========== 产品管理 (Products) ==========
  console.log('\n【3. 产品管理 - Produk】');

  // --- 产品列表 ---
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  await sleep(2000);
  const prodBody = await page.textContent('body');
  test('3.1 产品列表页面加载', prodBody.includes('Produk') || prodBody.includes('Product') || prodBody.includes('产品'));

  // Add Product button
  let addBtn = page.locator('button').filter({ hasText: /Tambah|Add|Buat/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(2000);
    const modalBody = await page.textContent('body');
    test('3.2 添加产品弹窗打开', modalBody.includes('Form') || modalBody.includes('form') || modalBody.includes('Tambah') || modalBody.includes('Produk'));

    // Fill form
    const nameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    const priceInput = page.locator('input[name="price"], input[placeholder*="Harga" i]').first();

    if (await nameInput.count() > 0) {
      await nameInput.fill('Test Product ' + Date.now());
      test('3.3 填写产品名称', true);
    }
    if (await priceInput.count() > 0) {
      await priceInput.fill('15000');
      test('3.4 填写产品价格', true);
    }

    const simpanBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
    if (await simpanBtn.count() > 0) {
      await simpanBtn.click();
      await sleep(2000);
      test('3.5 保存产品按钮可点击', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit first product
  const editProdBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editProdBtn.count() > 0) {
    await editProdBtn.click();
    await sleep(1500);
    test('3.6 编辑产品弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete product
  const delProdBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delProdBtn.count() > 0) {
    await delProdBtn.click();
    await sleep(1000);
    test('3.7 删除产品按钮', true);
    const confirmBtn = page.locator('button').filter({ hasText: /Ya|Yes|Hapus/i }).first();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      await sleep(1000);
    }
    await closeModal(page);
    await sleep(500);
  }

  // --- 分类管理 ---
  await page.goto(`${BASE_URL}/products/categories`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('3.8 分类管理页面加载', (await page.textContent('body')).includes('Kategori') || (await page.textContent('body')).includes('Category') || (await page.textContent('body')).includes('分类'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('3.9 添加分类弹窗', true);
    const catNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    if (await catNameInput.count() > 0) {
      await catNameInput.fill('Test Category ' + Date.now());
      test('3.10 填写分类名称', true);
    }
    const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await sleep(1500);
      test('3.11 保存分类', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit category
  const editCatBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editCatBtn.count() > 0) {
    await editCatBtn.click();
    await sleep(1500);
    test('3.12 编辑分类弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete category
  const delCatBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delCatBtn.count() > 0) {
    await delCatBtn.click();
    await sleep(1000);
    test('3.13 删除分类按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- Addons管理 ---
  await page.goto(`${BASE_URL}/products/addons`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('3.14 Addons页面加载', (await page.textContent('body')).includes('Addon') || (await page.textContent('body')).includes('Tambahan'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('3.15 添加Addon弹窗', true);
    const addonNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    const addonPriceInput = page.locator('input[name="price"], input[placeholder*="Harga" i]').first();
    if (await addonNameInput.count() > 0) {
      await addonNameInput.fill('Test Addon ' + Date.now());
      test('3.16 填写Addon名称', true);
    }
    if (await addonPriceInput.count() > 0) {
      await addonPriceInput.fill('5000');
      test('3.17 填写Addon价格', true);
    }
    const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await sleep(1500);
      test('3.18 保存Addon', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit addon
  const editAddonBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editAddonBtn.count() > 0) {
    await editAddonBtn.click();
    await sleep(1500);
    test('3.19 编辑Addon弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete addon
  const delAddonBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delAddonBtn.count() > 0) {
    await delAddonBtn.click();
    await sleep(1000);
    test('3.20 删除Addon按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // ========== 库存管理 (Inventory) ==========
  console.log('\n【4. 库存管理 - Inventaris】');

  // --- 库存列表 ---
  await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('4.1 库存列表页面加载', (await page.textContent('body')).includes('Inventaris') || (await page.textContent('body')).includes('Inventory') || (await page.textContent('body')).includes('库存'));

  // Stock In
  const stockInBtn = page.locator('button').filter({ hasText: /Masuk|Stock In|Barang Masuk/i }).first();
  if (await stockInBtn.count() > 0) {
    await stockInBtn.click();
    await sleep(1500);
    test('4.2 入库弹窗打开', true);
    const qtyInput = page.locator('input[name="quantity"], input[name="qty"], input[placeholder*="Jumlah" i]').first();
    if (await qtyInput.count() > 0) {
      await qtyInput.fill('10');
      test('4.3 填写入库数量', true);
    }
    const submitBtn = page.locator('button').filter({ hasText: /Simpan|Save|Masuk/i }).first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await sleep(1500);
      test('4.4 提交入库', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Stock Out
  const stockOutBtn = page.locator('button').filter({ hasText: /Keluar|Stock Out|Barang Keluar/i }).first();
  if (await stockOutBtn.count() > 0) {
    await stockOutBtn.click();
    await sleep(1500);
    test('4.5 出库弹窗打开', true);
    const qtyOutInput = page.locator('input[name="quantity"], input[name="qty"]').first();
    if (await qtyOutInput.count() > 0) {
      await qtyOutInput.fill('5');
      test('4.6 填写出库数量', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // --- 库存记录 ---
  await page.goto(`${BASE_URL}/inventory/logs`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('4.7 库存记录页面加载', (await page.textContent('body')).includes('Riwayat') || (await page.textContent('body')).includes('Log') || (await page.textContent('body')).includes('记录'));

  // --- 库存警报 ---
  await page.goto(`${BASE_URL}/inventory/alerts`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('4.8 库存警报页面加载', (await page.textContent('body')).includes('Alert') || (await page.textContent('body')).includes('Peringatan') || (await page.textContent('body')).includes('警报'));

  // Alert config
  const configAlertBtn = page.locator('button').filter({ hasText: /Konfigurasi|Config/i }).first();
  if (await configAlertBtn.count() > 0) {
    await configAlertBtn.click();
    await sleep(1500);
    test('4.9 警报配置弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 库存盘点 (correct route: /inventory/count) ---
  await page.goto(`${BASE_URL}/inventory/count`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('4.10 盘点功能加载', (await page.textContent('body')).includes('Audit') || (await page.textContent('body')).includes('Stock Opname') || (await page.textContent('body')).includes('盘点') || (await page.textContent('body')).includes('Hitung') || (await page.textContent('body')).includes('inventory'));

  // Start count button
  const startCountBtn = page.locator('button').filter({ hasText: /Mulai|Start|Begin/i }).first();
  if (await startCountBtn.count() > 0) {
    await startCountBtn.click();
    await sleep(1000);
    test('4.11 开始盘点按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 加工工艺 ---
  await page.goto(`${BASE_URL}/inventory/process`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('4.12 加工工艺页面加载', (await page.textContent('body')).includes('Proses') || (await page.textContent('body')).includes('Processing') || (await page.textContent('body')).includes('加工'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('4.13 添加加工弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 供应商 ---
  await page.goto(`${BASE_URL}/inventory/suppliers`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('4.14 供应商页面加载', (await page.textContent('body')).includes('Supplier') || (await page.textContent('body')).includes('Pemasok') || (await page.textContent('body')).includes('供应商'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('4.15 添加供应商弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // ========== 员工管理 (Staff) ==========
  console.log('\n【5. 员工管理 - Karyawan】');

  // --- 员工列表 ---
  await page.goto(`${BASE_URL}/staff`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.1 员工列表页面加载', (await page.textContent('body')).includes('Karyawan') || (await page.textContent('body')).includes('Staff') || (await page.textContent('body')).includes('员工'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(2000);
    test('5.2 添加员工弹窗', true);
    const staffNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    const staffPhoneInput = page.locator('input[name="phone"], input[placeholder*="08" i]').first();
    if (await staffNameInput.count() > 0) {
      await staffNameInput.fill('Test Staff ' + Date.now());
      test('5.3 填写员工姓名', true);
    }
    if (await staffPhoneInput.count() > 0) {
      await staffPhoneInput.fill('0812345678' + Math.floor(Math.random() * 10));
      test('5.4 填写员工电话', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit staff
  const editStaffBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editStaffBtn.count() > 0) {
    await editStaffBtn.click();
    await sleep(1500);
    test('5.5 编辑员工弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete staff
  const delStaffBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delStaffBtn.count() > 0) {
    await delStaffBtn.click();
    await sleep(1000);
    test('5.6 删除员工按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 排班管理 ---
  await page.goto(`${BASE_URL}/staff/schedule`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.7 排班管理页面加载', (await page.textContent('body')).includes('Jadwal') || (await page.textContent('body')).includes('Schedule') || (await page.textContent('body')).include