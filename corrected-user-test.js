/**
 * 修正路径的用户操作测试
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';
const POS_URL = 'http://localhost:6065';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCorrectedTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  let passed = 0;
  let total = 0;
  let results = [];

  function log(name, status, detail = '') {
    total++;
    const icon = status ? '✅' : '❌';
    const msg = `${icon} ${name}${detail ? ': ' + detail : ''}`;
    console.log(msg);
    results.push({ name, status, detail });
    if (status) passed++;
    return status;
  }

  try {
    // ========== 登录 ==========
    console.log('\n========== 登录测试 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    await page.locator('input[type="tel"]').fill('081234567890');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    log('Admin 登录成功', !page.url().includes('login'), page.url());

    // ========== 各模块页面测试（使用正确路径） ==========
    const modules = [
      { name: 'Dashboard', path: '/dashboard' },
      { name: '产品列表', path: '/products' },
      { name: '订单列表', path: '/orders' },
      { name: '库存管理', path: '/inventory' },
      { name: '员工管理', path: '/staff' },
      { name: '会员管理', path: '/marketing/members' },  // 正确路径
      { name: '卫生管理', path: '/hygiene' },
      { name: '营销中心', path: '/marketing' },
      { name: '费用管理', path: '/expenses' },  // 正确路径（复数）
      { name: '财务报表', path: '/reports' },
      { name: '系统设置', path: '/settings' },
    ];

    console.log('\n========== 各模块页面加载测试 ==========');
    for (const mod of modules) {
      await page.goto(ADMIN_URL + mod.path, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2000);

      const text = await page.textContent('body');
      const hasContent = text.length > 100;
      log(`${mod.name} 加载`, hasContent, `内容长度: ${text.length}`);
    }

    // ========== 添加产品测试 ==========
    console.log('\n========== 添加产品测试 ==========');
    await page.goto(ADMIN_URL + '/products', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    // 点击添加产品按钮
    const addBtn = page.locator('button').filter({ hasText: /Tambah|添加/i }).first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await sleep(2000);

      // 检查是否有弹窗或表单出现
      const pageText = await page.textContent('body');
      const hasForm = pageText.includes('Nama') || pageText.includes('名称') ||
                      pageText.includes('Name') || pageText.includes('Produk');
      log('添加产品表单', hasForm);

      // 按ESC关闭
      await page.keyboard.press('Escape');
      await sleep(500);
    } else {
      log('添加产品按钮', false, '未找到按钮');
    }

    // ========== 创建订单测试 ==========
    console.log('\n========== 创建订单测试 ==========');
    await page.goto(ADMIN_URL + '/orders', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    // 点击新建订单
    const newOrderBtn = page.locator('button').filter({ hasText: /Baru|新建|New/i }).first();
    if (await newOrderBtn.count() > 0) {
      await newOrderBtn.click();
      await sleep(2000);

      const pageText = await page.textContent('body');
      const hasOrderForm = pageText.includes('Pelanggan') || pageText.includes('Customer') ||
                          pageText.includes('会员') || pageText.includes('产品');
      log('订单创建表单', hasOrderForm);

      await page.keyboard.press('Escape');
      await sleep(500);
    }

    // ========== 员工添加测试 ==========
    console.log('\n========== 员工管理测试 ==========');
    await page.goto(ADMIN_URL + '/staff', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const staffText = await page.textContent('body');
    log('员工页面加载', staffText.length > 100, `内容长度: ${staffText.length}`);

    // ========== 卫生任务测试 ==========
    console.log('\n========== 卫生任务测试 ==========');
    await page.goto(ADMIN_URL + '/hygiene', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const hygieneText = await page.textContent('body');
    log('卫生页面加载', hygieneText.length > 100, `内容长度: ${hygieneText.length}`);

    // ========== 营销活动测试 ==========
    console.log('\n========== 营销活动测试 ==========');
    await page.goto(ADMIN_URL + '/marketing', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const marketingText = await page.textContent('body');
    log('营销页面加载', marketingText.length > 100, `内容长度: ${marketingText.length}`);

    // ========== 报表测试 ==========
    console.log('\n========== 报表测试 ==========');
    await page.goto(ADMIN_URL + '/reports', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const reportText = await page.textContent('body');
    log('报表页面加载', reportText.length > 100, `内容长度: ${reportText.length}`);

    // ========== POS 收银端测试 ==========
    console.log('\n========== POS 收银端测试 ==========');
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

      // 检查 POS 主要功能
      const posText = await page.textContent('body');
      log('POS 界面加载', posText.length > 100, `内容长度: ${posText.length}`);
    }

    // ========== Cashier 角色权限测试 ==========
    console.log('\n========== Cashier 权限测试 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    await page.locator('input[type="tel"]').fill('081234567892');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    log('Cashier 登录', !page.url().includes('login'));

    // Cashier 尝试访问财务报表（应该无权限）
    await page.goto(ADMIN_URL + '/reports', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const cashierReportText = await page.textContent('body');
    const noPermission = cashierReportText.length < 100 || cashierReportText.includes('403') ||
                        cashierReportText.includes('权限') || cashierReportText.includes('Permission');
    log('Cashier 无法访问报表', noPermission, `内容长度: ${cashierReportText.length}`);

    // Cashier 访问 POS 订单（应该可以）
    await page.goto(ADMIN_URL + '/orders', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const cashierOrderText = await page.textContent('body');
    log('Cashier 访问订单页面', cashierOrderText.length > 50, `内容长度: ${cashierOrderText.length}`);

  } catch (e) {
    console.log('\n❌ 测试出错:', e.message);
  } finally {
    await browser.close();
  }

  // ========== 总结 ==========
  console.log('\n========== 用户操作测试总结 ==========');
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

  return { total, passed, failed: total - passed, results };
}

runCorrectedTests().catch(console.error);
