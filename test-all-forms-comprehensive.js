const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       全面测试所有营销表单保存功能                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const testPages = [
    // 优惠券列表页弹窗
    {
      name: '优惠券列表弹窗',
      url: '/marketing/promotions/coupons',
      addBtn: 'button:has-text("Tambah")',
      fills: [
        { sel: 'input[placeholder="DISCOUNT10"]', val: 'TEST' + Date.now() }
      ],
      dateFills: 'input[type="date"]'
    },
    // 活动列表弹窗
    {
      name: '活动列表弹窗',
      url: '/marketing/promotions/campaigns',
      addBtn: 'button:has-text("Buat Kampanye")',
      fills: [
        { sel: 'input[type="text"]', val: '测试活动' + Date.now() }
      ],
      dateFills: 'input[type="date"]'
    },
    // 促销类别弹窗
    {
      name: '促销类别弹窗',
      url: '/marketing/promotions/campaign-categories',
      addBtn: 'button:has-text("Tambah")',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试' + Date.now() }
      ],
      dateFills: null
    },
    // 消息渠道弹窗
    {
      name: '消息渠道弹窗',
      url: '/marketing/messages/settings',
      addBtn: 'button:has-text("Tambah Channel")',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试渠道' + Date.now() }
      ],
      dateFills: null
    },
    // 自动化规则弹窗
    {
      name: '自动化规则弹窗',
      url: '/marketing/operations/automation/rules',
      addBtn: 'button:has-text("Tambah")',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试规则' + Date.now() }
      ],
      dateFills: null
    }
  ];

  for (const test of testPages) {
    console.log(`\n【${test.name}】`);
    let apiResult = null;

    page.on('response', async r => {
      if (r.url().includes('/api/marketing') && r.request().method() === 'POST') {
        try {
          const body = await r.json();
          apiResult = { status: r.status(), body };
        } catch { apiResult = { status: r.status() }; }
      }
    });

    try {
      await page.goto(`${BASE_URL}${test.url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      // 关闭可能存在的遮罩
      const overlay = await page.$('[class*="fixed"][class*="bg-black"]');
      if (overlay) {
        const closeBtn = await page.$('[class*="fixed"] button[class*="ghost"]');
        if (closeBtn) await closeBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // 点击添加按钮
      const btn = await page.$(test.addBtn);
      if (!btn) {
        console.log(`  ❌ 添加按钮未找到`);
        continue;
      }
      await btn.click({ force: true });
      await page.waitForTimeout(1500);

      // 填写表单
      for (const fill of test.fills) {
        const input = await page.$(fill.sel);
        if (input) await input.fill(fill.val);
      }

      // 填写日期
      if (test.dateFills) {
        const dates = await page.$$(test.dateFills);
        if (dates.length >= 2) {
          await dates[0].fill('2026-06-23');
          await dates[1].fill('2026-12-31');
        }
      }

      await page.waitForTimeout(500);

      // 点击保存
      const saveBtn = await page.$('[class*="fixed"] button:has-text("Simpan"), button[type="submit"]');
      if (saveBtn) {
        const disabled = await saveBtn.getAttribute('disabled');
        if (disabled !== null) {
          console.log(`  ⚠️ 保存按钮仍disabled (验证生效)`);
        } else {
          await saveBtn.click({ force: true });
          await page.waitForTimeout(3000);
        }
      }

      // 结果
      if (apiResult?.status === 201) {
        console.log(`  ✅ API 201 成功`);
      } else if (apiResult?.body?.errors) {
        const err = apiResult.body.errors[0];
        console.log(`  ❌ API ${apiResult?.status || '无响应'} - ${err.field}: ${err.message}`);
      } else {
        console.log(`  ⚠️ API ${apiResult?.status || '无响应'}`);
      }

    } catch (e) {
      console.log(`  ❌ 异常: ${e.message.substring(0, 50)}`);
    }

    page.removeAllListeners('response');
  }

  console.log('\n\n=== 测试完成 ===\n');
  await browser.close();
})();