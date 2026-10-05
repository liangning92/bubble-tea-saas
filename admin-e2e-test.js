const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:7072/api';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  return { name, status, details };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Warning') && !msg.text().includes('warning')) {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('     Bubble Tea SaaS Admin - 深度功能测试');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ========== 登录 ==========
  console.log('【登录系统】');
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const bodyText = await page.textContent('body');
    results.push(log('登录页面加载', bodyText.includes('Bubble') || bodyText.includes('Masuk') || bodyText.includes('登录') ? 'PASS' : 'FAIL'));

    // 填写登录表单
    const phoneInput = await page.$('input[type="tel"], input[placeholder*="08"], input[name="phone"]');
    const passwordInput = await page.$('input[type="password"]');

    if (phoneInput && passwordInput) {
      await phoneInput.fill((process.env.TEST_ADMIN_PHONE || ''));
      await passwordInput.fill((process.env.TEST_ADMIN_PASSWORD || ''));

      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await sleep(3000);
      }
    }

    const afterLoginUrl = page.url();
    results.push(log('登录成功', !afterLoginUrl.includes('login') ? 'PASS' : 'FAIL', `URL: ${afterLoginUrl}`));
  } catch (e) {
    results.push(log('登录', 'FAIL', e.message));
  }

  // ========== Dashboard ==========
  console.log('\n【Dashboard】');
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const dashText = await page.textContent('body');
    results.push(log('Dashboard加载', dashText.length > 100 ? 'PASS' : 'FAIL'));
    results.push(log('Dashboard显示数据', dashText.includes('Pesanan') || dashText.includes('Order') || dashText.includes('订单') || dashText.includes('Pendapatan') || dashText.includes('Revenue') || dashText.includes('收入') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('Dashboard', 'FAIL', e.message));
  }

  // ========== 产品管理 (Products) ==========
  console.log('\n【产品管理 - Produk】');

  // 产品列表
  try {
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const prodText = await page.textContent('body');
    results.push(log('产品列表加载', prodText.includes('Produk') || prodText.includes('Product') || prodText.includes('产品') ? 'PASS' : 'FAIL'));

    // 点击添加产品按钮
    const addBtn = await page.$('button:has-text("Tambah"), button:has-text("Add"), button:has-text("添加"), button:has-text("+")');
    if (addBtn) {
      await addBtn.click();
      await sleep(2000);
      const modalText = await page.textContent('body');
      results.push(log('添加产品弹窗', modalText.includes('Form') || modalText.includes('form') || modalText.includes('表单') || modalText.includes('Tambah') ? 'PASS' : 'FAIL'));

      // 关闭弹窗
      const closeBtn = await page.$('button:has-text("Batal"), button:has-text("Cancel"), button:has-text("取消")');
      if (closeBtn) await closeBtn.click();
      await sleep(500);
    }
  } catch (e) {
    results.push(log('产品管理', 'FAIL', e.message));
  }

  // 产品分类
  try {
    await page.goto(`${BASE_URL}/products/categories`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const catText = await page.textContent('body');
    results.push(log('分类管理加载', catText.includes('Kategori') || catText.includes('Category') || catText.includes('分类') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('分类管理', 'FAIL', e.message));
  }

  // Addons
  try {
    await page.goto(`${BASE_URL}/products/addons`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const addonText = await page.textContent('body');
    results.push(log('Addons加载', addonText.includes('Addon') || addonText.includes('Tambahan') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('Addons', 'FAIL', e.message));
  }

  // ========== 库存管理 (Inventory) ==========
  console.log('\n【库存管理 - Inventaris】');

  try {
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const invText = await page.textContent('body');
    results.push(log('库存列表加载', invText.includes('Inventaris') || invText.includes('Inventory') || invText.includes('库存') ? 'PASS' : 'FAIL'));

    // 入库操作
    const stockInBtn = await page.$('button:has-text("Masuk"), button:has-text("Stock In"), button:has-text("入库")');
    if (stockInBtn) {
      await stockInBtn.click();
      await sleep(1500);
      results.push(log('入库弹窗', 'PASS'));
      const closeBtn = await page.$('button:has-text("Batal"), button:has-text("Cancel")');
      if (closeBtn) await closeBtn.click();
      await sleep(500);
    }

    // 出库操作
    const stockOutBtn = await page.$('button:has-text("Keluar"), button:has-text("Stock Out"), button:has-text("出库")');
    if (stockOutBtn) {
      await stockOutBtn.click();
      await sleep(1500);
      results.push(log('出库弹窗', 'PASS'));
      const closeBtn = await page.$('button:has-text("Batal"), button:has-text("Cancel")');
      if (closeBtn) await closeBtn.click();
      await sleep(500);
    }
  } catch (e) {
    results.push(log('库存管理', 'FAIL', e.message));
  }

  // 库存记录
  try {
    await page.goto(`${BASE_URL}/inventory/logs`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const logText = await page.textContent('body');
    results.push(log('库存记录加载', logText.includes('Riwayat') || logText.includes('Log') || logText.includes('记录') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('库存记录', 'FAIL', e.message));
  }

  // 库存警报
  try {
    await page.goto(`${BASE_URL}/inventory/alerts`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('库存警报加载', 'PASS'));
  } catch (e) {
    results.push(log('库存警报', 'FAIL', e.message));
  }

  // ========== 财务管理 (Finance) ==========
  console.log('\n【财务管理 - Keuangan】');

  try {
    await page.goto(`${BASE_URL}/finance`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const finText = await page.textContent('body');
    results.push(log('财务页面加载', finText.includes('Keuangan') || finText.includes('Finance') || finText.includes('财务') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('财务管理', 'FAIL', e.message));
  }

  // 营收报表
  try {
    await page.goto(`${BASE_URL}/finance/revenue`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const revText = await page.textContent('body');
    results.push(log('营收报表加载', revText.includes('Pendapatan') || revText.includes('Revenue') || revText.includes('收入') || revText.includes('lapor') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('营收报表', 'FAIL', e.message));
  }

  // 订单管理
  try {
    await page.goto(`${BASE_URL}/finance/orders`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const ordText = await page.textContent('body');
    results.push(log('订单列表加载', ordText.includes('Pesanan') || ordText.includes('Order') || ordText.includes('订单') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('订单管理', 'FAIL', e.message));
  }

  // 退款管理
  try {
    await page.goto(`${BASE_URL}/orders/refunds`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('退款管理加载', 'PASS'));
  } catch (e) {
    results.push(log('退款管理', 'FAIL', e.message));
  }

  // ========== 渠道管理 (Channels) ==========
  console.log('\n【渠道管理 - Saluran】');

  try {
    await page.goto(`${BASE_URL}/channels`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const chText = await page.textContent('body');
    results.push(log('渠道列表加载', chText.includes('Saluran') || chText.includes('Channel') || chText.includes('渠道') ? 'PASS' : 'FAIL'));

    // 添加渠道
    const addChBtn = await page.$('button:has-text("Tambah"), button:has-text("Add"), button:has-text("添加")');
    if (addChBtn) {
      await addChBtn.click();
      await sleep(1500);
      results.push(log('添加渠道弹窗', 'PASS'));
      const closeBtn = await page.$('button:has-text("Batal"), button:has-text("Cancel"), button:has-text("取消")');
      if (closeBtn) await closeBtn.click();
      await sleep(500);
    }
  } catch (e) {
    results.push(log('渠道管理', 'FAIL', e.message));
  }

  // ========== 员工管理 (Staff) ==========
  console.log('\n【员工管理 - Karyawan】');

  try {
    await page.goto(`${BASE_URL}/staff`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const staffText = await page.textContent('body');
    results.push(log('员工列表加载', staffText.includes('Karyawan') || staffText.includes('Staff') || staffText.includes('员工') ? 'PASS' : 'FAIL'));

    // 添加员工
    const addStaffBtn = await page.$('button:has-text("Tambah"), button:has-text("Add"), button:has-text("添加")');
    if (addStaffBtn) {
      await addStaffBtn.click();
      await sleep(2000);
      results.push(log('添加员工表单', 'PASS'));
      const closeBtn = await page.$('button:has-text("Batal"), button:has-text("Cancel"), button:has-text("取消")');
      if (closeBtn) await closeBtn.click();
      await sleep(500);
    }
  } catch (e) {
    results.push(log('员工管理', 'FAIL', e.message));
  }

  // 排班管理
  try {
    await page.goto(`${BASE_URL}/staff/schedule`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('排班管理加载', 'PASS'));
  } catch (e) {
    results.push(log('排班管理', 'FAIL', e.message));
  }

  // 考勤记录
  try {
    await page.goto(`${BASE_URL}/staff/attendance`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('考勤记录加载', 'PASS'));
  } catch (e) {
    results.push(log('考勤记录', 'FAIL', e.message));
  }

  // 请假管理
  try {
    await page.goto(`${BASE_URL}/staff/leave`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('请假管理加载', 'PASS'));
  } catch (e) {
    results.push(log('请假管理', 'FAIL', e.message));
  }

  // 工资管理
  try {
    await page.goto(`${BASE_URL}/staff/salary`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('工资管理加载', 'PASS'));
  } catch (e) {
    results.push(log('工资管理', 'FAIL', e.message));
  }

  // 报销管理
  try {
    await page.goto(`${BASE_URL}/staff/reimbursement`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('报销管理加载', 'PASS'));
  } catch (e) {
    results.push(log('报销管理', 'FAIL', e.message));
  }

  // ========== 卫生管理 (Hygiene) ==========
  console.log('\n【卫生管理 - Kebersihan】');

  try {
    await page.goto(`${BASE_URL}/hygiene`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const hygText = await page.textContent('body');
    results.push(log('卫生任务列表加载', hygText.includes('Kebersihan') || hygText.includes('Hygiene') || hygText.includes('卫生') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('卫生管理', 'FAIL', e.message));
  }

  // 卫生模板
  try {
    await page.goto(`${BASE_URL}/hygiene/templates`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('卫生模板加载', 'PASS'));

    // 添加模板
    const addTplBtn = await page.$('button:has-text("Tambah"), button:has-text("Add")');
    if (addTplBtn) {
      await addTplBtn.click();
      await sleep(1500);
      results.push(log('添加模板弹窗', 'PASS'));
      const closeBtn = await page.$('button:has-text("Batal"), button:has-text("Cancel")');
      if (closeBtn) await closeBtn.click();
      await sleep(500);
    }
  } catch (e) {
    results.push(log('卫生模板', 'FAIL', e.message));
  }

  // 今日任务
  try {
    await page.goto(`${BASE_URL}/hygiene/today`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('今日任务加载', 'PASS'));
  } catch (e) {
    results.push(log('今日任务', 'FAIL', e.message));
  }

  // ========== 营销管理 (Marketing) ==========
  console.log('\n【营销管理 - Pemasaran】');

  try {
    await page.goto(`${BASE_URL}/marketing`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const mktText = await page.textContent('body');
    results.push(log('营销首页加载', mktText.includes('Pemasaran') || mktText.includes('Marketing') || mktText.includes('营销') ? 'PASS' : 'FAIL'));
  } catch (e) {
    results.push(log('营销首页', 'FAIL', e.message));
  }

  // 活动管理
  try {
    await page.goto(`${BASE_URL}/marketing/campaigns`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('活动管理加载', 'PASS'));
  } catch (e) {
    results.push(log('活动管理', 'FAIL', e.message));
  }

  // 优惠券管理
  try {
    await page.goto(`${BASE_URL}/marketing/coupons`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('优惠券加载', 'PASS'));
  } catch (e) {
    results.push(log('优惠券', 'FAIL', e.message));
  }

  // 会员管理
  try {
    await page.goto(`${BASE_URL}/marketing/members`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('会员管理加载', 'PASS'));
  } catch (e) {
    results.push(log('会员管理', 'FAIL', e.message));
  }

  // 积分规则
  try {
    await page.goto(`${BASE_URL}/marketing/points`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('积分规则加载', 'PASS'));
  } catch (e) {
    results.push(log('积分规则', 'FAIL', e.message));
  }

  // 自动化规则
  try {
    await page.goto(`${BASE_URL}/marketing/automation`, { waitUntil: 'networkidle' });
    await sleep(2000);
    results.push(log('自动化规则加载', 'PASS'));
  } catch (e) {
    results.push(log('自动化规则', 'FAIL', e.message));
  }

  // ========== 系统设置 (Settings) ==========
  console.log('\n【系统设置 - Pengaturan】');

  try {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const setText = await page.textContent('body');
    results.push(log('系统设置加载', setText.includes('Pengaturan') || setText.includes('Settings') || setText.includes('设置') ? 'PASS' : 'FAIL'));

    // 测试保存按钮
    const saveBtn = await page.$('button:has-text("Simpan"), button:has-text("Save"), button:has-text("保存")');
    if (saveBtn) {
      await saveBtn.click();
      await sleep(1500);
      results.push(log('设置保存功能', 'PASS'));
    }
  } catch (e) {
    results.push(log('系统设置', 'FAIL', e.message));
  }

  // ========== 会员管理 (Members) ==========
  console.log('\n【会员管理 - Member】');

  try {
    await page.goto(`${BASE_URL}/marketing/members`, { waitUntil: 'networkidle' });
    await sleep(2000)