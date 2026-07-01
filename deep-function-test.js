/**
 * 深度功能测试 - 验证每个模块的实际操作功能
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDeepTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  let passed = 0;
  let total = 0;
  let issues = [];

  function log(name, status, detail = '') {
    total++;
    const icon = status ? '✅' : '❌';
    console.log(`${icon} ${name}${detail ? ': ' + detail : ''}`);
    if (!status) {
      issues.push({ name, detail });
    } else {
      passed++;
    }
    return status;
  }

  // 登录
  console.log('========== 登录 ==========');
  await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  log('Admin 登录', !page.url().includes('login'), page.url());

  // ========== 1. 产品管理 - 创建产品 ==========
  console.log('\n========== 1. 产品管理测试 ==========');
  await page.goto(ADMIN_URL + '/products', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  // 检查产品列表是否有数据
  const productTable = await page.locator('table, [class*="table"]').count();
  log('产品列表有表格', productTable > 0, `找到 ${productTable} 个表格`);

  // 点击添加产品
  const addBtn = page.locator('button').filter({ hasText: /Tambah|添加/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(2000);

    // 检查表单字段
    const nameInput = page.locator('input').filter({ has: page.locator('text=/名称|Name|Nama/i') }).count();
    const categorySelect = page.locator('select, [class*="select"]').count();
    log('添加产品表单有字段', nameInput > 0 || categorySelect > 0, `找到输入框/选择器`);

    // 填写表单
    const inputs = await page.locator('input[type="text"], input[type="number"]').all();
    if (inputs.length > 0) {
      await inputs[0].fill('测试产品-' + Date.now());
      log('产品名称可输入', true);
    }

    // 按ESC关闭
    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // ========== 2. 订单管理 ==========
  console.log('\n========== 2. 订单管理测试 ==========');
  await page.goto(ADMIN_URL + '/finance/orders', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const orderList = await page.locator('table, [class*="table"]').count();
  log('订单列表有表格', orderList > 0);

  // 检查筛选功能
  const filterInputs = await page.locator('input[placeholder*="Search"], input[placeholder*="Filter"]').count();
  log('订单有搜索/筛选', filterInputs > 0, `找到 ${filterInputs} 个筛选框`);

  // 检查状态筛选
  const statusFilter = await page.locator('select, [class*="select"]').count();
  log('订单有状态下拉', statusFilter > 0, `找到 ${statusFilter} 个下拉框`);

  // ========== 3. 库存管理 ==========
  console.log('\n========== 3. 库存管理测试 ==========');
  await page.goto(ADMIN_URL + '/inventory', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const invTable = await page.locator('table, [class*="table"]').count();
  log('库存列表有表格', invTable > 0);

  // 检查库存数据
  const invText = await page.textContent('body');
  const hasStock = invText.includes('Stok') || invText.includes('库存') || invText.includes('Stock');
  log('库存页面显示库存数据', hasStock);

  // ========== 4. 员工管理 ==========
  console.log('\n========== 4. 员工管理测试 ==========');
  await page.goto(ADMIN_URL + '/staff', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const staffTable = await page.locator('table, [class*="table"]').count();
  log('员工列表有表格', staffTable > 0);

  const staffText = await page.textContent('body');
  const hasStaffName = staffText.includes('Administrator') || staffText.includes('管理员') || staffText.includes('店长');
  log('员工列表有员工数据', hasStaffName);

  // 点击添加员工按钮
  const addStaffBtn = page.locator('button').filter({ hasText: /Tambah|添加|New/i }).first();
  if (await addStaffBtn.count() > 0) {
    await addStaffBtn.click();
    await sleep(2000);

    // 检查表单
    const staffForm = await page.locator('form, [class*="form"]').count();
    log('员工表单出现', staffForm > 0);

    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // ========== 5. 会员管理 ==========
  console.log('\n========== 5. 会员管理测试 ==========');
  await page.goto(ADMIN_URL + '/marketing/members', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const memberTable = await page.locator('table, [class*="table"]').count();
  log('会员列表有表格', memberTable > 0);

  // ========== 6. 卫生管理 ==========
  console.log('\n========== 6. 卫生管理测试 ==========');
  await page.goto(ADMIN_URL + '/hygiene', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const hygieneText = await page.textContent('body');
  const hasHygiene = hygieneText.includes('Kebersihan') || hygieneText.includes('卫生');
  log('卫生页面加载', hasHygiene);

  // 点击今日任务
  await page.goto(ADMIN_URL + '/hygiene/today', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const todayText = await page.textContent('body');
  const hasTasks = todayText.includes('任务') || todayText.includes('Task') || todayText.includes('Tugas');
  log('今日任务页面加载', hasTasks);

  // ========== 7. 营销管理 ==========
  console.log('\n========== 7. 营销管理测试 ==========');
  await page.goto(ADMIN_URL + '/marketing/promotions/campaigns', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const campaignText = await page.textContent('body');
  const hasCampaign = campaignText.includes('Campaign') || campaignText.includes('活动') || campaignText.includes('Promosi');
  log('营销活动页面加载', hasCampaign);

  // 检查优惠券
  await page.goto(ADMIN_URL + '/marketing/promotions/coupons', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const couponText = await page.textContent('body');
  const hasCoupon = couponText.includes('Coupon') || couponText.includes('优惠券') || couponText.includes('Kupon');
  log('优惠券页面加载', hasCoupon);

  // ========== 8. 营收报表 ==========
  console.log('\n========== 8. 营收报表测试 ==========');
  await page.goto(ADMIN_URL + '/finance/revenue', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const revenueText = await page.textContent('body');
  const hasRevenue = revenueText.includes('Revenue') || revenueText.includes('营收') || revenueText.includes('Pendapatan');
  log('营收报表加载', hasRevenue);

  // 检查日期选择器
  const datePicker = await page.locator('input[type="date"], [class*="date"]').count();
  log('营收报表有日期选择', datePicker > 0, `找到 ${datePicker} 个日期选择器`);

  // ========== 9. 费用管理 ==========
  console.log('\n========== 9. 费用管理测试 ==========');
  await page.goto(ADMIN_URL + '/finance/expenses', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const expenseText = await page.textContent('body');
  const hasExpense = expenseText.includes('Expense') || expenseText.includes('费用') || expenseText.includes('Pengeluaran');
  log('费用管理加载', hasExpense);

  // ========== 10. 财务报表 ==========
  console.log('\n========== 10. 财务报表测试 ==========');
  await page.goto(ADMIN_URL + '/finance/reports', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const reportText = await page.textContent('body');
  const hasReport = reportText.includes('Report') || reportText.includes('报表') || reportText.includes('Laporan');
  log('财务报表加载', hasReport);

  // ========== 11. 税务管理 ==========
  console.log('\n========== 11. 税务管理测试 ==========');
  await page.goto(ADMIN_URL + '/finance/tax', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const taxText = await page.textContent('body');
  const hasTax = taxText.includes('Tax') || taxText.includes('税务') || taxText.includes('Pajak');
  log('税务管理加载', hasTax);

  // ========== 12. 公告管理 ==========
  console.log('\n========== 12. 公告管理测试 ==========');
  await page.goto(ADMIN_URL + '/announcement', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const announcementText = await page.textContent('body');
  const hasAnnouncement = announcementText.includes('Announcement') || announcementText.includes('公告') || announcementText.includes('Pengumuman');
  log('公告管理加载', hasAnnouncement);

  // 点击新建公告
  const newAnnBtn = page.locator('button').filter({ hasText: /Baru|新建|New/i }).first();
  if (await newAnnBtn.count() > 0) {
    await newAnnBtn.click();
    await sleep(2000);

    const formFields = await page.locator('input, textarea').count();
    log('公告表单有输入字段', formFields > 0, `找到 ${formFields} 个输入字段`);

    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // ========== 13. 系统设置 ==========
  console.log('\n========== 13. 系统设置测试 ==========');
  await page.goto(ADMIN_URL + '/settings', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const settingsText = await page.textContent('body');
  const hasSettings = settingsText.includes('Settings') || settingsText.includes('设置') || settingsText.includes('Pengaturan');
  log('系统设置加载', hasSettings);

  // ========== 14. POS设置 ==========
  console.log('\n========== 14. POS设置测试 ==========');
  await page.goto(ADMIN_URL + '/settings/pos', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const posSettingsText = await page.textContent('body');
  const hasPosSettings = posSettingsText.includes('POS') || posSettingsText.includes('设置') || posPosSettingsText.includes('Terminal');
  log('POS设置加载', hasPosSettings);

  // ========== 15. 考勤管理 ==========
  console.log('\n========== 15. 考勤管理测试 ==========');
  await page.goto(ADMIN_URL + '/staff/attendance', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const attendanceText = await page.textContent('body');
  const hasAttendance = attendanceText.includes('Absensi') || attendanceText.includes('考勤') || attendanceText.includes('Attendance');
  log('考勤管理加载', hasAttendance);

  // ========== 总结 ==========
  console.log('\n========== 深度功能测试总结 ==========');
  console.log(`总测试数: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${total - passed}`);
  console.log(`通过率: ${Math.round(passed / total * 100)}%`);

  if (issues.length > 0) {
    console.log('\n❌ 发现的问题:');
    issues.forEach(i => console.log(`   - ${i.name}: ${i.detail}`));
  }

  console.log('\n========== 测试完成 ==========\n');

  await browser.close();
  return { total, passed, issues };
}

runDeepTests().catch(console.error);
