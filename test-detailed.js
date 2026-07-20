const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 详细检查每个表单 ===\n');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // ========== 优惠券 ==========
  console.log('【优惠券列表页】');
  await page.goto(`${BASE_URL}/marketing/promotions/coupons`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const btns = await page.$$('button');
  console.log(`按钮总数: ${btns.length}`);
  for (let i = 0; i < btns.length; i++) {
    const t = await btns[i].innerText();
    if (t.trim()) console.log(`  [${i}] "${t}"`);
  }

  // ========== 自动化规则 ==========
  console.log('\n【自动化规则】');
  await page.goto(`${BASE_URL}/marketing/operations/automation/rules`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  let apiResult = null;
  page.on('response', async r => {
    if (r.url().includes('/api/') && r.request().method() === 'POST') {
      try {
        const body = await r.json();
        apiResult = { status: r.status(), body };
      } catch {}
    }
  });

  const autoBtns = await page.$$('button');
  console.log(`按钮总数: ${autoBtns.length}`);
  for (let i = 0; i < Math.min(autoBtns.length, 10); i++) {
    const t = await autoBtns[i].innerText();
    if (t.trim()) console.log(`  [${i}] "${t}"`);
  }

  // 点击添加
  const tambahBtn = await page.$('button:has-text("Tambah")');
  if (tambahBtn) {
    await tambahBtn.click();
    await page.waitForTimeout(1500);

    const modalInputs = await page.$$('[class*="fixed"] input[type="text"]');
    console.log(`弹窗内输入框: ${modalInputs.length}`);

    if (modalInputs.length > 0) {
      await modalInputs[0].fill('测试规则' + Date.now());
    }

    await page.waitForTimeout(500);
    const saveBtn = await page.$('[class*="fixed"] button:has-text("Simpan")');
    if (saveBtn) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(3000);
    }
  }

  if (apiResult) {
    console.log(`API: ${apiResult.status}`);
    if (apiResult.body?.errors) console.log(`错误: ${JSON.stringify(apiResult.body.errors)}`);
  }

  console.log('\n=== 完成 ===');
  await browser.close();
})();