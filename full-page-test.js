/**
 * 全页面崩溃测试 - 检查每个页面是否能正常加载
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAllPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  let passed = 0;
  let total = 0;
  let crashes = [];

  // 登录
  console.log('登录中...');
  await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log('已登录\n');

  // 测试所有页面
  const pages = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: '产品列表', path: '/products' },
    { name: '产品分类', path: '/products/categories' },
    { name: '产品配方', path: '/products/recipes' },
    { name: '产品成本', path: '/products/costs' },
    { name: '渠道管理', path: '/channels' },
    { name: '渠道报表', path: '/channels/reports' },
    { name: '库存列表', path: '/inventory' },
    { name: '库记录', path: '/inventory/logs' },
    { name: '库存预警', path: '/inventory/alerts' },
    { name: '库存盘点', path: '/inventory/count' },
    { name: '补货建议', path: '/inventory/restock' },
    { name: '供应商', path: '/inventory/suppliers' },
    { name: '加工工艺', path: '/inventory/process' },
    { name: '员工列表', path: '/staff' },
    { name: '考勤打卡', path: '/staff/attendance' },
    { name: '请假申请', path: '/staff/attendance/leave' },
    { name: '班次管理', path: '/staff/schedule' },
    { name: '培训记录', path: '/staff/training' },
    { name: '工资列表', path: '/staff/salary' },
    { name: '员工积分', path: '/staff/points' },
    { name: '卫生模板', path: '/hygiene' },
    { name: '今日任务', path: '/hygiene/today' },
    { name: '卫生日历', path: '/hygiene/calendar' },
    { name: '卫生配置', path: '/hygiene/config' },
    { name: '营收报表', path: '/finance/revenue' },
    { name: '订单列表', path: '/finance/orders' },
    { name: '退款管理', path: '/finance/refunds' },
    { name: '费用管理', path: '/finance/expenses' },
    { name: '财务报表', path: '/finance/reports' },
    { name: '税务管理', path: '/finance/tax' },
    { name: '固定资产', path: '/finance/fixed-assets' },
    { name: '营销首页', path: '/marketing' },
    { name: '营销活动', path: '/marketing/promotions/campaigns' },
    { name: '优惠券', path: '/marketing/promotions/coupons' },
    { name: '会员列表', path: '/marketing/members' },
    { name: '积分规则', path: '/marketing/points' },
    { name: '消息中心', path: '/marketing/messages' },
    { name: '自动化运营', path: '/marketing/operations' },
    { name: '公告管理', path: '/announcement' },
    { name: '系统设置', path: '/settings' },
    { name: 'POS设置', path: '/settings/pos' },
    { name: '数据导入', path: '/import' },
    { name: 'KDS', path: '/kds' },
    { name: '外卖聚合', path: '/delivery' },
    { name: '排队叫号', path: '/queue' },
  ];

  console.log('========== 页面崩溃测试 ==========\n');

  for (const p of pages) {
    total++;
    const errors = [];

    // 监听页面错误
    const errorHandler = err => errors.push(err.message);
    page.on('pageerror', errorHandler);

    try {
      await page.goto(ADMIN_URL + p.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);

      // 检查是否有崩溃关键词
      const html = await page.content();
      const hasCrash = html.includes('suggestions.reduce') ||
                      html.includes('is not a function') ||
                      html.includes('Cannot read property');

      // 检查页面内容长度
      const bodyText = await page.textContent('body').catch(() => '');
      const hasContent = bodyText.length > 100;

      // 移除监听器
      page.removeListener('pageerror', errorHandler);

      if (errors.length > 0 || hasCrash) {
        console.log(`❌ ${p.name}: 崩溃 - ${errors[0] || 'JS错误'}`);
        crashes.push({ name: p.name, path: p.path, errors });
      } else if (!hasContent) {
        console.log(`⚠️  ${p.name}: 空白页`);
      } else {
        console.log(`✅ ${p.name}: 正常`);
        passed++;
      }
    } catch (e) {
      page.removeListener('pageerror', errorHandler);
      console.log(`❌ ${p.name}: 加载失败 - ${e.message.substring(0, 50)}`);
      crashes.push({ name: p.name, path: p.path, errors: [e.message] });
    }
  }

  console.log('\n========== 总结 ==========');
  console.log(`总页面: ${total}`);
  console.log(`✅ 正常: ${passed}`);
  console.log(`❌ 崩溃: ${crashes.length}`);

  if (crashes.length > 0) {
    console.log('\n崩溃页面:');
    crashes.forEach(c => {
      console.log(`  - ${c.name} (${c.path})`);
      c.errors.forEach(e => console.log(`    错误: ${e}`));
    });
  }

  console.log('\n========== 测试完成 ==========');
  await browser.close();
  return { total, passed, crashes };
}

testAllPages().catch(console.error);
