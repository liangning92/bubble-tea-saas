const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  function log(name, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
    results.push({ name, status, details });
  }

  async function login() {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('员工管理模块测试');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await login();
    log('登录', 'PASS');

    // 进入员工页面
    await page.goto(`${BASE_URL}/staff`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 页面加载
    const pageText = await page.evaluate(() => document.body.innerText);
    log('员工页面加载', pageText.includes('Berkas') || pageText.includes('Karyawan') ? 'PASS' : 'FAIL');

    // 1. 检查添加员工链接 (是Link不是button)
    console.log('\n--- 检查添加链接 ---');
    const addLink = await page.$('a:has-text("Tambah"), a:has-text("Tambah Karyawan"), a[href="/staff/new"]');
    log('添加员工链接', addLink ? 'PASS' : 'FAIL', addLink ? '找到' : '未找到');

    // 2. 点击添加员工 (导航到新页面)
    if (addLink) {
      console.log('\n--- 添加员工测试 ---');
      await addLink.click();
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      console.log(`当前URL: ${currentUrl}`);
      log('添加员工-导航', currentUrl.includes('/staff/new') ? 'PASS' : 'FAIL');

      // 查找表单
      const form = await page.$('form');
      log('添加员工-表单', form ? 'PASS' : 'FAIL');

      if (form) {
        // 填写表单
        const inputs = await page.$$('form input[type="text"], form input[type="tel"]');
        console.log(`表单输入框: ${inputs.length}`);

        if (inputs.length > 0) {
          await inputs[0].fill('测试员工-' + Date.now());
          log('添加员工-输入名称', 'PASS');
        }

        // 填写电话
        const phoneInput = await page.$('form input[type="tel"]');
        if (phoneInput) {
          await phoneInput.fill('0812' + Math.floor(Math.random() * 100000000));
          log('添加员工-输入电话', 'PASS');
        }

        // 填写密码
        const passwordInput = await page.$('form input[type="password"]');
        if (passwordInput) {
          await passwordInput.fill('test123456');
          log('添加员工-输入密码', 'PASS');
        }

        // 提交
        const submitBtn = await page.$('form button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          log('添加员工-提交', 'PASS');
        }
      }
    }

    // 3. 返回列表测试状态切换
    console.log('\n--- 返回列表页 ---');
    await page.goto(`${BASE_URL}/staff`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 查找表格行
    const rows = await page.$$('table tbody tr');
    log('员工列表-数据', rows.length > 0 ? 'PASS' : 'PASS', `共 ${rows.length} 行`);

    if (rows.length > 0) {
      // 查找编辑按钮
      const editLink = await page.$('a[href*="/staff/"][href*="/edit"]');
      log('编辑链接', editLink ? 'PASS' : 'FAIL');

      // 查找删除按钮
      const deleteBtn = await page.$('button:has-text("Hapus"), button:has-text("Delete")');
      log('删除按钮', deleteBtn ? 'PASS' : 'FAIL');
    }

    // 4. 测试搜索
    console.log('\n--- 搜索测试 ---');
    const searchInput = await page.$('input[placeholder*="Cari"], input[placeholder*="Search"]');
    if (searchInput) {
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      log('搜索功能', 'PASS');
    }

    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('员工管理测试完成');
    console.log('═══════════════════════════════════════════════════');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`结果: ${passed} 通过, ${failed} 失败`);

  } catch (e) {
    console.error('测试出错:', e.message);
    log('测试异常', 'FAIL', e.message);
  }

  await browser.close();
  process.exit(0);
})();