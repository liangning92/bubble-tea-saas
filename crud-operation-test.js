/**
 * CRUD实际操作测试 - 验证数据回流
 */

const { chromium } = require('playwright');

const API_BASE = 'http://localhost:7072/api';
const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest(method, path, body = null, token = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (body) options.body = JSON.stringify(body);

  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  } catch (error) {
    return { status: 0, ok: false, error: error.message };
  }
}

async function runCRUDTests() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let passed = 0;
  let total = 0;
  let issues = [];

  function log(name, status, detail = '') {
    total++;
    const icon = status ? '✅' : '❌';
    console.log(`${icon} ${name}${detail ? ': ' + detail : ''}`);
    if (!status) issues.push({ name, detail });
    else passed++;
    return status;
  }

  // ========== 1. 登录获取token ==========
  console.log('\n========== 1. 登录获取凭证 ==========');
  const loginRes = await apiRequest('POST', '/auth/login', { phone: '081234567890', password: 'admin123' });
  const adminToken = loginRes.data?.data?.token;
  log('Admin登录API', loginRes.ok && !!adminToken, `Token: ${adminToken ? '获取成功' : '获取失败'}`);

  // ========== 2. 产品CRUD测试 ==========
  console.log('\n========== 2. 产品CRUD测试 ==========');

  // 列出产品
  const listProducts = await apiRequest('GET', '/products', null, adminToken);
  log('产品-列表查询', listProducts.status === 200, `返回 ${listProducts.data?.data?.list?.length || 0} 个产品`);

  // 创建产品
  const createProduct = await apiRequest('POST', '/products', {
    storeId: 'cmq3cn8py0002ylapuoj05pw9',
    name: 'API测试产品-' + Date.now(),
    categoryId: listProducts.data?.data?.list?.[0]?.categoryId || '',
    specs: [{ name: '中杯', price: 15000 }]
  }, adminToken);
  log('产品-创建', createProduct.status === 201, `Status: ${createProduct.status}`);
  const createdProductId = createProduct.data?.data?.id;

  // 更新产品（如果创建成功）
  if (createdProductId) {
    const updateProduct = await apiRequest('PUT', `/products/${createdProductId}`, {
      name: 'API测试产品-已更新'
    }, adminToken);
    log('产品-更新', updateProduct.status === 200, `Status: ${updateProduct.status}`);
  }

  // ========== 3. 库存CRUD测试 ==========
  console.log('\n========== 3. 库存CRUD测试 ==========');

  const listInventory = await apiRequest('GET', '/inventory', null, adminToken);
  log('库存-列表查询', listInventory.status === 200, `返回 ${listInventory.data?.data?.length || 0} 个库存项`);

  // ========== 4. 员工CRUD测试 ==========
  console.log('\n========== 4. 员工CRUD测试 ==========');

  const listStaff = await apiRequest('GET', '/staff', null, adminToken);
  log('员工-列表查询', listStaff.status === 200, `返回 ${listStaff.data?.data?.length || 0} 个员工`);

  // ========== 5. 会员CRUD测试 ==========
  console.log('\n========== 5. 会员CRUD测试 ==========');

  const listMembers = await apiRequest('GET', '/members', null, adminToken);
  log('会员-列表查询', listMembers.status === 200, `返回 ${listMembers.data?.data?.list?.length || 0} 个会员`);

  // 创建会员
  const testPhone = '1' + Date.now().toString().slice(-10);
  const createMember = await apiRequest('POST', '/members', {
    storeId: 'cmq3cn8py0002ylapuoj05pw9',
    name: 'API测试会员',
    phone: testPhone
  }, adminToken);
  log('会员-创建', createMember.status === 201, `Status: ${createMember.status}`);
  const createdMemberId = createMember.data?.data?.id;

  // 验证会员创建成功
  if (createdMemberId) {
    const getMember = await apiRequest('GET', `/members/${createdMemberId}`, null, adminToken);
    log('会员-查询单个', getMember.status === 200, `名称: ${getMember.data?.data?.name || 'N/A'}`);
  }

  // ========== 6. 公告CRUD测试 ==========
  console.log('\n========== 6. 公告CRUD测试 ==========');

  // 创建公告
  const createAnnouncement = await apiRequest('POST', '/announcement', {
    storeId: 'cmq3cn8py0002ylapuoj05pw9',
    title: 'API测试公告-' + Date.now(),
    content: '这是API创建的测试公告'
  }, adminToken);
  log('公告-创建', createAnnouncement.status === 200, `Status: ${createAnnouncement.status}`);
  const createdAnnouncementId = createAnnouncement.data?.data?.id;

  // 列出公告
  const listAnnouncements = await apiRequest('GET', '/announcement', null, adminToken);
  log('公告-列表查询', listAnnouncements.status === 200, `返回 ${listAnnouncements.data?.data?.length || 0} 个公告`);

  // ========== 7. 渠道CRUD测试 ==========
  console.log('\n========== 7. 渠道CRUD测试 ==========');

  const listChannels = await apiRequest('GET', '/channels', null, adminToken);
  log('渠道-列表查询', listChannels.status === 200, `返回 ${listChannels.data?.data?.length || 0} 个渠道`);

  // ========== 8. 费用CRUD测试 ==========
  console.log('\n========== 8. 费用CRUD测试 ==========');

  const listExpenses = await apiRequest('GET', '/expenses', null, adminToken);
  log('费用-列表查询', listExpenses.status === 200, `Status: ${listExpenses.status}`);

  // ========== 9. 订单CRUD测试 ==========
  console.log('\n========== 9. 订单CRUD测试 ==========');

  const listOrders = await apiRequest('GET', '/orders', null, adminToken);
  log('订单-列表查询', listOrders.status === 200, `返回 ${listOrders.data?.data?.list?.length || 0} 个订单`);

  // ========== 10. 卫生任务测试 ==========
  console.log('\n========== 10. 卫生任务测试 ==========');

  const today = new Date().toISOString().split('T')[0];
  const listTasks = await apiRequest('GET', `/hygiene/tasks?date=${today}`, null, adminToken);
  log('卫生任务-列表查询', listTasks.status === 200, `返回 ${listTasks.data?.data?.list?.length || 0} 个任务`);

  // ========== 11. 报表数据测试 ==========
  console.log('\n========== 11. 报表数据测试 ==========');

  const revenueReport = await apiRequest('GET', '/reports/revenue', null, adminToken);
  log('营收报表-查询', revenueReport.status === 200, `有数据: ${!!revenueReport.data?.data?.summary}`);

  const dailyReport = await apiRequest('GET', '/reports/daily', null, adminToken);
  log('日报表-查询', dailyReport.status === 200, `有数据: ${!!dailyReport.data?.data}`);

  const dashboardReport = await apiRequest('GET', '/reports/dashboard', null, adminToken);
  log('仪表盘报表-查询', dashboardReport.status === 200, `有数据: ${!!dashboardReport.data?.data}`);

  // ========== 12. 营销测试 ==========
  console.log('\n========== 12. 营销功能测试 ==========');

  const listCampaigns = await apiRequest('GET', '/marketing/campaigns', null, adminToken);
  log('营销活动-列表', listCampaigns.status === 200, `返回 ${listCampaigns.data?.data?.length || 0} 个活动`);

  const listCoupons = await apiRequest('GET', '/marketing/coupons', null, adminToken);
  log('优惠券-列表', listCoupons.status === 200, `返回 ${listCoupons.data?.data?.length || 0} 个优惠券`);

  // ========== 13. 浏览器端操作测试 ==========
  console.log('\n========== 13. 浏览器端操作测试 ==========');

  await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  log('浏览器-Admin登录成功', !page.url().includes('login'));

  // 测试添加产品
  await page.goto(ADMIN_URL + '/products', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const beforeCount = await page.locator('table tbody tr').count();
  log('浏览器-产品列表有数据', beforeCount > 0, `共 ${beforeCount} 行`);

  // 点击添加按钮
  const addBtn = page.locator('button').filter({ hasText: /Tambah/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await sleep(2000);

    // 检查弹窗
    const modal = await page.locator('[role="dialog"], .modal, .ant-modal').count();
    log('浏览器-添加产品弹窗打开', modal > 0, `找到 ${modal} 个弹窗`);

    // 关闭弹窗
    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // ========== 14. POS收银端测试 ==========
  console.log('\n========== 14. POS收银端测试 ==========');

  await page.goto('http://localhost:6065', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // POS登录
  const posLogin = page.locator('input[type="tel"]');
  if (await posLogin.count() > 0) {
    await posLogin.fill('081234567892');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    log('浏览器-POS登录成功', !page.url().includes('login'));

    // 检查产品列表
    await page.waitForTimeout(2000);
    const posProducts = await page.locator('[class*="product"], [class*="item"]').count();
    log('浏览器-POS产品列表', posProducts > 0, `找到 ${posProducts} 个产品元素`);
  }

  // ========== 总结 ==========
  console.log('\n========== CRUD操作测试总结 ==========');
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

runCRUDTests().catch(console.error);
