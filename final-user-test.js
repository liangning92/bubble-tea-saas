/**
 * 最终用户操作测试 - 使用正确的路由路径
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';
const POS_URL = 'http://localhost:6065';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFinalTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  let passed = 0;
  let total = 0;
  let results = [];

  function log(name, status, detail = '') {
    total++;
    const icon = status ? '✅' : '❌';
    console.log(`${icon} ${name}${detail ? ': ' + detail : ''}`);
    results.push({ name, status, detail });
    if (status) passed++;
    return status;
  }

  try {
    // ========== Admin 登录 ==========
    console.log('\n========== 1. Admin 登录 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);
    await page.locator('input[type="tel"]').fill('081234567890');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    log('Admin 登录成功', !page.url().includes('login'), page.url());

    // ========== 各模块测试（使用正确路由） ==========
    console.log('\n========== 2. 各模块页面测试 ==========');

    const modules = [
      // [name, path, expectedContent]
      { name: 'Dashboard', path: '/dashboard', keywords: ['今日', 'Today', 'Dashboard'] },
      { name: '产品列表', path: '/products', keywords: ['产品', 'Product', 'Kategori'] },
      { name: '渠道管理', path: '/channels', keywords: ['渠道', 'Channel', 'Saluran'] },
      { name: '库存管理', path: '/inventory', keywords: ['库存', 'Inventory', 'Stok'] },
      { name: '员工管理', path: '/staff', keywords: ['员工', 'Staff', 'Karyawan'] },
      { name: '员工考勤', path: '/staff/attendance', keywords: ['考勤', 'Attendance', 'Kehadiran'] },
      { name: '员工排班', path: '/staff/schedule', keywords: ['排班', 'Schedule', 'Jadwal'] },
      { name: '员工薪资', path: '/staff/salary', keywords: ['薪资', 'Salary', 'Gaji'] },
      { name: '卫生管理', path: '/hygiene', keywords: ['卫生', 'Hygiene', 'Kebersihan'] },
      { name: '卫生任务', path: '/hygiene/today', keywords: ['任务', 'Task', 'Tugas'] },
      { name: '营销中心', path: '/marketing', keywords: ['营销', 'Marketing', 'Pemasaran'] },
      { name: '营销活动', path: '/marketing/promotions/campaigns', keywords: ['活动', 'Campaign', 'Promosi'] },
      { name: '优惠券', path: '/marketing/promotions/coupons', keywords: ['优惠券', 'Coupon', 'Kupon'] },
      { name: '会员列表', path: '/marketing/members', keywords: ['会员', 'Member', 'Pelanggan'] },
      { name: '消息中心', path: '/marketing/messages', keywords: ['消息', 'Message', 'Pesan'] },
      { name: '自动化运营', path: '/marketing/operations', keywords: ['运营', 'Operations', 'Otomatis'] },
    ];

    for (const mod of modules) {
      await page.goto(ADMIN_URL + mod.path, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2000);
      const text = await page.textContent('body');
      const hasContent = text.length > 100;
      const hasKeyword = mod.keywords.some(k => text.includes(k));
      log(`${mod.name}`, hasContent && hasKeyword, `长度: ${text.length}`);
    }

    // ========== 财务模块测试（关键路由） ==========
    console.log('\n========== 3. 财务模块测试 ==========');

    const financeModules = [
      { name: '营收报表', path: '/finance/revenue', keywords: ['营收', 'Revenue', 'Pendapatan'] },
      { name: '订单列表', path: '/finance/orders', keywords: ['订单', 'Order', 'Pesanan'] },
      { name: '退款管理', path: '/finance/refunds', keywords: ['退款', 'Refund', 'Pengembalian'] },
      { name: '费用管理', path: '/finance/expenses', keywords: ['费用', 'Expense', 'Pengeluaran'] },
      { name: '财务报表', path: '/finance/reports', keywords: ['报表', 'Report', 'Laporan'] },
      { name: '税务管理', path: '/finance/tax', keywords: ['税务', 'Tax', 'Pajak'] },
      { name: '固定资产', path: '/finance/fixed-assets', keywords: ['资产', 'Asset', 'Aset'] },
    ];

    for (const mod of financeModules) {
      await page.goto(ADMIN_URL + mod.path, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2000);
      const text = await page.textContent('body');
      const hasContent = text.length > 100;
      const hasKeyword = mod.keywords.some(k => text.includes(k));
      log(`${mod.name}`, hasContent && hasKeyword, `长度: ${text.length}`);
    }

    // ========== 设置页面测试 ==========
    console.log('\n========== 4. 设置页面测试 ==========');
    await page.goto(ADMIN_URL + '/settings', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    let settingsText = await page.textContent('body');
    log('系统设置', settingsText.length > 100, `长度: ${settingsText.length}`);

    await page.goto(ADMIN_URL + '/settings/pos', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    let posSettingsText = await page.textContent('body');
    log('POS设置', posSettingsText.length > 100, `长度: ${posSettingsText.length}`);

    // ========== 公告管理测试 ==========
    console.log('\n========== 5. 公告管理测试 ==========');
    await page.goto(ADMIN_URL + '/announcement', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    let announcementText = await page.textContent('body');
    log('公告列表', announcementText.length > 100, `长度: ${announcementText.length}`);

    // ========== POS 收银端测试 ==========
    console.log('\n========== 6. POS 收银端测试 ==========');
    await page.goto(POS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // POS 登录
    const posPhoneInput = page.locator('input[type="tel"]');
    if (await posPhoneInput.count() > 0) {
      await posPhoneInput.fill('081234567892');
      await page.locator('input[type="password"]').fill('admin123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
      log('POS 登录', !page.url().includes('login'), page.url());

      // POS 主界面
      const posText = await page.textContent('body');
      log('POS 主界面', posText.length > 200, `长度: ${posText.length}`);
    }

    // ========== Cashier 权限测试 ==========
    console.log('\n========== 7. Cashier 权限测试 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);
    await page.locator('input[type="tel"]').fill('081234567892');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    log('Cashier 登录', !page.url().includes('login'));

    // Cashier 访问财务（应无权限）
    await page.goto(ADMIN_URL + '/finance/revenue', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    const cashierFinance = await page.textContent('body');
    log('Cashier 财务访问受限', cashierFinance.length < 500 || cashierFinance.includes('403'), `长度: ${cashierFinance.length}`);

    // Cashier 访问 POS 订单（应可访问）
    await page.goto(POS_URL + '/orders', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    const cashierOrder = await page.textContent('body');
    log('Cashier 访问订单', cashierOrder.length > 50, `长度: ${cashierOrder.length}`);

    // ========== Manager 权限测试 ==========
    console.log('\n========== 8. Manager 权限测试 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);
    await page.locator('input[type="tel"]').fill('081234567891');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    log('Manager 登录', !page.url().includes('login'));

    // Manager 访问财务（应可访问）
    await page.goto(ADMIN_URL + '/finance/revenue', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    const managerFinance = await page.textContent('body');
    log('Manager 财务访问', managerFinance.length > 100, `长度: ${managerFinance.length}`);

  } catch (e) {
    console.log('\n❌ 测试出错:', e.message);
  } finally {
    await browser.close();
  }

  // ========== 总结 ==========
  console.log('\n========== 最终测试总结 ==========');
  console.log(`总测试数: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${total - passed}`);
  console.log(`通过率: ${total > 0 ? Math.round(passed / total * 100) : 0}%`);

  const failedTests = results.filter(r => !r.status);
  if (failedTests.length > 0) {
    console.log('\n❌ 失败的测试:');
    failedTests.forEach(r => console.log(`   - ${r.name}: ${r.detail}`));
  }

  console.log('\n========== 测试完成 ==========\n');
}

runFinalTests().catch(console.error);
