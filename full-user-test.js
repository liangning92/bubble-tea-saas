/**
 * 全面的用户操作测试 - 模拟真实用户在浏览器中的操作
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';
const POS_URL = 'http://localhost:6065';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFullUserTests() {
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

  // 捕获页面错误
  let pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  try {
    // ========== 第一步：Admin 登录 ==========
    console.log('\n========== 1. Admin 登录测试 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    await page.locator('input[type="tel"]').fill('081234567890');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);

    log('Admin 登录', !page.url().includes('login'), 'URL: ' + page.url());

    // ========== 第二步：Dashboard 检查 ==========
    console.log('\n========== 2. Dashboard 功能测试 ==========');
    await page.goto(ADMIN_URL + '/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const dashText = await page.textContent('body');
    log('Dashboard 加载', dashText.includes('今日') || dashText.includes('Today') || dashText.includes('Dashboard'));
    log('Dashboard 有数据', dashText.length > 500);

    // ========== 第三步：产品管理测试 ==========
    console.log('\n========== 3. 产品管理测试 ==========');
    await page.goto(ADMIN_URL + '/products', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const productText = await page.textContent('body');
    log('产品页面加载', productText.includes('产品') || productText.includes('Product') || productText.includes('商品'));

    // 检查是否有添加按钮
    const addProductBtn = page.locator('button:has-text("添加"), button:has-text("Tambah"), button:has-text("Add")');
    const hasAddBtn = await addProductBtn.count() > 0;
    log('添加产品按钮存在', hasAddBtn);

    // 点击添加产品
    if (hasAddBtn) {
      await addProductBtn.first().click();
      await sleep(1500);

      // 检查弹窗
      const modal = page.locator('[role="dialog"], .modal, .ant-modal');
      const hasModal = await modal.count() > 0;
      log('产品添加弹窗打开', hasModal);

      // 关闭弹窗
      const closeBtn = page.locator('.ant-modal-close, [aria-label="close"], button:has-text("取消")');
      if (await closeBtn.count() > 0) {
        await closeBtn.first().click();
        await sleep(500);
      }
    }

    // ========== 第四步：订单管理测试 ==========
    console.log('\n========== 4. 订单管理测试 ==========');
    await page.goto(ADMIN_URL + '/orders', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const orderText = await page.textContent('body');
    log('订单页面加载', orderText.includes('订单') || orderText.includes('Order') || orderText.includes('Pesanan'));

    // ========== 第五步：库存管理测试 ==========
    console.log('\n========== 5. 库存管理测试 ==========');
    await page.goto(ADMIN_URL + '/inventory', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const invText = await page.textContent('body');
    log('库存页面加载', invText.includes('库存') || invText.includes('Inventory') || invText.includes('Stok'));

    // ========== 第六步：员工管理测试 ==========
    console.log('\n========== 6. 员工管理测试 ==========');
    await page.goto(ADMIN_URL + '/staff', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const staffText = await page.textContent('body');
    log('员工页面加载', staffText.includes('员工') || staffText.includes('Staff') || staffText.includes('Karyawan'));

    // ========== 第七步：会员管理测试 ==========
    console.log('\n========== 7. 会员管理测试 ==========');
    await page.goto(ADMIN_URL + '/members', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const memberText = await page.textContent('body');
    log('会员页面加载', memberText.includes('会员') || memberText.includes('Member') || memberText.includes('Pelanggan'));

    // ========== 第八步：卫生管理测试 ==========
    console.log('\n========== 8. 卫生管理测试 ==========');
    await page.goto(ADMIN_URL + '/hygiene', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const hygieneText = await page.textContent('body');
    log('卫生页面加载', hygieneText.includes('卫生') || hygieneText.includes('Hygiene') || hygieneText.includes('Kebersihan'));

    // ========== 第九步：营销管理测试 ==========
    console.log('\n========== 9. 营销管理测试 ==========');
    await page.goto(ADMIN_URL + '/marketing', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const marketingText = await page.textContent('body');
    log('营销页面加载', marketingText.includes('营销') || marketingText.includes('Marketing') || marketingText.includes('Pemasaran'));

    // ========== 第十步：费用管理测试 ==========
    console.log('\n========== 10. 费用管理测试 ==========');
    await page.goto(ADMIN_URL + '/expense', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const expenseText = await page.textContent('body');
    log('费用页面加载', expenseText.includes('费用') || expenseText.includes('Expense') || expenseText.includes('Pengeluaran'));

    // ========== 第十一步：财务报表测试 ==========
    console.log('\n========== 11. 财务报表测试 ==========');
    await page.goto(ADMIN_URL + '/finance', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const financeText = await page.textContent('body');
    log('财务页面加载', financeText.includes('财务') || financeText.includes('Finance') || financeText.includes('Keuangan'));

    // ========== 第十二步：报表测试 ==========
    console.log('\n========== 12. 报表测试 ==========');
    await page.goto(ADMIN_URL + '/reports', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const reportText = await page.textContent('body');
    log('报表页面加载', reportText.includes('报表') || reportText.includes('Report') || reportText.includes('Laporan'));

    // ========== 第十三步：系统设置测试 ==========
    console.log('\n========== 13. 系统设置测试 ==========');
    await page.goto(ADMIN_URL + '/settings', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const settingsText = await page.textContent('body');
    log('设置页面加载', settingsText.includes('设置') || settingsText.includes('Settings') || settingsText.includes('Pengaturan'));

    // ========== 第十四步：POS 收银端测试 ==========
    console.log('\n========== 14. POS 收银端测试 ==========');
    await page.goto(POS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    const posText = await page.textContent('body');
    log('POS 页面加载', posText.includes('POS') || posText.includes('收银') || posText.includes('Kasir'));

    // POS 登录
    const posLoginBtn = page.locator('button:has-text("登录"), button:has-text("Masuk"), button:has-text("Login")');
    if (await posLoginBtn.count() > 0) {
      // 查找手机号输入框
      const posPhoneInput = page.locator('input[type="tel"]');
      if (await posPhoneInput.count() > 0) {
        await posPhoneInput.fill('081234567892'); // cashier 账号
        await page.locator('input[type="password"]').fill('admin123');
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(3000);

        log('POS 登录', !page.url().includes('login'), 'URL: ' + page.url());
      }
    }

    // 检查 POS 主要功能
    const posContent = await page.textContent('body');
    log('POS 有产品显示', posContent.includes('产品') || posContent.includes('Product') || posContent.length > 200);

    // ========== 第十五步：退出登录测试 ==========
    console.log('\n========== 15. 退出登录测试 ==========');
    await page.goto(ADMIN_URL + '/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    // 查找退出按钮
    const logoutBtn = page.locator('button:has-text("退出"), button:has-text("Logout"), button:has-text("Keluar")');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.first().click();
      await page.waitForTimeout(2000);
      log('退出登录成功', page.url().includes('login'));
    } else {
      log('退出按钮未找到（可能是下拉菜单）', false, '需要手动查找');
    }

    // ========== 第十六步：用 Manager 账号测试 ==========
    console.log('\n========== 16. Manager 账号测试 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    await page.locator('input[type="tel"]').fill('081234567891');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);

    log('Manager 登录', !page.url().includes('login'), 'URL: ' + page.url());

    // Manager 尝试访问敏感页面（应该可以）
    await page.goto(ADMIN_URL + '/finance', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    const managerFinance = await page.textContent('body');
    log('Manager 访问财务', managerFinance.includes('财务') || managerFinance.includes('Finance'));

    // Manager 尝试创建员工（应该被拒绝或没有权限）
    await page.goto(ADMIN_URL + '/staff', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    const staffTextM = await page.textContent('body');
    log('Manager 访问员工页面', staffTextM.includes('员工') || staffTextM.includes('Staff'));

    // ========== 第十七步：用 Cashier 账号测试 ==========
    console.log('\n========== 17. Cashier 账号测试 ==========');
    await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    await page.locator('input[type="tel"]').fill('081234567892');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);

    log('Cashier 登录', !page.url().includes('login'), 'URL: ' + page.url());

    // Cashier 尝试访问财务（应该没有权限或被重定向）
    await page.goto(ADMIN_URL + '/finance', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    const cashierFinance = await page.textContent('body');
    const hasNoPermission = cashierFinance.includes('权限') || cashierFinance.includes('Permission') ||
                            cashierFinance.includes('403') || cashierFinance.includes('无权限');
    log('Cashier 无法访问财务', hasNoPermission || cashierFinance.length < 500, '页面长度: ' + cashierFinance.length);

    // Cashier 访问 POS 订单页面（应该可以）
    await page.goto(ADMIN_URL + '/orders', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);
    const cashierOrders = await page.textContent('body');
    log('Cashier 访问订单页面', cashierOrders.includes('订单') || cashierOrders.includes('Order'));

  } catch (e) {
    console.log('\n❌ 测试过程出错:', e.message);
  } finally {
    await browser.close();
  }

  // ========== 总结 ==========
  console.log('\n========== 用户操作测试总结 ==========');
  console.log(`总测试数: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${total - passed}`);
  console.log(`通过率: ${Math.round(passed / total * 100)}%`);

  if (pageErrors.length > 0) {
    console.log('\n⚠️ 页面控制台错误:');
    pageErrors.slice(0, 5).forEach(e => console.log(`   - ${e}`));
  }

  const failedTests = results.filter(r => !r.status);
  if (failedTests.length > 0) {
    console.log('\n❌ 失败的测试:');
    failedTests.forEach(r => console.log(`   - ${r.name}: ${r.detail}`));
  }

  console.log('\n========== 测试完成 ==========\n');

  return { total, passed, failed: total - passed, results, pageErrors };
}

// 运行测试
runFullUserTests().catch(console.error);
