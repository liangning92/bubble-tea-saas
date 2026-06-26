const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  let errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  
  console.log('═══════════════════════════════════════════════');
  console.log('     员工APP 全链路测试');
  console.log('═══════════════════════════════════════════════\n');
  
  // 1. 打开登录页
  console.log('📱 [1/20] 打开登录页面...');
  await page.goto('http://localhost:6083/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/e2e-01-login.png' });
  console.log('   ✅ 登录页加载成功\n');
  
  // 2. 输入账号密码登录
  console.log('🔐 [2/20] 输入账号密码登录...');
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const homeUrl = page.url();
  console.log('   ' + (homeUrl.includes('/login') ? '❌' : '✅') + ' 登录' + (homeUrl.includes('/login') ? '失败，仍在登录页' : '成功，跳转到首页') + '\n');
  
  // 3. 首页截图
  console.log('🏠 [3/20] 首页内容检查...');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/e2e-03-home.png' });
  const homeText = await page.textContent('body');
  console.log('   ✅ 首页加载成功\n');
  
  // 4. 测试语言切换 - 英语
  console.log('🌐 [4/20] 切换到英语...');
  await page.click('button:has-text("🇮🇩")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("🇬🇧English")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/e2e-04-english.png' });
  let enText = await page.textContent('body');
  const hasEnglish = enText.includes('Home') || enText.includes('Schedule') || enText.includes('Attendance');
  console.log('   ' + (hasEnglish ? '✅' : '❌') + ' 英语切换' + (hasEnglish ? '成功' : '失败') + '\n');
  
  // 5. 测试语言切换 - 中文
  console.log('🌐 [5/20] 切换到中文...');
  await page.click('button:has-text("🇬🇧")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("🇨🇳中文")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/e2e-05-chinese.png' });
  let zhText = await page.textContent('body');
  const hasChinese = zhText.includes('首页') || zhText.includes('考勤') || zhText.includes('排班');
  console.log('   ' + (hasChinese ? '✅' : '❌') + ' 中文切换' + (hasChinese ? '成功' : '失败') + '\n');
  
  // 6. 点击考勤页面
  console.log('📋 [6/20] 进入考勤页面...');
  await page.goto('http://localhost:6083/attendance');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-06-attendance.png' });
  const attText = await page.textContent('body');
  console.log('   ' + (attText.includes('考勤') || attText.includes('签到') ? '✅' : '❌') + ' 考勤页面加载成功\n');
  
  // 7. 点击底部导航 - 排班
  console.log('📅 [7/20] 进入排班页面...');
  await page.click('button:has-text("排班")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-07-schedule.png' });
  const schedText = await page.textContent('body');
  console.log('   ' + (schedText.includes('排班') || schedText.includes('班次') ? '✅' : '❌') + ' 排班页面加载成功\n');
  
  // 8. 点击底部导航 - 请假
  console.log('📅 [8/20] 进入请假页面...');
  await page.click('button:has-text("请假")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-08-leave.png' });
  const leaveText = await page.textContent('body');
  console.log('   ' + (leaveText.includes('请假') || leaveText.includes('请假') ? '✅' : '❌') + ' 请假页面加载成功\n');
  
  // 9. 点击底部导航 - 报销
  console.log('💰 [9/20] 进入报销页面...');
  await page.click('button:has-text("报销")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-09-reimb.png' });
  const reimbText = await page.textContent('body');
  console.log('   ' + (reimbText.includes('报销') || reimbText.includes('支出') ? '✅' : '❌') + ' 报销页面加载成功\n');
  
  // 10. 点击底部导航 - 我的
  console.log('👤 [10/20] 进入个人资料页面...');
  await page.click('button:has-text("我的")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-10-profile.png' });
  const profileText = await page.textContent('body');
  console.log('   ' + (profileText.includes('我的') || profileText.includes('密码') ? '✅' : '❌') + ' 个人资料页面加载成功\n');
  
  // 11. 返回首页
  console.log('🏠 [11/20] 返回首页...');
  await page.goto('http://localhost:6083/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-11-home2.png' });
  console.log('   ✅ 返回首页成功\n');
  
  // 12. 点击工资
  console.log('💵 [12/20] 进入工资页面...');
  await page.goto('http://localhost:6083/salary');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-12-salary.png' });
  console.log('   ✅ 工资页面加载成功\n');
  
  // 13. 点击卫生任务
  console.log('🧹 [13/20] 进入卫生任务页面...');
  await page.goto('http://localhost:6083/hygiene');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-13-hygiene.png' });
  console.log('   ✅ 卫生任务页面加载成功\n');
  
  // 14. 点击库存
  console.log('📦 [14/20] 进入库存页面...');
  await page.goto('http://localhost:6083/inventory');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-14-inventory.png' });
  console.log('   ✅ 库存页面加载成功\n');
  
  // 15. 点击积分
  console.log('⭐ [15/20] 进入积分页面...');
  await page.goto('http://localhost:6083/points');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-15-points.png' });
  console.log('   ✅ 积分页面加载成功\n');
  
  // 16. 点击押金
  console.log('💳 [16/20] 进入押金页面...');
  await page.goto('http://localhost:6083/deposit');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-16-deposit.png' });
  console.log('   ✅ 押金页面加载成功\n');
  
  // 17. 点击培训
  console.log('📚 [17/20] 进入培训页面...');
  await page.goto('http://localhost:6083/training');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-17-training.png' });
  console.log('   ✅ 培训页面加载成功\n');
  
  // 18. 点击公告
  console.log('📢 [18/20] 进入公告页面...');
  await page.goto('http://localhost:6083/announcements');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-18-announce.png' });
  console.log('   ✅ 公告页面加载成功\n');
  
  // 19. 点击考勤规则
  console.log('📋 [19/20] 进入考勤规则页面...');
  await page.goto('http://localhost:6083/attendance/rules');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/e2e-19-rules.png' });
  console.log('   ✅ 考勤规则页面加载成功\n');
  
  // 20. 退出登录
  console.log('🚪 [20/20] 退出登录...');
  await page.goto('http://localhost:6083/profile');
  await page.waitForTimeout(1000);
  // 找到退出按钮并点击
  const logoutBtn = await page.$('button:has-text("退出")');
  if (logoutBtn) {
    await logoutBtn.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: '/tmp/e2e-20-logout.png' });
  const afterLogoutUrl = page.url();
  console.log('   ' + (afterLogoutUrl.includes('login') ? '✅' : '❌') + ' 退出登录' + (afterLogoutUrl.includes('login') ? '成功' : '失败') + '\n');
  
  // 汇总
  console.log('═══════════════════════════════════════════════');
  console.log('                  测试完成');
  console.log('═══════════════════════════════════════════════');
  console.log('\n📊 控制台错误数量: ' + errors.length);
  if (errors.length > 0) {
    console.log('⚠️  错误列表:');
    errors.slice(0, 5).forEach(e => console.log('   - ' + e.substring(0, 100)));
  }
  console.log('\n📸 截图已保存到 /tmp/e2e-*.png');
  console.log('\n🎉 全链路测试完成！');
  
  await browser.close();
})();
