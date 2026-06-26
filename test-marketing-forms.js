const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 营销模块表单测试 ===\n');

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // ========== 1. 优惠券表单 (完整页面) ==========
    console.log('【1. 优惠券 - /marketing/promotions/coupons/new】\n');
    await page.goto(`${BASE_URL}/marketing/promotions/coupons/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 检查按钮状态
    const saveBtn = await page.$('button:has-text("Simpan"), button[type="submit"]');
    const btnDisabled = await saveBtn?.getAttribute('disabled');
    console.log(`保存按钮状态: ${btnDisabled !== null ? 'disabled (需先填写表单)' : 'enabled'}`);

    // 填写表单
    await page.fill('input[placeholder="DISCOUNT10"]', 'TEST' + Date.now());
    await page.fill('input[type="number"]', '10');
    await page.fill('input[type="date"]:first-of-type', '2026-06-23');
    await page.fill('input[type="date"]:last-of-type', '2026-12-31');
    await page.waitForTimeout(500);

    const btnDisabledAfter = await saveBtn?.getAttribute('disabled');
    console.log(`填写后按钮状态: ${btnDisabledAfter !== null ? 'disabled' : 'enabled'}`);

    if (btnDisabledAfter === null) {
      await saveBtn?.click();
      await page.waitForTimeout(3000);
      console.log(`保存后URL: ${page.url()}`);
      console.log(`结果: ${page.url().includes('/coupons') && !page.url().includes('/new') ? '✅ 成功' : '❌ 失败'}`);
    }

    // ========== 2. 活动表单 ==========
    console.log('\n【2. 活动 Campaign - /marketing/promotions/campaigns/new】\n');
    await page.goto(`${BASE_URL}/marketing/promotions/campaigns/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const pageText = await page.evaluate(() => document.body.innerText);
    console.log(`页面内容长度: ${pageText.length}`);
    console.log(`页面包含表单: ${pageText.includes('name') || pageText.includes('Nama') || pageText.includes('Campaign')}`);

    // 查找所有输入
    const inputs = await page.$$('input');
    const selects = await page.$$('select');
    const textareas = await page.$$('textarea');
    console.log(`输入框: ${inputs.length}, 下拉框: ${selects.length}, 文本框: ${textareas.length}`);

    // ========== 3. 促销/折扣规则 ==========
    console.log('\n【3. 折扣规则页面】\n');
    await page.goto(`${BASE_URL}/marketing/promotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const promoText = await page.evaluate(() => document.body.innerText);
    console.log(`促销页面长度: ${promoText.length}`);

    // 查找添加按钮
    const addButtons = await page.$$('button');
    let addBtnText = '';
    for (let i = 0; i < Math.min(addButtons.length, 10); i++) {
      const text = await addButtons[i].innerText();
      if (text.includes('Tambah') || text.includes('Buat') || text.includes('Promo')) {
        addBtnText = text;
        break;
      }
    }
    console.log(`添加按钮: ${addBtnText || '未找到'}`);

    if (addBtnText) {
      await page.click(`button:has-text("${addBtnText.trim()}")`);
      await page.waitForTimeout(1500);

      const modal = await page.$('[class*="fixed"], [role="dialog"]');
      console.log(`弹窗打开: ${modal ? '是' : '否'}`);

      if (modal) {
        // 检查弹窗内容
        const modalText = await modal.innerText();
        console.log(`弹窗内容: ${modalText.substring(0, 200)}...`);

        // 填写表单
        const modalInputs = await modal.$$('input[type="text"]');
        if (modalInputs.length > 0) {
          await modalInputs[0].fill('测试促销-' + Date.now());
        }

        // 检查保存按钮
        const modalSaveBtn = await modal.$('button:has-text("Simpan"), button[type="submit"]');
        if (modalSaveBtn) {
          const modalBtnDisabled = await modalSaveBtn.getAttribute('disabled');
          console.log(`弹窗保存按钮: ${modalBtnDisabled !== null ? 'disabled' : 'enabled'}`);
        }
      }
    }

    console.log('\n=== 测试完成 ===');

  } catch (e) {
    console.error('异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();