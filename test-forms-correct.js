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

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       营销模块表单测试 - 列表页弹窗模式                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  async function testListPageForm(name, url, addBtnText, fillSelector, fillValue) {
    let lastApi = null;
    page.on('response', async r => {
      if (r.url().includes('/api/') && r.request().method() === 'POST') {
        lastApi = { status: r.status(), body: await r.json().catch(() => null) };
      }
    });

    try {
      await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      // Click add button
      const addBtn = await page.$(`button:has-text("${addBtnText}")`);
      if (!addBtn) {
        log(name, 'FAIL', '未找到添加按钮');
        return;
      }
      await addBtn.click();
      await page.waitForTimeout(1500);

      // Check modal opened
      const modal = await page.$('[class*="fixed"]');
      if (!modal) {
        log(name, 'FAIL', '弹窗未打开');
        return;
      }

      // Fill form - try different selectors
      const input = await page.$(fillSelector);
      if (input) {
        await input.fill(fillValue);
      } else {
        // Try finding any text input in modal
        const modalInput = await page.$('[class*="fixed"] input[type="text"]');
        if (modalInput) {
          await modalInput.fill(fillValue);
        }
      }

      await page.waitForTimeout(500);

      // Click save button in modal
      const saveBtn = await page.$('[class*="fixed"] button:has-text("Simpan"), [class*="fixed"] button.btn-primary');
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
      }

      if (lastApi?.status === 201) {
        log(name, 'PASS', `API: 201`);
      } else if (lastApi?.body?.errors) {
        log(name, 'FAIL', `${lastApi.body.errors[0]?.field}: ${lastApi.body.errors[0]?.message}`);
      } else {
        log(name, 'FAIL', `API: ${lastApi?.status || '无响应'}`);
      }
    } catch (e) {
      log(name, 'FAIL', e.message.substring(0, 50));
    }
  }

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // ========== 测试各表单 ==========

  // 1. 促销类别
  console.log('【1. 促销类别】');
  await testListPageForm(
    '促销类别',
    '/marketing/promotions/campaign-categories',
    'Tambah',
    '[class*="fixed"] input[type="text"]',
    '测试类别' + Date.now()
  );

  // 2. 自动化规则
  console.log('【2. 自动化规则】');
  await testListPageForm(
    '自动化规则',
    '/marketing/operations/automation/rules',
    'addAutomationRule', // use translation key or partial match
    '[class*="fixed"] input[type="text"]',
    '测试规则' + Date.now()
  );

  // 3. 积分规则
  console.log('【3. 积分规则】');
  await testListPageForm(
    '积分规则',
    '/marketing/points',
    'Atur',
    '[class*="fixed"] input[type="text"]',
    '测试积分' + Date.now()
  );

  // 4. 消息渠道
  console.log('【4. 消息渠道】');
  await testListPageForm(
    '消息渠道',
    '/marketing/messages/settings',
    'Buat',
    '[class*="fixed"] input[type="text"]',
    '测试渠道' + Date.now()
  );

  // ========== 总结 ==========
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                       测试总结                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`通过: ${passed}, 失败: ${failed}`);

  await browser.close();
  process.exit(0);
})();