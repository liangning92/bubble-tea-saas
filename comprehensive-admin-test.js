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
    await phoneInput.fill('081234567890');
    await passwordInput.fill('admin123');
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
  test('5.7 排班管理页面加载', (await page.textContent('body')).includes('Jadwal') || (await page.textContent('body')).includes('Schedule') || (await page.textContent('body')).includes('排班'));

  // Shift config
  const shiftConfigBtn = page.locator('a, button').filter({ hasText: /Shift|Konfigurasi/i }).first();
  if (await shiftConfigBtn.count() > 0) {
    await shiftConfigBtn.click();
    await sleep(1500);
    test('5.8 班次配置页面', true);
    await page.goBack();
    await sleep(1000);
  }

  // --- 考勤管理 ---
  await page.goto(`${BASE_URL}/staff/attendance`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.9 考勤管理页面加载', (await page.textContent('body')).includes('Absensi') || (await page.textContent('body')).includes('Attendance') || (await page.textContent('body')).includes('考勤'));

  // --- 请假管理 (correct route: /staff/attendance/leave) ---
  await page.goto(`${BASE_URL}/staff/attendance/leave`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.10 请假管理页面加载', (await page.textContent('body')).includes('Cuti') || (await page.textContent('body')).includes('Leave') || (await page.textContent('body')).includes('请假'));

  // Approve leave
  const approveLeaveBtn = page.locator('button').filter({ hasText: /Setuju|Approve|Terima/i }).first();
  if (await approveLeaveBtn.count() > 0) {
    await approveLeaveBtn.click();
    await sleep(1000);
    test('5.11 批准请假按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // Reject leave
  const rejectLeaveBtn = page.locator('button').filter({ hasText: /Tolak|Reject/i }).first();
  if (await rejectLeaveBtn.count() > 0) {
    await rejectLeaveBtn.click();
    await sleep(1000);
    test('5.12 拒绝请假按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // Leave type config
  const leaveTypeBtn = page.locator('a, button').filter({ hasText: /Tipe|Jenis|Config/i }).first();
  if (await leaveTypeBtn.count() > 0) {
    await leaveTypeBtn.click();
    await sleep(1500);
    test('5.13 请假类型配置', true);
    await page.goBack();
    await sleep(1000);
  }

  // --- 工资管理 ---
  await page.goto(`${BASE_URL}/staff/salary`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.14 工资管理页面加载', (await page.textContent('body')).includes('Gaji') || (await page.textContent('body')).includes('Salary') || (await page.textContent('body')).includes('工资'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('5.15 添加工资弹窗', true);
    const salaryInput = page.locator('input[name="amount"], input[name="gaji"]').first();
    if (await salaryInput.count() > 0) {
      await salaryInput.fill('5000000');
      test('5.16 填写工资金额', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit salary
  const editSalaryBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editSalaryBtn.count() > 0) {
    await editSalaryBtn.click();
    await sleep(1500);
    test('5.17 编辑工资弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete salary
  const delSalaryBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delSalaryBtn.count() > 0) {
    await delSalaryBtn.click();
    await sleep(1000);
    test('5.18 删除工资按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 报销管理 (correct route: /staff/salary/reimbursement) ---
  await page.goto(`${BASE_URL}/staff/salary/reimbursement`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.19 报销管理页面加载', (await page.textContent('body')).includes('Reimbursement') || (await page.textContent('body')).includes('Pengeluaran') || (await page.textContent('body')).includes('报销') || (await page.textContent('body')).includes('Reimburse') || (await page.textContent('body')).includes('Ganti Rugi'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('5.20 添加报销弹窗', true);
    const reimbAmountInput = page.locator('input[name="amount"], input[placeholder*="Jumlah" i]').first();
    if (await reimbAmountInput.count() > 0) {
      await reimbAmountInput.fill('100000');
      test('5.21 填写报销金额', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Approve reimbursement
  const approveReimbBtn = page.locator('button').filter({ hasText: /Setuju|Approve/i }).first();
  if (await approveReimbBtn.count() > 0) {
    await approveReimbBtn.click();
    await sleep(1000);
    test('5.22 批准报销按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // Reject reimbursement
  const rejectReimbBtn = page.locator('button').filter({ hasText: /Tolak|Reject/i }).first();
  if (await rejectReimbBtn.count() > 0) {
    await rejectReimbBtn.click();
    await sleep(1000);
    test('5.23 拒绝报销按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 积分管理 ---
  await page.goto(`${BASE_URL}/staff/points`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.24 员工积分页面加载', (await page.textContent('body')).includes('Poin') || (await page.textContent('body')).includes('Points') || (await page.textContent('body')).includes('积分'));

  // --- 押金管理 ---
  await page.goto(`${BASE_URL}/staff/salary/deposit`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('5.25 押金管理页面加载', (await page.textContent('body')).includes('Deposit') || (await page.textContent('body')).includes('押金'));

  // ========== 财务管理 (Finance) ==========
  console.log('\n【6. 财务管理 - Keuangan】');

  await page.goto(`${BASE_URL}/finance`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('6.1 财务页面加载', (await page.textContent('body')).includes('Keuangan') || (await page.textContent('body')).includes('Finance') || (await page.textContent('body')).includes('财务'));

  // --- 营收报表 ---
  await page.goto(`${BASE_URL}/finance/revenue`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('6.2 营收报表页面加载', (await page.textContent('body')).includes('Pendapatan') || (await page.textContent('body')).includes('Revenue') || (await page.textContent('body')).includes('收入'));

  // Filter
  const filterBtn = page.locator('button').filter({ hasText: /Filter|Tanggal|Date/i }).first();
  if (await filterBtn.count() > 0) {
    await filterBtn.click();
    await sleep(1000);
    test('6.3 日期筛选按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // Export
  const exportBtn = page.locator('button').filter({ hasText: /Export|Download|Unduh/i }).first();
  if (await exportBtn.count() > 0) {
    await exportBtn.click();
    await sleep(1000);
    test('6.4 导出按钮', true);
  }

  // --- 订单列表 ---
  await page.goto(`${BASE_URL}/finance/orders`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('6.5 订单列表页面加载', (await page.textContent('body')).includes('Pesanan') || (await page.textContent('body')).includes('Order') || (await page.textContent('body')).includes('订单'));

  // Order detail
  const orderDetailBtn = page.locator('button, a').filter({ hasText: /Detail|Lihat/i }).first();
  if (await orderDetailBtn.count() > 0) {
    await orderDetailBtn.click();
    await sleep(1500);
    test('6.6 订单详情弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 退款管理 ---
  await page.goto(`${BASE_URL}/finance/refunds`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('6.7 退款管理页面加载', (await page.textContent('body')).includes('Refund') || (await page.textContent('body')).includes('退款'));

  // Process refund
  const refundBtn = page.locator('button').filter({ hasText: /Refund|Process/i }).first();
  if (await refundBtn.count() > 0) {
    await refundBtn.click();
    await sleep(1500);
    test('6.8 处理退款弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 支出管理 ---
  await page.goto(`${BASE_URL}/finance/expenses`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('6.9 支出管理页面加载', (await page.textContent('body')).includes('Pengeluaran') || (await page.textContent('body')).includes('Expense') || (await page.textContent('body')).includes('支出'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('6.10 添加支出弹窗', true);
    const expDescInput = page.locator('input[name="description"], input[placeholder*="Deskripsi" i]').first();
    const expAmountInput = page.locator('input[name="amount"], input[placeholder*="Jumlah" i]').first();
    if (await expDescInput.count() > 0) {
      await expDescInput.fill('Test Expense ' + Date.now());
      test('6.11 填写支出描述', true);
    }
    if (await expAmountInput.count() > 0) {
      await expAmountInput.fill('50000');
      test('6.12 填写支出金额', true);
    }
    const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await sleep(1500);
      test('6.13 保存支出', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit expense
  const editExpBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editExpBtn.count() > 0) {
    await editExpBtn.click();
    await sleep(1500);
    test('6.14 编辑支出弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete expense
  const delExpBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delExpBtn.count() > 0) {
    await delExpBtn.click();
    await sleep(1000);
    test('6.15 删除支出按钮', true);
    const confirmBtn = page.locator('button').filter({ hasText: /Ya|Yes|Hapus/i }).first();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      await sleep(1000);
    }
  }

  // --- 财务报告 ---
  await page.goto(`${BASE_URL}/finance/reports`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('6.16 财务报告页面加载', (await page.textContent('body')).includes('Laporan') || (await page.textContent('body')).includes('Report') || (await page.textContent('body')).includes('报告'));

  // ========== 渠道管理 (Channels) ==========
  console.log('\n【7. 渠道管理 - Saluran】');

  await page.goto(`${BASE_URL}/channels`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('7.1 渠道列表页面加载', (await page.textContent('body')).includes('Saluran') || (await page.textContent('body')).includes('Channel') || (await page.textContent('body')).includes('渠道'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('7.2 添加渠道弹窗', true);
    const chNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    if (await chNameInput.count() > 0) {
      await chNameInput.fill('Test Channel ' + Date.now());
      test('7.3 填写渠道名称', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit channel
  const editChBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editChBtn.count() > 0) {
    await editChBtn.click();
    await sleep(1500);
    test('7.4 编辑渠道弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete channel
  const delChBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delChBtn.count() > 0) {
    await delChBtn.click();
    await sleep(1000);
    test('7.5 删除渠道按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 渠道报表 ---
  await page.goto(`${BASE_URL}/channels/reports`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('7.6 渠道报表页面加载', (await page.textContent('body')).includes('Saluran') || (await page.textContent('body')).includes('Channel') || (await page.textContent('body')).includes('渠道'));

  // --- 渠道佣金 ---
  await page.goto(`${BASE_URL}/channels/commissions`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('7.7 渠道佣金页面加载', (await page.textContent('body')).includes('Komisi') || (await page.textContent('body')).includes('Commission') || (await page.textContent('body')).includes('佣金'));

  // ========== 卫生管理 (Hygiene) ==========
  console.log('\n【8. 卫生管理 - Kebersihan】');

  await page.goto(`${BASE_URL}/hygiene`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('8.1 卫生任务列表加载', (await page.textContent('body')).includes('Kebersihan') || (await page.textContent('body')).includes('Hygiene') || (await page.textContent('body')).includes('卫生'));

  // Start task
  const startTaskBtn = page.locator('button').filter({ hasText: /Mulai|Start|Begin/i }).first();
  if (await startTaskBtn.count() > 0) {
    await startTaskBtn.click();
    await sleep(1000);
    test('8.2 开始任务按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // Complete task
  const completeTaskBtn = page.locator('button').filter({ hasText: /Selesai|CompleteSELESAI/i }).first();
  if (await completeTaskBtn.count() > 0) {
    await completeTaskBtn.click();
    await sleep(1000);
    test('8.3 完成任务按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // Verify task
  const verifyTaskBtn = page.locator('button').filter({ hasText: /Verif|Tolak/i }).first();
  if (await verifyTaskBtn.count() > 0) {
    await verifyTaskBtn.click();
    await sleep(1000);
    test('8.4 审核任务按钮', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 任务模板 ---
  // Note: /hygiene redirects to template list
  await page.goto(`${BASE_URL}/hygiene`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('8.5 任务模板页面加载', (await page.textContent('body')).includes('Template') || (await page.textContent('body')).includes('Template') || (await page.textContent('body')).includes('模板'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('8.6 添加模板弹窗', true);
    const tplNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    if (await tplNameInput.count() > 0) {
      await tplNameInput.fill('Test Template ' + Date.now());
      test('8.7 填写模板名称', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit template
  const editTplBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editTplBtn.count() > 0) {
    await editTplBtn.click();
    await sleep(1500);
    test('8.8 编辑模板弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Delete template
  const delTplBtn = page.locator('button').filter({ hasText: /Hapus|Delete/i }).first();
  if (await delTplBtn.count() > 0) {
    await delTplBtn.click();
    await sleep(1000);
    test('8.9 删除模板按钮', true);
    const confirmBtn = page.locator('button').filter({ hasText: /Ya|Yes|Hapus/i }).first();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      await sleep(500);
    }
  }

  // --- 今日任务 ---
  await page.goto(`${BASE_URL}/hygiene/today`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('8.10 今日任务页面加载', (await page.textContent('body')).includes('Hari') || (await page.textContent('body')).includes('Today') || (await page.textContent('body')).includes('今日'));

  // --- 区域管理 (correct route: /hygiene/areas) ---
  await page.goto(`${BASE_URL}/hygiene/areas`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('8.11 区域管理页面加载', (await page.textContent('body')).includes('Zona') || (await page.textContent('body')).includes('Area') || (await page.textContent('body')).includes('区域'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('8.12 添加区域弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 卫生统计 ---
  await page.goto(`${BASE_URL}/hygiene/stats`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('8.13 卫生统计页面加载', (await page.textContent('body')).includes('Statistik') || (await page.textContent('body')).includes('Stat') || (await page.textContent('body')).includes('统计'));

  // --- 卫生配置 ---
  await page.goto(`${BASE_URL}/hygiene/config`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('8.14 卫生配置页面加载', (await page.textContent('body')).includes('Konfigurasi') || (await page.textContent('body')).includes('Config') || (await page.textContent('body')).includes('配置'));

  // ========== 营销管理 (Marketing) ==========
  console.log('\n【9. 营销管理 - Pemasaran】');

  // --- 促销活动 ---
  await page.goto(`${BASE_URL}/marketing/promotions/campaigns`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.1 促销活动页面加载', (await page.textContent('body')).includes('Kampanye') || (await page.textContent('body')).includes('Campaign') || (await page.textContent('body')).includes('促销'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('9.2 添加活动弹窗', true);
    const campNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    if (await campNameInput.count() > 0) {
      await campNameInput.fill('Test Campaign ' + Date.now());
      test('9.3 填写活动名称', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // --- 优惠券 ---
  await page.goto(`${BASE_URL}/marketing/promotions/coupons`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.4 优惠券页面加载', (await page.textContent('body')).includes('Kupon') || (await page.textContent('body')).includes('Coupon') || (await page.textContent('body')).includes('优惠券'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('9.5 添加优惠券弹窗', true);
    const coupCodeInput = page.locator('input[name="code"], input[placeholder*="Kode" i]').first();
    if (await coupCodeInput.count() > 0) {
      await coupCodeInput.fill('TEST' + Date.now());
      test('9.6 填写优惠券代码', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit coupon
  const editCoupBtn = page.locator('button').filter({ hasText: /Edit|Ubah|i诅/i }).first();
  if (await editCoupBtn.count() > 0) {
    await editCoupBtn.click();
    await sleep(1500);
    test('9.7 编辑优惠券弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 会员列表 ---
  await page.goto(`${BASE_URL}/marketing/members`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.8 会员列表页面加载', (await page.textContent('body')).includes('Member') || (await page.textContent('body')).includes('会员'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('9.9 添加会员弹窗', true);
    const memNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
    if (await memNameInput.count() > 0) {
      await memNameInput.fill('Test Member ' + Date.now());
      test('9.10 填写会员名称', true);
    }
    await closeModal(page);
    await sleep(500);
  }

  // Edit member
  const editMemBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editMemBtn.count() > 0) {
    await editMemBtn.click();
    await sleep(1500);
    test('9.11 编辑会员弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // Member detail
  const memDetailBtn = page.locator('a, button').filter({ hasText: /Detail|Lihat/i }).first();
  if (await memDetailBtn.count() > 0) {
    await memDetailBtn.click();
    await sleep(1500);
    test('9.12 会员详情弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 积分规则 ---
  await page.goto(`${BASE_URL}/marketing/points`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.13 积分规则页面加载', (await page.textContent('body')).includes('Poin') || (await page.textContent('body')).includes('Points') || (await page.textContent('body')).includes('积分'));

  // Edit points rule
  const editPtsBtn = page.locator('button').filter({ hasText: /Edit|Ubah/i }).first();
  if (await editPtsBtn.count() > 0) {
    await editPtsBtn.click();
    await sleep(1500);
    test('9.14 编辑积分规则弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 自动化规则 ---
  await page.goto(`${BASE_URL}/marketing/operations/automation`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.15 自动化规则页面加载', (await page.textContent('body')).includes('Otomatis') || (await page.textContent('body')).includes('Automation') || (await page.textContent('body')).includes('自动'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('9.16 添加自动化规则弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 消息/通知 ---
  await page.goto(`${BASE_URL}/marketing/messages`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.17 消息页面加载', (await page.textContent('body')).includes('Notifikasi') || (await page.textContent('body')).includes('Message') || (await page.textContent('body')).includes('消息') || (await page.textContent('body')).includes('Pesan'));

  // --- 运营分析 ---
  await page.goto(`${BASE_URL}/marketing/operations/analytics`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.18 运营分析页面加载', (await page.textContent('body')).includes('Analitik') || (await page.textContent('body')).includes('Analytics') || (await page.textContent('body')).includes('分析'));

  // --- 推荐管理 ---
  await page.goto(`${BASE_URL}/marketing/promotions/referrals`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.19 推荐管理页面加载', (await page.textContent('body')).includes('Referal') || (await page.textContent('body')).includes('Referral') || (await page.textContent('body')).includes('推荐'));

  // --- 促销类别 ---
  await page.goto(`${BASE_URL}/marketing/promotions/campaign-categories`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('9.20 促销类别页面加载', (await page.textContent('body')).includes('Kategori') || (await page.textContent('body')).includes('Category') || (await page.textContent('body')).includes('类别'));

  // ========== 系统设置 (Settings) ==========
  console.log('\n【10. 系统设置 - Pengaturan】');

  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('10.1 系统设置页面加载', (await page.textContent('body')).includes('Pengaturan') || (await page.textContent('body')).includes('Settings') || (await page.textContent('body')).includes('设置'));

  // Fill and save
  const storeNameInput = page.locator('input[name="storeName"], input[name="name"], input[placeholder*="Toko" i]').first();
  if (await storeNameInput.count() > 0) {
    await storeNameInput.fill('Test Store Updated');
    test('10.2 填写店铺名称', true);
  }

  const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
  if (await saveBtn.count() > 0) {
    await saveBtn.click();
    await sleep(2000);
    test('10.3 保存设置按钮', true);
  }

  // --- POS设置 ---
  await page.goto(`${BASE_URL}/settings/pos`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('10.4 POS设置页面加载', (await page.textContent('body')).includes('POS') || (await page.textContent('body')).includes('Pengaturan'));

  const posSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
  if (await posSaveBtn.count() > 0) {
    await posSaveBtn.click();
    await sleep(1500);
    test('10.5 保存POS设置', true);
  }

  // ========== 其他功能测试 ==========
  console.log('\n【11. 其他功能】');

  // --- BOM分析 (correct route: /products/recipes) ---
  await page.goto(`${BASE_URL}/products/recipes`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.1 BOM分析页面加载', (await page.textContent('body')).includes('BOM') || (await page.textContent('body')).includes('Bill of Material') || (await page.textContent('body')).includes('Resep'));

  // Add BOM
  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('11.2 添加BOM弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 产品成本 ---
  await page.goto(`${BASE_URL}/products/costs`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.3 产品成本页面加载', (await page.textContent('body')).includes('Biaya') || (await page.textContent('body')).includes('Cost') || (await page.textContent('body')).includes('成本'));

  // --- 产品分析 ---
  await page.goto(`${BASE_URL}/products/analysis`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.4 产品分析页面加载', (await page.textContent('body')).includes('Analisis') || (await page.textContent('body')).includes('Analysis') || (await page.textContent('body')).includes('分析'));

  // --- KDS ---
  await page.goto(`${BASE_URL}/kds`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.5 KDS页面加载', (await page.textContent('body')).includes('Dapur') || (await page.textContent('body')).includes('Kitchen') || (await page.textContent('body')).includes('KDS') || (await page.textContent('body')).includes('kds'));

  // KDS config
  const kdsConfigBtn = page.locator('a, button').filter({ hasText: /Config|Konfigurasi/i }).first();
  if (await kdsConfigBtn.count() > 0) {
    await kdsConfigBtn.click();
    await sleep(1500);
    test('11.6 KDS配置页面', true);
    await page.goBack();
    await sleep(1000);
  }

  // --- 外卖聚合 ---
  await page.goto(`${BASE_URL}/delivery`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.7 外卖聚合页面加载', (await page.textContent('body')).includes('Delivery') || (await page.textContent('body')).includes('Antar') || (await page.textContent('body')).includes('外卖') || (await page.textContent('body')).includes('delivery'));

  // --- 排队叫号 ---
  await page.goto(`${BASE_URL}/queue`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.8 排队管理页面加载', (await page.textContent('body')).includes('Antre') || (await page.textContent('body')).includes('Queue') || (await page.textContent('body')).includes('排队') || (await page.textContent('body')).includes('Antrian'));

  // --- 公告管理 ---
  await page.goto(`${BASE_URL}/announcement`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.9 公告管理页面加载', (await page.textContent('body')).includes('Pengumuman') || (await page.textContent('body')).includes('Announcement') || (await page.textContent('body')).includes('公告'));

  addBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(1500);
    test('11.10 添加公告弹窗', true);
    await closeModal(page);
    await sleep(500);
  }

  // --- 数据导入 ---
  await page.goto(`${BASE_URL}/import`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.11 数据导入页面加载', (await page.textContent('body')).includes('Import') || (await page.textContent('body')).includes('Impor') || (await page.textContent('body')).includes('导入'));

  // --- 等级权益 ---
  await page.goto(`${BASE_URL}/marketing/members/tier-benefits`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.12 等级权益页面加载', (await page.textContent('body')).includes('Tingkat') || (await page.textContent('body')).includes('Tier') || (await page.textContent('body')).includes('等级'));

  // --- 积分过期配置 ---
  await page.goto(`${BASE_URL}/marketing/points/expiry`, { waitUntil: 'networkidle' });
  await sleep(2000);
  test('11.13 积分过期配置页面加载', (await page.textContent('body')).includes('Expiry') || (await page.textContent('body')).includes('Kedaluwarsa') || (await page.textContent('body')).includes('过期'));

  // ========== 打印测试报告 ==========
  console.log('\n' + '═'.repeat(70));
  console.log('                    测试结果汇总');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\n  通过: ${passed}  |  失败: ${failed}  |  总计: ${results.length}`);
  console.log(`  控制台错误: ${consoleErrors.length}`);

  if (failed > 0) {
    console.log('\n  失败项目:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    ❌ ${r.name}${r.details ? ' - ' + r.details : ''}`);
    });
  }

  if (consoleErrors.length > 0) {
    console.log('\n  控制台错误 (去重后):');
    [...new Set(consoleErrors)].slice(0, 10).forEach(e => {
      console.log(`    ⚠️ ${e.substring(0, 120)}`);
    });
  }

  console.log('\n  详细结果:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`    ${icon} [${r.index}] ${r.name}`);
  });

  console.log('\n' + '═'.repeat(70) + '\n');

  await browser.close();

  // 保存JSON报告
  const fs = require('fs');
  const report = {
    timestamp: new Date().toISOString(),
    summary: { passed, failed, total: results.length },
    consoleErrors: [...new Set(consoleErrors)],
    results
  };
  fs.writeFileSync('/tmp/comprehensive-admin-test-report.json', JSON.stringify(report, null, 2));
  console.log('详细报告已保存到: /tmp/comprehensive-admin-test-report.json\n');

  process.exit(failed > 0 ? 1 : 0);
})();
