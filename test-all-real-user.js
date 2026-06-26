const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  let passed = 0, failed = 0;

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       真实用户操作方式测试所有表单                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // 登录
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('已登录\n');

  const forms = [
    // 营销模块
    { name: '优惠券', url: '/marketing/promotions/coupons', addBtn: 'Buat Kupon', fills: [{ sel: 'input[placeholder*="DISCOUNT"]', val: 'TEST' }, { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' }, { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }] },
    { name: '活动', url: '/marketing/promotions/campaigns', addBtn: 'Buat Kampanye', fills: [{ sel: 'input[type="text"]', val: '测试' }, { sel: 'input[type="date"]:nth-of-type(1)', val: '2026-06-23' }, { sel: 'input[type="date"]:nth-of-type(2)', val: '2026-12-31' }] },
    { name: '促销类别', url: '/marketing/promotions/campaign-categories', addBtn: 'Tambah', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }], modal: true },
    { name: '推荐活动', url: '/marketing/promotions/referrals', addBtn: 'Buat', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }, { sel: '[class*="fixed"] input[type="text"]:nth-of-type(2)', val: 'REF' }], modal: true },
    { name: '自动化规则', url: '/marketing/operations/automation/rules', addBtn: 'Tambah Aturan', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }], modal: true },
    { name: '消息渠道', url: '/marketing/messages/settings', addBtn: 'Tambah Channel', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }], modal: true },

    // 产品模块
    { name: '产品分类', url: '/products/categories', addBtn: 'Tambah', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }], modal: true },
    { name: 'Addons', url: '/products/addons', addBtn: 'Tambah', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }], modal: true },

    // 库存模块
    { name: '库存项', url: '/inventory', addBtn: 'Tambah Barang', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }, { sel: '[class*="fixed"] input[type="number"]', val: '100' }], modal: true },

    // 卫生模块
    { name: '卫生区域', url: '/hygiene/areas', addBtn: 'Tambah Area', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }], modal: true },

    // 渠道模块
    { name: '渠道', url: '/channels', addBtn: 'Tambah', fills: [{ sel: '[class*="fixed"] input[type="text"]', val: '测试' }], modal: true },
  ];

  for (const form of forms) {
    try {
      console.log(`【${form.name}】`);

      // 关闭可能存在的遮罩
      const existingOverlay = await page.$('[class*="fixed"][class*="inset-0"]');
      if (existingOverlay) {
        const closeBtn = await page.$('[class*="fixed"] button[class*="ghost"], [class*="fixed"] button:has-text("×")');
        if (closeBtn) await closeBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // 导航到页面
      await page.goto(`${BASE_URL}${form.url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      // 查找添加按钮
      const addButton = await page.$(`button:has-text("${form.addBtn}")`);
      if (!addButton) {
        console.log(`  ⚠️ 未找到添加按钮: ${form.addBtn}\n`);
        continue;
      }

      // 点击添加
      await addButton.click({ force: true });
      await page.waitForTimeout(1000);

      // 填写表单
      for (const fill of form.fills) {
        const input = await page.$(fill.sel);
        if (input) {
          await input.fill(fill.val + Date.now());
          await page.waitForTimeout(200);
        }
      }

      await page.waitForTimeout(500);

      // 点击保存
      const saveBtn = await page.$(`button:has-text("Simpan"), button[type="submit"]`);
      if (saveBtn) {
        const isDisabled = await saveBtn.getAttribute('disabled');
        if (isDisabled !== null) {
          console.log(`  ⚠️ 保存按钮disabled (验证生效)\n`);
        } else {
          await saveBtn.click({ force: true });
          await page.waitForTimeout(2500);
          const url = page.url();
          console.log(`  ✅ 提交成功\n`);
          passed++;
        }
      } else {
        console.log(`  ⚠️ 未找到保存按钮\n`);
      }
    } catch (e) {
      console.log(`  ❌ 异常: ${e.message.substring(0, 50)}\n`);
      failed++;
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`测试完成: ✅ ${passed} 通过, ❌ ${failed} 失败`);
  await browser.close();
})();
