const { chromium } = require('playwright');

async function testAll() {
  console.log('🧪 全面测试所有模块...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = [];
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // 过滤 React DevTools 警告
      if (!text.includes('DevTools') && !text.includes('Download')) {
        errors.push(text);
      }
    }
  });

  try {
    // 1. 登录
    console.log('【登录】');
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('✅ 登录成功\n');

    // 测试各模块
    const modules = [
      { name: '产品-添加', url: '/products/new' },
      { name: '产品-编辑', url: '/products' },
      { name: '库存-盘点', url: '/inventory/count' },
      { name: '库存-预警配置', url: '/inventory/alert-config' },
      { name: '员工-添加', url: '/staff/new' },
      { name: '员工-请假规则', url: '/staff/leave/types' },
      { name: '卫生-添加模板', url: '/hygiene/new' },
      { name: '卫生-区域', url: '/hygiene/areas' },
      { name: '卫生-今日任务', url: '/hygiene/today' },
      { name: '卫生-配置', url: '/hygiene/config' },
      { name: '市场-添加活动', url: '/marketing/campaigns/new' },
      { name: '市场-优惠券', url: '/marketing/coupons' },
    ];

    for (const mod of modules) {
      console.log(`【${mod.name}】访问 ${mod.url}`);
      try {
        await page.goto('http://localhost:5173' + mod.url, { timeout: 10000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
        
        // 检查是否有表单
        const form = await page.$('form');
        const saveBtn = await page.$('button[type="submit"]');
        const addBtn = await page.$('button:has-text("添加"), button:has-text("Tambah"), button:has-text("Add")');
        
        console.log(`   表单: ${form ? '✅' : '⚠️无'} 保存按钮: ${saveBtn ? '✅' : '⚠️无'} 添加按钮: ${addBtn ? '✅' : '⚠️无'}`);
        
        // 如果有添加按钮，点击添加
        if (addBtn) {
          await addBtn.click();
          await page.waitForTimeout(500);
          const modal = await page.$('.modal, [role="dialog"], .fixed');
          console.log(`   弹窗: ${modal ? '✅' : '⚠️'}`);
        }
        
        // 如果有保存按钮，点击
        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(2000);
          const url = page.url();
          const newErrors = errors.filter(e => e.includes('500') || e.includes('Error'));
          console.log(`   保存后URL: ${url}`);
          if (newErrors.length > 0) {
            console.log(`   ⚠️ 新增错误: ${newErrors[0].substring(0, 80)}`);
          }
        }
        
      } catch (err) {
        console.log(`   ❌ 错误: ${err.message.substring(0, 50)}`);
      }
      console.log('');
    }

    // 汇总
    console.log('========== 结果汇总 ==========');
    console.log(`总错误数: ${errors.length}`);
    if (errors.length > 0) {
      console.log('错误列表:');
      errors.slice(0, 5).forEach(e => console.log(' -', e.substring(0, 100)));
    }
    console.log('================================\n');

  } catch (err) {
    console.log('❌ 测试异常:', err.message);
  } finally {
    await browser.close();
  }
}

testAll();
