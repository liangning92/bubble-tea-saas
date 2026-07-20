const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];

  function log(name, status, error = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${status}${error ? ' - ' + error : ''}`);
    results.push({ name, status, error });
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       全面测试营销模块所有创建表单                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // 测试用例：表单URL、填写方式
  const tests = [
    {
      name: '优惠券(/new)',
      url: '/marketing/promotions/coupons/new',
      fills: [
        { sel: 'input[placeholder="DISCOUNT10"]', val: 'TEST' + Date.now() },
        { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' },
        { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }
      ],
      submitBtn: 'button.btn-primary'
    },
    {
      name: '活动(/new)',
      url: '/marketing/promotions/campaigns/new',
      fills: [
        { sel: 'input[type="text"]', val: '测试活动' + Date.now() },
        { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' },
        { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }
      ],
      submitBtn: 'button.btn-primary'
    },
    {
      name: '促销类别(弹窗)',
      url: '/marketing/promotions/campaign-categories',
      modal: true,
      addBtnText: 'Tambah',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试' + Date.now() }
      ],
      submitBtn: '[class*="fixed"] button:has-text("Simpan")'
    },
    {
      name: '推荐(弹窗)',
      url: '/marketing/promotions/referrals',
      modal: true,
      addBtnText: 'Buat',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试' + Date.now() }
      ],
      submitBtn: '[class*="fixed"] button:has-text("Simpan")'
    },
    {
      name: '自动化规则(弹窗)',
      url: '/marketing/operations/automation/rules',
      modal: true,
      addBtnText: 'addAutomationRule',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试' + Date.now() }
      ],
      submitBtn: '[class*="fixed"] button:has-text("Simpan")'
    },
    {
      name: '消息渠道(弹窗)',
      url: '/marketing/messages/settings',
      modal: true,
      addBtnText: 'Tambah Channel',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试' + Date.now() }
      ],
      submitBtn: '[class*="fixed"] button:has-text("Simpan")'
    },
    {
      name: '消息模板(弹窗)',
      url: '/marketing/messages/settings',
      modal: true,
      addBtnText: 'Tambah Template',
      fills: [
        { sel: '[class*="fixed"] input[type="text"]', val: '测试' + Date.now() }
      ],
      submitBtn: '[class*="fixed"] button:has-text("Simpan")'
    },
    {
      name: '积分规则(弹窗)',
      url: '/marketing/points',
      modal: true,
      addBtnText: 'Atur',
      fills: [
        { sel: '[class*="fixed"] input[type="number"]', val: '10000' }
      ],
      submitBtn: '[class*="fixed"] button:has-text("Simpan")'
    }
  ];

  for (const test of tests) {
    console.log(`\n【${test.name}】`);
    let lastApi = null;

    // 清除之前的监听器
    page.removeAllListeners('response');

    page.on('response', async r => {
      if (r.url().includes('/api/') && r.request().method() === 'POST') {
        try {
          const body = await r.json();
          lastApi = { status: r.status(), body };
        } catch {
          lastApi = { status: r.status(), body: null };
        }
      }
    });

    try {
      await page.goto(`${BASE_URL}${test.url}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      // 如果是弹窗表单，先打开弹窗
      if (test.modal && test.addBtnText) {
        // 关闭可能存在的遮罩
        const overlay = await page.$('[class*="fixed"][class*="inset-0"]');
        if (overlay) {
          const closeBtn = await page.$('[class*="fixed"] button[class*="ghost"], [class*="fixed"] button:has-text("×"), [class*="fixed"] button[class*="x"]');
          if (closeBtn) await closeBtn.click();
          await page.waitForTimeout(500);
        }

        // 点击添加按钮 - 使用部分匹配
        const addBtn = await page.$(`button:has-text("${test.addBtnText}")`);
        if (addBtn) {
          await addBtn.click();
          await page.waitForTimeout(1500);
        } else {
          log(test.name, 'FAIL', '添加按钮未找到');
          continue;
        }
      }

      // 填写表单
      for (const fill of test.fills) {
        const input = await page.$(fill.sel);
        if (input) {
          await input.fill(fill.val);
        }
      }

      await page.waitForTimeout(500);

      // 点击保存按钮
      const saveBtn = await page.$(test.submitBtn);
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForTimeout(3000);
      }

      // 分析结果
      if (lastApi) {
        if (lastApi.status >= 200 && lastApi.status < 300) {
          log(test.name, 'PASS', `API ${lastApi.status}`);
        } else if (lastApi.body?.errors) {
          const err = lastApi.body.errors[0];
          log(test.name, 'FAIL', `${err.field}: ${err.message}`);
        } else if (lastApi.body?.error) {
          log(test.name, 'FAIL', lastApi.body.error);
        } else {
          log(test.name, 'FAIL', `API ${lastApi.status}`);
        }
      } else {
        log(test.name, 'FAIL', '无API响应');
      }

    } catch (e) {
      log(test.name, 'FAIL', e.message.substring(0, 50));
    }
  }

  // 总结
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                       测试总结                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  结果                                                      │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`│  ${icon} ${r.name.padEnd(40)} ${r.error || ''}`);
  });
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log(`│  通过: ${passed}, 失败: ${failed}                                           │`);
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  await browser.close();
  process.exit(0);
})();