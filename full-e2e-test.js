const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  let errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Warning')) {
      errors.push(msg.text());
    }
  });
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('      员工APP 全链路测试 - 模拟真实员工操作');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let passed = 0, failed = 0;
  const test = (name, ok) => {
    console.log((ok ? '✅' : '❌') + ' ' + name);
    if (ok) passed++; else failed++;
    return ok;
  };
  
  // ========== 第一步：登录 ==========
  console.log('【第一步：登录】');
  await page.goto('http://localhost:6083/login');
  await page.waitForLoadState('networkidle');
  await test('打开登录页面', (await page.textContent('body')).includes('Bubble Tea'));
  
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await sleep(3000);
  
  const afterLogin = page.url();
  test('登录成功跳转首页', !afterLogin.includes('login'));
  
  // ========== 第二步：首页检查 ==========
  console.log('\n【第二步：首页功能】');
  const homeBody = await page.textContent('body');
  test('显示员工姓名', homeBody.includes('Administrator') || homeBody.includes('Admin'));
  test('显示班次信息', homeBody.includes('Shift') || homeBody.includes('班次'));
  test('显示签到按钮', homeBody.includes('Check In') || homeBody.includes('Masuk') || homeBody.includes('签到'));
  test('底部导航存在', homeBody.includes('Absensi') || homeBody.includes('考勤'));
  test('可进入考勤页面', homeBody.includes('Absensi') || homeBody.includes('考勤'));
  
  // ========== 第三步：切换语言 ==========
  console.log('\n【第三步：语言切换】');
  const langBtn = await page.$('button:has-text("🇮🇩")');
  if (langBtn) {
    await langBtn.click();
    await sleep(500);
    const enBtn = await page.$('button:has-text("🇬🇧English")');
    if (enBtn) {
      await enBtn.click();
      await sleep(1500);
      const enBody = await page.textContent('body');
      test('切换到英语成功', enBody.includes('Home') || enBody.includes('Attendance'));
      
      // 切换中文
      await page.click('button:has-text("🇬🇧")');
      await sleep(500);
      const zhBtn = await page.$('button:has-text("🇨🇳中文")');
      if (zhBtn) {
        await zhBtn.click();
        await sleep(1500);
        const zhBody = await page.textContent('body');
        test('切换到中文成功', zhBody.includes('首页') || zhBody.includes('考勤'));
      } else {
        test('切换到中文成功', false);
      }
    } else {
      test('切换到英语成功', false);
    }
  } else {
    test('找到语言切换按钮', false);
  }
  
  // ========== 第四步：考勤打卡 ==========
  console.log('\n【第四步：考勤打卡】');
  await page.goto('http://localhost:6083/attendance');
  await sleep(2000);
  const attBody = await page.textContent('body');
  test('考勤页面加载', attBody.includes('考勤') || attBody.includes('Check In') || attBody.includes('Absensi'));
  test('显示签到/签退按钮', attBody.includes('签到') || attBody.includes('Check In') || attBody.includes('Masuk'));
  
  // ========== 第五步：查看排班 ==========
  console.log('\n【第五步：排班查看】');
  await page.goto('http://localhost:6083/schedule');
  await sleep(2000);
  const schedBody = await page.textContent('body');
  test('排班页面加载', schedBody.includes('排班') || schedBody.includes('Jadwal') || schedBody.includes('Schedule'));
  test('显示本周/下周', schedBody.includes('本周') || schedBody.includes('This Week') || schedBody.includes('Minggu'));
  
  // ========== 第六步：请假申请 ==========
  console.log('\n【第六步：请假申请】');
  await page.goto('http://localhost:6083/leave');
  await sleep(2000);
  const leaveBody = await page.textContent('body');
  test('请假页面加载', leaveBody.includes('请假') || leaveBody.includes('Cuti') || leaveBody.includes('Leave'));
  test('显示请假历史/余额', leaveBody.includes('历史') || leaveBody.includes('Riwayat') || leaveBody.includes('History'));
  
  // 点击申请请假按钮
  const applyLeaveBtn = await page.$('button:has-text("+"), button:has-text("Ajukan"), button:has-text("申请")');
  if (applyLeaveBtn) {
    await applyLeaveBtn.click();
    await sleep(1000);
    const modalVisible = await page.$('.fixed.inset-0');
    test('请假申请弹窗打开', modalVisible !== null);
    
    // 关闭弹窗
    const closeBtn = await page.$('.fixed.inset-0 button, .fixed button');
    if (closeBtn) {
      await closeBtn.click();
      await sleep(500);
    }
  }
  
  // ========== 第七步：报销申请 ==========
  console.log('\n【第七步：报销申请】');
  await page.goto('http://localhost:6083/reimbursement');
  await sleep(2000);
  const reimbBody = await page.textContent('body');
  test('报销页面加载', reimbBody.includes('报销') || reimbBody.includes('Pengeluaran') || reimbBody.includes('Expense'));
  
  // ========== 第八步：查看工资 ==========
  console.log('\n【第八步：工资查看】');
  await page.goto('http://localhost:6083/salary');
  await sleep(2000);
  const salaryBody = await page.textContent('body');
  test('工资页面加载', salaryBody.includes('工资') || salaryBody.includes('Gaji') || salaryBody.includes('Salary'));
  
  // ========== 第九步：卫生任务 ==========
  console.log('\n【第九步：卫生任务】');
  await page.goto('http://localhost:6083/hygiene');
  await sleep(2000);
  const hygBody = await page.textContent('body');
  test('卫生任务页面加载', hygBody.includes('卫生') || hygBody.includes('Kebersihan') || hygBody.includes('Hygiene'));
  
  // ========== 第十步：库存管理 ==========
  console.log('\n【第十步：库存管理】');
  await page.goto('http://localhost:6083/inventory');
  await sleep(2000);
  const invBody = await page.textContent('body');
  test('库存页面加载', invBody.includes('库存') || invBody.includes('Inventori') || invBody.includes('Inventory'));
  
  // ========== 第十一步：积分兑换 ==========
  console.log('\n【第十一步：积分兑换】');
  await page.goto('http://localhost:6083/points');
  await sleep(2000);
  const ptsBody = await page.textContent('body');
  test('积分页面加载', ptsBody.includes('积分') || ptsBody.includes('Poin') || ptsBody.includes('Points'));
  
  // ========== 第十二步：押金查看 ==========
  console.log('\n【第十二步：押金查看】');
  await page.goto('http://localhost:6083/deposit');
  await sleep(2000);
  const depBody = await page.textContent('body');
  test('押金页面加载', depBody.includes('押金') || depBody.includes('Deposit'));
  
  // ========== 第十三步：培训记录 ==========
  console.log('\n【第十三步：培训记录】');
  await page.goto('http://localhost:6083/training');
  await sleep(2000);
  const trainBody = await page.textContent('body');
  test('培训页面加载', trainBody.includes('培训') || trainBody.includes('Pelatihan') || trainBody.includes('Training'));
  
  // ========== 第十四步：公告通知 ==========
  console.log('\n【第十四步：公告通知】');
  await page.goto('http://localhost:6083/announcements');
  await sleep(2000);
  const notifBody = await page.textContent('body');
  test('公告页面加载', notifBody.includes('公告') || notifBody.includes('Pengumuman') || notifBody.includes('Announcement'));
  
  // ========== 第十五步：个人资料 ==========
  console.log('\n【第十五步：个人资料】');
  await page.goto('http://localhost:6083/profile');
  await sleep(2000);
  const profBody = await page.textContent('body');
  test('个人资料页面加载', profBody.includes('我的') || profBody.includes('Profil') || profBody.includes('Profile'));
  test('显示修改密码入口', profBody.includes('密码') || profBody.includes('Password') || profBody.includes('Kata Sandi'));
  
  // ========== 第十六步：退出登录 ==========
  console.log('\n【第十六步：退出登录】');
  await page.goto('http://localhost:6083/profile');
  await sleep(1000);
  
  // 找到退出按钮
  const allButtons = await page.$$('button');
  let logoutFound = false;
  for (const btn of allButtons) {
    const text = await btn.textContent();
    if (text && (text.includes('退出') || text.includes('Logout') || text.includes('Keluar'))) {
      await btn.click();
      await sleep(2000);
      logoutFound = true;
      break;
    }
  }
  test('退出登录', logoutFound);
  
  const afterLogoutUrl = page.url();
  test('退出后跳转登录页', afterLogoutUrl.includes('login'));
  
  // ========== 总结 ==========
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    测试结果汇总');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   通过: ' + passed + '  失败: ' + failed);
  console.log('   控制台错误: ' + errors.length);
  
  if (errors.length > 0) {
    console.log('   主要错误:');
    [...new Set(errors)].slice(0, 3).forEach(e => {
      console.log('   - ' + e.substring(0, 100));
    });
  }
  
  console.log('\n🎉 全链路测试完成！\n');
  
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
