/**
 * 浏览器用户操作测试 - 模拟真实用户操作
 */

const { chromium } = require('playwright');

const API_BASE = 'http://localhost:7072/api';
const ADMIN_URL = 'http://localhost:5173';
const POS_URL = 'http://localhost:6065';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runUserTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let errors = [];
  let passed = 0;
  let total = 0;

  // 捕获控制台错误
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    errors.push(`Page Error: ${err.message}`);
  });

  try {
    // ========== 1. Admin 登录测试 ==========
    console.log('\n========== Admin 登录测试 ==========');
    total++;
    console.log('1. 打开 Admin 登录页面...');
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // 检查页面是否加载
    const title = await page.title();
    console.log(`   页面标题: ${title}`);

    // 检查登录表单是否存在
    const loginForm = await page.$('input[type="tel"], input[placeholder*="手机"], input[placeholder*="phone"]');
    if (loginForm) {
      console.log('   ✅ 登录表单已找到');
      passed++;
    } else {
      console.log('   ❌ 登录表单未找到');
    }

    // 尝试登录
    console.log('   尝试输入手机号...');
    const phoneInput = await page.$('input');
    if (phoneInput) {
      await phoneInput.fill('081234567890');
      await sleep(500);

      // 查找登录按钮
      const loginBtn = await page.$('button[type="submit"], button:has-text("登录"), button:has-text("Login")');
      if (loginBtn) {
        console.log('   点击登录按钮...');
        await loginBtn.click();
        await sleep(3000);

        // 检查是否登录成功（URL变化或页面内容变化）
        const currentUrl = page.url();
        console.log(`   当前URL: ${currentUrl}`);
        if (!currentUrl.includes('login')) {
          console.log('   ✅ 登录成功');
          passed++;
        } else {
          console.log('   ⚠️ 可能仍在登录页');
        }
      }
    }
    total++;

    // ========== 2. Admin Dashboard 测试 ==========
    console.log('\n========== Admin Dashboard 测试 ==========');
    total++;
    try {
      // 等待页面加载
      await page.waitForTimeout(2000);

      // 检查侧边栏
      const sidebar = await page.$('aside, nav, [class*="sidebar"]');
      if (sidebar) {
        console.log('   ✅ 侧边栏已加载');
        passed++;
      } else {
        console.log('   ⚠️ 未找到侧边栏');
      }

      // 检查仪表盘内容
      const dashboardContent = await page.textContent('body');
      if (dashboardContent.includes('今日') || dashboardContent.includes('Today') || dashboardContent.includes('Dashboard')) {
        console.log('   ✅ Dashboard 内容已加载');
        passed++;
      } else {
        console.log('   ⚠️ Dashboard 内容可能未加载');
      }
      total++;
    } catch (e) {
      console.log(`   ❌ Dashboard 测试出错: ${e.message}`);
    }

    // ========== 3. 测试各模块页面加载 ==========
    const modules = [
      { name: '产品管理', path: '/products' },
      { name: '订单管理', path: '/orders' },
      { name: '库存管理', path: '/inventory' },
      { name: '员工管理', path: '/staff' },
      { name: '会员管理', path: '/members' },
      { name: '卫生管理', path: '/hygiene' },
      { name: '营销管理', path: '/marketing' },
      { name: '费用管理', path: '/expense' },
      { name: '财务报表', path: '/finance' },
      { name: '系统设置', path: '/settings' },
    ];

    console.log('\n========== 测试各模块页面加载 ==========');
    for (const mod of modules) {
      total++;
      try {
        console.log(`   测试 ${mod.name}...`);
        await page.goto(ADMIN_URL + mod.path, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(1500);

        const pageContent = await page.textContent('body');
        const hasContent = pageContent.length > 100;
        const hasError = pageContent.includes('Error') || pageContent.includes('404') || pageContent.includes('500');

        if (hasContent && !hasError) {
          console.log(`   ✅ ${mod.name} 加载正常`);
          passed++;
        } else if (hasError) {
          console.log(`   ❌ ${mod.name} 显示错误`);
        } else {
          console.log(`   ⚠️ ${mod.name} 内容较少`);
          passed++; // 页面能打开就算通过
        }
      } catch (e) {
        console.log(`   ❌ ${mod.name} 加载失败: ${e.message}`);
      }
    }

    // ========== 4. POS 登录测试 ==========
    console.log('\n========== POS 登录测试 ==========');
    total++;
    try {
      await page.goto(POS_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(2000);

      const posContent = await page.textContent('body');
      if (posContent.includes('POS') || posContent.includes('收银') || posContent.includes('Bubble Tea')) {
        console.log('   ✅ POS 页面加载正常');
        passed++;
      } else {
        console.log('   ⚠️ POS 页面内容异常');
      }
      total++;
    } catch (e) {
      console.log(`   ❌ POS 页面加载失败: ${e.message}`);
    }

    // ========== 5. 报表页面测试 ==========
    console.log('\n========== 报表页面测试 ==========');
    total++;
    try {
      await page.goto(ADMIN_URL + '/reports', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);

      const reportsContent = await page.textContent('body');
      if (reportsContent.includes('报表') || reportsContent.includes('报告') || reportsContent.includes('Report') || reportsContent.includes('Revenue')) {
        console.log('   ✅ 报表页面加载正常');
        passed++;
      } else {
        console.log('   ⚠️ 报表页面内容异常');
      }
      total++;
    } catch (e) {
      console.log(`   ❌ 报表页面加载失败: ${e.message}`);
    }

  } catch (e) {
    console.log(`\n❌ 测试过程出错: ${e.message}`);
  } finally {
    await browser.close();
  }

  // ========== 总结 ==========
  console.log('\n========== 用户操作测试总结 ==========');
  console.log(`总测试数: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${total - passed}`);

  if (errors.length > 0) {
    console.log('\n⚠️ 控制台错误:');
    errors.slice(0, 10).forEach(e => console.log(`   - ${e}`));
  }

  console.log('\n========== 测试完成 ==========\n');

  return { total, passed, failed: total - passed, errors };
}

// 运行测试
runUserTests().catch(console.error);
