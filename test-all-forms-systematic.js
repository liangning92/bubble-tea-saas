const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const apiErrors = [];

  function log(name, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
    results.push({ name, status, details });
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       全系统表单保存测试 - 找出所有无法保存的问题            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  try {
    // 登录
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 获取storeId
    const storeId = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.user?.storeId;
    });
    console.log(`StoreId: ${storeId}\n`);

    // ========== 测试各种表单创建 ==========

    const tests = [
      // 营销模块
      { name: '优惠券', url: '/marketing/promotions/coupons/new', fills: [
        { sel: 'input[placeholder="DISCOUNT10"]', val: 'TEST' + Date.now() },
        { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' },
        { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }
      ]},
      { name: '活动Campaign', url: '/marketing/promotions/campaigns/new', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试活动' + Date.now() },
        { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' },
        { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }
      ]},
      { name: '自动化规则', url: '/marketing/automation/rules/new', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试规则' + Date.now() }
      ]},
      { name: '促销类别', url: '/marketing/promotions/campaign-categories/new', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试类别' + Date.now() }
      ]},
      { name: '推荐活动', url: '/marketing/promotions/referrals/new', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试推荐' + Date.now() }
      ]},
      { name: '积分规则', url: '/marketing/points/rules/new', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试规则' + Date.now() }
      ]},
      // 产品模块
      { name: '产品分类', url: '/products/categories', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试分类' + Date.now() }
      ], isModal: true, modalBtn: 'button:has-text("Tambah")' },
      { name: 'Addons', url: '/products/addons', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试Addon' + Date.now() }
      ], isModal: true, modalBtn: 'button:has-text("Tambah")' },
      // 库存模块
      { name: '库存项', url: '/inventory', fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试库存' + Date.now() },
        { sel: '[class*="fixed"] input[type="number"]:first-of-type', val: '100' }
      ], isModal: true, modalBtn: 'button:has-text("Tambah")' },
      // 卫生管理
      { name: '卫生区域', url: '/hygiene/areas', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试区域' + Date.now() }
      ], isModal: true, modalBtn: 'button:has-text("Tambah")' },
      // 消息设置
      { name: '消息渠道', url: '/marketing/messages/settings', fills: [
        { sel: 'input[type="text"]:first-of-type', val: '测试渠道' + Date.now() }
      ], isModal: true, modalBtn: 'button:has-text("Tambah")' },
    ];

    for (const test of tests) {
      console.log(`\n【${test.name}】 ${test.url}`);
      apiErrors.length = 0;

      // 监听API响应
      let lastApiResult = null;
      page.on('response', async response => {
        if (response.url().includes('/api/') && response.request().method() === 'POST') {
          try {
            const body = await response.json();
            lastApiResult = { status: response.status(), body, url: response.url() };
          } catch {
            lastApiResult = { status: response.status(), url: response.url() };
          }
        }
      });

      try {
        await page.goto(`${BASE_URL}${test.url}`, { waitUntil: 'networkidle', timeout: 10000 });
        await page.waitForTimeout(1500);

        // 如果是弹窗表单，先打开弹窗
        if (test.isModal && test.modalBtn) {
          const btn = await page.$(test.modalBtn);
          if (btn) await btn.click();
          await page.waitForTimeout(1000);
        }

        // 填写表单
        for (const fill of test.fills) {
          const input = await page.$(fill.sel);
          if (input) {
            await input.fill(fill.val);
          }
        }

        await page.waitForTimeout(500);

        // 点击保存
        let saveBtn;
        if (test.isModal) {
          saveBtn = await page.$('[class*="fixed"] button.btn-primary, [class*="fixed"] button:has-text("Simpan")');
        } else {
          saveBtn = await page.$('button.btn-primary');
        }

        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(2000);
        }

        // 分析结果
        if (lastApiResult) {
          if (lastApiResult.status >= 200 && lastApiResult.status < 300) {
            log(test.name, 'PASS', `API ${lastApiResult.status}`);
          } else if (lastApiResult.body?.errors) {
            const errMsg = lastApiResult.body.errors.map(e => `${e.field}:${e.message}`).join(', ');
            log(test.name, 'FAIL', errMsg);
            apiErrors.push({ name: test.name, error: lastApiResult.body.errors });
          } else {
            log(test.name, 'FAIL', `API ${lastApiResult.status}`);
          }
        } else {
          log(test.name, 'FAIL', '无API响应');
        }

      } catch (e) {
        log(test.name, 'FAIL', e.message.substring(0, 50));
      }
    }

    // ========== 总结 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                       测试总结                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log(`通过: ${passed}, 失败: ${failed}\n`);

    if (failed > 0) {
      console.log('┌─────────────────────────────────────────────────────┐');
      console.log('│  失败的表单及错误                                    │');
      console.log('├─────────────────────────────────────────────────────┤');
      apiErrors.forEach(err => {
        console.log(`│  ${err.name.padEnd(15)} │ ${err.error[0]?.field}: ${err.error[0]?.message}`);
      });
      console.log('└─────────────────────────────────────────────────────┘');
    }

  } catch (e) {
    console.error('异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();