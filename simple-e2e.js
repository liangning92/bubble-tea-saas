const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  let errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  
  console.log('═══════════════════════════════════════════════');
  console.log('     员工APP 核心流程测试');
  console.log('═══════════════════════════════════════════════\n');
  
  let pass = 0, fail = 0;
  
  const check = (name, ok) => {
    console.log((ok ? '✅' : '❌') + ' ' + name);
    if (ok) pass++; else fail++;
  };
  
  // 1. 登录
  console.log('1. 登录流程');
  await page.goto('http://localhost:6083/login');
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check('登录成功跳转首页', !page.url().includes('login'));
  
  // 2. 首页功能入口
  console.log('\n2. 首页功能入口');
  await page.waitForTimeout(1000);
  const homeBody = await page.textContent('body');
  check('显示问候语', homeBody.includes('Pagi') || homeBody.includes('Siang') || homeBody.includes('Sore'));
  check('显示考勤入口', homeBody.includes('Absensi') || homeBody.includes('考勤'));
  check('显示排班入口', homeBody.includes('Jadwal') || homeBody.includes('排班'));
  check('显示请假入口', homeBody.includes('Cuti') || homeBody.includes('请假'));
  check('底部导航栏存在', homeBody.includes('Absensi') && homeBody.includes('Jadwal'));
  
  // 3. 各页面加载
  console.log('\n3. 核心页面加载');
  const pages = [
    ['http://localhost:6083/attendance', '考勤'],
    ['http://localhost:6083/schedule', '排班'],
    ['http://localhost:6083/leave', '请假'],
    ['http://localhost:6083/reimbursement', '报销'],
    ['http://localhost:6083/salary', '工资'],
    ['http://localhost:6083/profile', '我的'],
    ['http://localhost:6083/hygiene', '卫生'],
    ['http://localhost:6083/inventory', '库存'],
    ['http://localhost:6083/points', '积分'],
    ['http://localhost:6083/deposit', '押金'],
    ['http://localhost:6083/training', '培训'],
    ['http://localhost:6083/announcements', '公告'],
  ];
  
  for (const [url, name] of pages) {
    await page.goto(url);
    await page.waitForTimeout(1500);
    const body = await page.textContent('body');
    check(name + '页面', body.length > 100);
  }
  
  // 4. 语言切换
  console.log('\n4. 语言切换功能');
  await page.goto('http://localhost:6083/');
  await page.waitForTimeout(1500);
  
  // 切换英语
  const langBtn = await page.$('button:has-text("🇮🇩")');
  if (langBtn) {
    await langBtn.click();
    await page.waitForTimeout(500);
    const enBtn = await page.$('button:has-text("🇬🇧English")');
    if (enBtn) {
      await enBtn.click();
      await page.waitForTimeout(1500);
      const enBody = await page.textContent('body');
      check('英语切换', enBody.includes('Home') || enBody.includes('Attendance'));
      
      // 切换中文
      await page.click('button:has-text("🇬🇧")');
      await page.waitForTimeout(500);
      const zhBtn = await page.$('button:has-text("🇨🇳中文")');
      if (zhBtn) {
        await zhBtn.click();
        await page.waitForTimeout(1500);
        const zhBody = await page.textContent('body');
        check('中文切换', zhBody.includes('首页') || zhBody.includes('考勤'));
      } else {
        check('中文切换', false);
      }
    } else {
      check('英语切换', false);
    }
  } else {
    check('语言按钮', false);
  }
  
  // 5. 错误统计
  console.log('\n═══════════════════════════════════════════════');
  console.log('                  测试结果');
  console.log('═══════════════════════════════════════════════');
  console.log('   通过: ' + pass + '  失败: ' + fail);
  console.log('   控制台错误: ' + errors.length);
  
  if (errors.length > 0) {
    console.log('   主要错误:');
    errors.slice(0, 3).forEach(e => console.log('   - ' + e.substring(0, 80)));
  }
  
  await browser.close();
  
  console.log('\n🎉 测试完成！\n');
  process.exit(fail > 0 ? 1 : 0);
})();
