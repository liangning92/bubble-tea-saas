const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 测试列表页弹窗表单 ===\n');

  // 监听所有API响应
  page.on('response', async response => {
    if (response.url().includes('/api/') && response.request().method() === 'POST') {
      const status = response.status();
      let body = null;
      try { body = await response.json(); } catch {}
      console.log(`\nAPI: ${status} ${response.url().split('/').pop()}`);
      if (body?.errors) console.log(`错误: ${JSON.stringify(body.errors)}`);
      if (body?.message) console.log(`消息: ${body.message}`);
    }
  });

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // ========== 优惠券列表页弹窗 ==========
  console.log('\n===== 优惠券列表页弹窗 =====');
  await page.goto(`${BASE_URL}/marketing/promotions/coupons`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 点击添加按钮 (不在header，是在列表上方的按钮)
  const addBtns = await page.$$('button');
  let addBtn = null;
  for (const btn of addBtns) {
    const text = await btn.innerText();
    if (text.includes('Tambah') || text.includes('Buat')) {
      addBtn = btn;
      break;
    }
  }

  if (addBtn) {
    console.log('点击添加按钮...');
    await addBtn.click();
    await page.waitForTimeout(1500);

    // 填写表单 - 代码是必填的
    await page.fill('input[placeholder="DISCOUNT10"]', 'TEST' + Date.now());

    // 填写日期 (如果存在)
    const dates = await page.$$('input[type="date"]');
    console.log(`日期输入框: ${dates.length}`);
    if (dates.length >= 2) {
      await dates[0].fill('2026-06-23');
      await dates[1].fill('2026-12-31');
    }

    // 点击保存
    const saveBtn = await page.$('button[type="submit"], button:has-text("Simpan")');
    if (saveBtn) {
      console.log('点击保存...');
      await saveBtn.click();
      await page.waitForTimeout(3000);
    }

    console.log(`URL: ${page.url()}`);
    console.log(`结果: ${page.url().includes('/coupons') && !page.url().includes('/new') ? '成功' : '需检查'}`);
  } else {
    console.log('未找到添加按钮');
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log(`页面内容: ${pageText.substring(0, 300)}`);
  }

  // ========== 活动列表页弹窗 ==========
  console.log('\n\n===== 活动列表页弹窗 =====');
  await page.goto(`${BASE_URL}/marketing/promotions/campaigns`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 查找添加按钮
  const campAddBtns = await page.$$('button');
  let campAddBtn = null;
  for (const btn of campAddBtns) {
    const text = await btn.innerText();
    if (text.includes('Tambah') || text.includes('Buat') || text.includes('Kampanye')) {
      campAddBtn = btn;
      console.log(`找到按钮: "${text}"`);
      break;
    }
  }

  if (campAddBtn) {
    await campAddBtn.click();
    await page.waitForTimeout(1500);

    // 填写名称
    const campInputs = await page.$$('input[type="text"]');
    if (campInputs.length > 0) {
      await campInputs[0].fill('测试活动' + Date.now());
    }

    // 填写日期
    const campDates = await page.$$('input[type="date"]');
    if (campDates.length >= 2) {
      await campDates[0].fill('2026-06-23');
      await campDates[1].fill('2026-12-31');
    }

    // 点击保存
    const campSaveBtn = await page.$('button:has-text("Simpan")');
    if (campSaveBtn) {
      console.log('点击保存...');
      await campSaveBtn.click();
      await page.waitForTimeout(3000);
    }

    console.log(`URL: ${page.url()}`);
  }

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})();