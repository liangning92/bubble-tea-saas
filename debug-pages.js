/**
 * 调试失败的测试 - 详细检查每个失败的项目
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function debugTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // 登录
  console.log('正在登录...');
  await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log('已登录, URL:', page.url());

  // 测试每个失败的页面
  const pagesToTest = [
    { name: '订单', path: '/orders' },
    { name: '会员', path: '/members' },
    { name: '费用', path: '/expense' },
    { name: '报表', path: '/reports' },
  ];

  for (const p of pagesToTest) {
    console.log(`\n========== 测试 ${p.name} 页面 ==========`);
    await page.goto(ADMIN_URL + p.path, { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(2000);

    const text = await page.textContent('body');
    console.log('页面长度:', text.length);
    console.log('URL:', page.url());

    // 打印前200个字符
    console.log('内容预览:', text.substring(0, 200).replace(/\n/g, ' '));

    // 检查是否有 error
    if (text.includes('Error') || text.includes('error')) {
      console.log('⚠️ 包含 Error 关键词');
    }
    if (text.includes('403') || text.includes('404') || text.includes('500')) {
      console.log('⚠️ 包含错误码');
    }
  }

  // 测试添加产品弹窗
  console.log('\n========== 测试添加产品弹窗 ==========');
  await page.goto(ADMIN_URL + '/products', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  // 查找添加按钮
  const buttons = await page.locator('button').allTextContents();
  console.log('所有按钮:', buttons.filter(b => b.trim()));

  // 尝试点击第一个可能添加按钮
  const addBtn = page.locator('button').filter({ hasText: /添加|Tambah|Add/i }).first();
  if (await addBtn.count() > 0) {
    console.log('找到添加按钮, 点击...');
    await addBtn.click();
    await sleep(2000);

    // 检查弹窗
    const modalCount = await page.locator('[role="dialog"]').count();
    console.log('弹窗数量:', modalCount);

    const modalText = await page.locator('[role="dialog"]').textContent().catch(() => '无弹窗');
    console.log('弹窗内容:', modalText.substring(0, 200));
  }

  // 测试退出按钮
  console.log('\n========== 测试退出按钮 ==========');
  await page.goto(ADMIN_URL + '/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  // 查找用户头像或下拉菜单
  const userBtn = page.locator('[class*="user"], [class*="avatar"], [class*="profile"]');
  if (await userBtn.count() > 0) {
    console.log('找到用户按钮, 点击...');
    await userBtn.first().click();
    await sleep(1000);

    const menuItems = await page.locator('[class*="menu"], [class*="dropdown"]').textContent().catch(() => '无菜单');
    console.log('菜单内容:', menuItems.substring(0, 200));
  }

  // 列出所有可点击的按钮
  console.log('\n========== 所有按钮列表 ==========');
  const allButtons = await page.locator('button').all();
  for (let i = 0; i < Math.min(allButtons.length, 20); i++) {
    const text = await allButtons[i].textContent();
    const className = await allButtons[i].getAttribute('class');
    console.log(`Button ${i}: "${text.trim()}" class: ${className}`);
  }

  await browser.close();
  console.log('\n========== 调试完成 ==========');
}

debugTests().catch(console.error);
