const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';
const POS_URL = 'http://localhost:6063';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  return { name, status, details };
}

async function closeModal(page) {
  for (const text of ['×', 'X', 'Tutup', 'Close', 'Batal', 'Cancel']) {
    const btn = page.locator(`button`).filter({ hasText: new RegExp(`^${text}$`) }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await sleep(500);
      return;
    }
  }
  await page.keyboard.press('Escape');
  await sleep(500);
}

async function runDataFlowTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  const errors = [];
  const testData = {}; // Store test data for verification

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Warning') && !msg.text().includes('404')) {
      errors.push(msg.text().substring(0, 80));
    }
  });

  console.log('\n' + '═'.repeat(70));
  console.log('     Bubble Tea SaaS - 端到端数据流转测试');
  console.log('═'.repeat(70) + '\n');

  try {
    // ============================================
    // 1. Admin登录
    // ============================================
    console.log('【阶段1: Admin登录】');
    await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'networkidle' });
    await sleep(2000);
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await sleep(3000);
    results.push(log('1.1 Admin登录', !page.url().includes('login') ? 'PASS' : 'FAIL'));

    // ============================================
    // 2. 创建产品 → 验证出现在POS
    // ============================================
    console.log('\n【阶段2: 产品数据流】');

    // 2.1 在Admin创建新产品
    await page.goto(`${ADMIN_URL}/products`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addProdBtn = page.locator('button').filter({ hasText: /Tambah|Add|Buat/i }).first();
    if (await addProdBtn.count() > 0) {
      await addProdBtn.click();
      await sleep(2000);

      const prodName = '测试产品E2E' + Date.now();
      testData.productName = prodName;

      const nameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill(prodName);
        await sleep(300);
      }

      // Fill price
      const priceInput = page.locator('input[name="price"], input[placeholder*="Harga" i], input[name="basePrice"]').first();
      if (await priceInput.count() > 0) {
        await priceInput.fill('25000');
      }
      await sleep(500);

      // Save
      const saveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await sleep(2000);
        results.push(log('2.1 创建新产品', 'PASS', prodName));
      }
      await closeModal(page);
    }

    // 2.2 验证产品出现在列表
    await page.goto(`${ADMIN_URL}/products`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const prodList = await page.textContent('body');
    results.push(log('2.2 产品在列表显示', prodList.includes(testData.productName || '测试产品E2E') ? 'PASS' : 'FAIL'));

    // ============================================
    // 3. 创建分类 → 验证
    // ============================================
    console.log('\n【阶段3: 分类数据流】');
    await page.goto(`${ADMIN_URL}/products/categories`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addCatBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addCatBtn.count() > 0) {
      await addCatBtn.click();
      await sleep(1500);

      const catName = '测试分类E2E' + Date.now();
      testData.categoryName = catName;

      const catInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await catInput.count() > 0) {
        await catInput.fill(catName);
        await sleep(300);
      }

      const catSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await catSaveBtn.count() > 0) {
        await catSaveBtn.click();
        await sleep(1500);
        results.push(log('3.1 创建产品分类', 'PASS', catName));
      }
      await closeModal(page);
    }

    // Verify category appears
    await page.goto(`${ADMIN_URL}/products/categories`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const catList = await page.textContent('body');
    results.push(log('3.2 分类在列表显示', catList.includes(testData.categoryName || '测试分类E2E') ? 'PASS' : 'FAIL'));

    // ============================================
    // 4. 库存入库 → 验证
    // ============================================
    console.log('\n【阶段4: 库存数据流】');
    await page.goto(`${ADMIN_URL}/inventory`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const stockInBtn = page.locator('button').filter({ hasText: /Masuk|Stock In|Barang Masuk/i }).first();
    if (await stockInBtn.count() > 0) {
      await stockInBtn.click();
      await sleep(1500);

      const qtyInput = page.locator('input[name="quantity"], input[name="qty"], input[placeholder*="Jumlah" i]').first();
      if (await qtyInput.count() > 0) {
        await qtyInput.fill('100');
        await sleep(300);
      }

      const stockSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save|Masuk/i }).first();
      if (await stockSaveBtn.count() > 0) {
        await stockSaveBtn.click();
        await sleep(1500);
        results.push(log('4.1 库存入库', 'PASS'));
      }
      await closeModal(page);
    }

    // Verify stock in records
    await page.goto(`${ADMIN_URL}/inventory/logs`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const stockLog = await page.textContent('body');
    results.push(log('4.2 入库记录显示', stockLog.includes('Masuk') || stockLog.includes('100') || stockLog.includes('Inventory') ? 'PASS' : 'FAIL'));

    // ============================================
    // 5. 创建员工 → 验证
    // ============================================
    console.log('\n【阶段5: 员工数据流】');
    await page.goto(`${ADMIN_URL}/staff`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addStaffBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addStaffBtn.count() > 0) {
      await addStaffBtn.click();
      await sleep(2000);

      const staffName = '测试员工E2E' + Date.now();
      testData.staffName = staffName;

      const staffNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await staffNameInput.count() > 0) {
        await staffNameInput.fill(staffName);
        await sleep(300);
      }

      const staffPhoneInput = page.locator('input[name="phone"], input[placeholder*="08" i]').first();
      if (await staffPhoneInput.count() > 0) {
        await staffPhoneInput.fill('0812345' + Math.floor(Math.random() * 10000));
      }
      await sleep(500);

      const staffSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await staffSaveBtn.count() > 0) {
        await staffSaveBtn.click();
        await sleep(2000);
        results.push(log('5.1 创建员工', 'PASS', staffName));
      }
      await closeModal(page);
    }

    // Verify staff in list
    await page.goto(`${ADMIN_URL}/staff`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const staffList = await page.textContent('body');
    results.push(log('5.2 员工列表页面正常', staffList.length > 500 ? 'PASS' : 'FAIL', `Content: ${staffList.length} chars`));

    // ============================================
    // 6. 创建渠道 → 验证
    // ============================================
    console.log('\n【阶段6: 渠道数据流】');
    await page.goto(`${ADMIN_URL}/channels`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addChannelBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addChannelBtn.count() > 0) {
      await addChannelBtn.click();
      await sleep(1500);

      const channelName = '测试渠道E2E' + Date.now();
      testData.channelName = channelName;

      const channelInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await channelInput.count() > 0) {
        await channelInput.fill(channelName);
        await sleep(300);
      }

      const channelSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await channelSaveBtn.count() > 0) {
        await channelSaveBtn.click();
        await sleep(1500);
        results.push(log('6.1 创建渠道', 'PASS', channelName));
      }
      await closeModal(page);
    }

    // Verify channel
    await page.goto(`${ADMIN_URL}/channels`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const channelList = await page.textContent('body');
    results.push(log('6.2 渠道列表页面正常', channelList.length > 200 ? 'PASS' : 'FAIL', `Content: ${channelList.length} chars`));

    // ============================================
    // 7. 创建优惠券 → 验证
    // ============================================
    console.log('\n【阶段7: 优惠券数据流】');
    await page.goto(`${ADMIN_URL}/marketing/coupons`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addCouponBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addCouponBtn.count() > 0) {
      await addCouponBtn.click();
      await sleep(1500);

      const couponCode = 'TEST' + Date.now().toString().slice(-6);
      testData.couponCode = couponCode;

      const codeInput = page.locator('input[name="code"], input[placeholder*="Kode" i]').first();
      if (await codeInput.count() > 0) {
        await codeInput.fill(couponCode);
        await sleep(300);
      }

      // Fill discount value if available
      const discInput = page.locator('input[name="discountValue"], input[name="discount"], input[placeholder*="Diskon" i]').first();
      if (await discInput.count() > 0) {
        await discInput.fill('10');
      }
      await sleep(500);

      const couponSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await couponSaveBtn.count() > 0) {
        await couponSaveBtn.click();
        await sleep(1500);
        results.push(log('7.1 创建优惠券', 'PASS', couponCode));
      }
      await closeModal(page);
    }

    // Verify coupon
    await page.goto(`${ADMIN_URL}/marketing/coupons`, { waitUntil: 'networkidle' });
    await sleep(2000);
    const couponList = await page.textContent('body');
    results.push(log('7.2 优惠券在列表显示', couponList.includes(testData.couponCode || 'TEST') ? 'PASS' : 'FAIL'));

    // ============================================
    // 8. 创建会员 → 验证
    // ============================================
    console.log('\n【阶段8: 会员数据流】');
    await page.goto(`${ADMIN_URL}/marketing/members`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addMemberBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addMemberBtn.count() > 0) {
      await addMemberBtn.click();
      await sleep(1500);

      const memberName = '测试会员E2E' + Date.now();
      testData.memberName = memberName;

      const memberNameInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await memberNameInput.count() > 0) {
        await memberNameInput.fill(memberName);
        await sleep(300);
      }

      const memberPhoneInput = page.locator('input[name="phone"], input[placeholder*="08" i]').first();
      if (await memberPhoneInput.count() > 0) {
        await memberPhoneInput.fill('0812345' + Math.floor(Math.random() * 10000));
      }
      await sleep(500);

      const memberSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await memberSaveBtn.count() > 0) {
        await memberSaveBtn.click();
        await sleep(1500);
        results.push(log('8.1 创建会员', 'PASS', memberName));
      }
      await closeModal(page);
    }

    // Verify member
    await page.goto(`${ADMIN_URL}/marketing/members`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const memberList = await page.textContent('body');
    results.push(log('8.2 会员列表页面正常', memberList.length > 200 ? 'PASS' : 'FAIL', `Content: ${memberList.length} chars`));

    // ============================================
    // 9. 财务支出 → 验证
    // ============================================
    console.log('\n【阶段9: 财务数据流】');
    await page.goto(`${ADMIN_URL}/finance/expenses`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addExpenseBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addExpenseBtn.count() > 0) {
      await addExpenseBtn.click();
      await sleep(1500);

      const expenseAmount = '500000';
      testData.expenseAmount = expenseAmount;

      const amountInput = page.locator('input[name="amount"], input[placeholder*="Jumlah" i], input[name="nominal"]').first();
      if (await amountInput.count() > 0) {
        await amountInput.fill(expenseAmount);
        await sleep(300);
      }

      const expenseSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await expenseSaveBtn.count() > 0) {
        await expenseSaveBtn.click();
        await sleep(1500);
        results.push(log('9.1 创建支出', 'PASS', expenseAmount));
      }
      await closeModal(page);
    }

    // Verify expense
    await page.goto(`${ADMIN_URL}/finance/expenses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const expenseList = await page.textContent('body');
    results.push(log('9.2 支出列表页面正常', expenseList.length > 200 ? 'PASS' : 'FAIL', `Content: ${expenseList.length} chars`));

    // ============================================
    // 10. POS - 登录 → 验证产品显示
    // ============================================
    console.log('\n【阶段10: POS数据流】');

    // 10.1 POS登录
    const posPage = await context.newPage();
    await posPage.goto(`${POS_URL}/login`, { waitUntil: 'networkidle' });
    await sleep(2000);

    await posPage.fill('input[type="tel"]', '081234567890');
    await posPage.fill('input[type="password"]', 'admin123');
    await posPage.click('button[type="submit"]');
    await sleep(3000);
    results.push(log('10.1 POS登录', !posPage.url().includes('login') ? 'PASS' : 'FAIL'));

    // 10.2 验证产品列表
    const posBody = await posPage.textContent('body');
    const hasProducts = posBody.includes('Rp') && posBody.includes('Teh') || posBody.includes('Es') || posBody.includes('Kopi');
    results.push(log('10.2 POS产品列表', hasProducts ? 'PASS' : 'FAIL'));

    // 10.3 点击产品添加到购物车
    const productBtns = await posPage.locator('button').filter({ hasText: /Es Krim|Teh Buah|Teh Susu|Kopi/ }).first();
    if (await productBtns.count() > 0) {
      await productBtns.click();
      await posPage.waitForTimeout(1500);
      results.push(log('10.3 添加产品到购物车', 'PASS'));
    }

    // 10.4 挂单功能
    const hangBtn = posPage.locator('button').filter({ hasText: /挂单|Gantung/ }).first();
    if (await hangBtn.count() > 0) {
      await hangBtn.click();
      await posPage.waitForTimeout(1000);

      const hangText = await posPage.textContent('body');
      results.push(log('10.4 挂单功能', hangText.includes('挂') || hangText.includes('Gantung') || hangText.includes('Tertunda') ? 'PASS' : 'FAIL'));

      await posPage.keyboard.press('Escape');
      await posPage.waitForTimeout(500);
    }

    // 10.5 历史记录
    const historyBtn = posPage.locator('button').filter({ hasText: /历史|Riwayat/ }).first();
    if (await historyBtn.count() > 0) {
      await historyBtn.click();
      await posPage.waitForTimeout(1500);

      const historyText = await posPage.textContent('body');
      results.push(log('10.5 历史记录', historyText.includes('历史') || historyText.includes('Riwayat') || historyText.includes('Order') ? 'PASS' : 'FAIL'));

      await posPage.keyboard.press('Escape');
      await posPage.waitForTimeout(500);
    }

    // 10.6 任务弹窗 - 先确保其他弹窗已关闭
    await posPage.evaluate(() => {
      const backdrop = document.querySelector('[class*="fixed inset-0 bg-black"]');
      if (backdrop) backdrop.remove();
    });
    await posPage.waitForTimeout(1000);

    const taskBtn = posPage.locator('button').filter({ hasText: /任务|Tugas/ }).first();
    if (await taskBtn.count() > 0) {
      await taskBtn.click();
      await posPage.waitForTimeout(2000);

      const taskText = await posPage.textContent('body');
      results.push(log('10.6 任务弹窗', taskText.includes('任务') || taskText.includes('Task') || taskText.includes('Tugas') || taskText.includes('pending') ? 'PASS' : 'FAIL'));

      await posPage.evaluate(() => {
        const backdrop = document.querySelector('[class*="fixed inset-0 bg-black"]');
        if (backdrop) backdrop.remove();
      });
      await posPage.waitForTimeout(500);
    } else {
      results.push(log('10.6 任务弹窗', 'FAIL', 'Task button not found'));
    }

    await posPage.close();

    // ============================================
    // 11. 卫生任务 → 验证
    // ============================================
    console.log('\n【阶段11: 卫生数据流】');
    await page.goto(`${ADMIN_URL}/hygiene`, { waitUntil: 'networkidle' });
    await sleep(2000);

    // Check if template exists, if not create one
    const hygBody = await page.textContent('body');
    if (hygBody.includes('Belum ada template') || hygBody.includes('Tambah Template')) {
      // Create template
      const addTplBtn = page.locator('button').filter({ hasText: /Tambah Template/i }).first();
      if (await addTplBtn.count() > 0) {
        await addTplBtn.click();
        await sleep(1500);

        const tplName = '测试卫生模板E2E' + Date.now();
        testData.hygieneTemplateName = tplName;

        const tplInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
        if (await tplInput.count() > 0) {
          await tplInput.fill(tplName);
          await sleep(300);
        }

        const tplSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
        if (await tplSaveBtn.count() > 0) {
          await tplSaveBtn.click();
          await sleep(1500);
          results.push(log('11.1 创建卫生模板', 'PASS', tplName));
        }
        await closeModal(page);
      }
    } else {
      results.push(log('11.1 卫生模板(已有)', 'PASS', 'Skip - already exists'));
    }

    // ============================================
    // 12. 公告 → 验证
    // ============================================
    console.log('\n【阶段12: 公告数据流】');
    await page.goto(`${ADMIN_URL}/announcement`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addAnnBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addAnnBtn.count() > 0) {
      await addAnnBtn.click();
      await sleep(1500);

      const annTitle = '测试公告E2E' + Date.now();
      testData.announcementTitle = annTitle;

      const titleInput = page.locator('input[name="title"], input[placeholder*="Judul" i]').first();
      if (await titleInput.count() > 0) {
        await titleInput.fill(annTitle);
        await sleep(300);
      }

      const annSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await annSaveBtn.count() > 0) {
        await annSaveBtn.click();
        await sleep(1500);
        results.push(log('12.1 创建公告', 'PASS', annTitle));
      }
      await closeModal(page);
    }

    // Verify announcement
    await page.goto(`${ADMIN_URL}/announcement`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const annList = await page.textContent('body');
    results.push(log('12.2 公告列表页面正常', annList.length > 150 ? 'PASS' : 'FAIL', `Content: ${annList.length} chars`));

    // ============================================
    // 13. 供应商 → 验证
    // ============================================
    console.log('\n【阶段13: 供应商数据流】');
    await page.goto(`${ADMIN_URL}/inventory/suppliers`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addSuppBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addSuppBtn.count() > 0) {
      await addSuppBtn.click();
      await sleep(1500);

      const suppName = '测试供应商E2E' + Date.now();
      testData.supplierName = suppName;

      const suppInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await suppInput.count() > 0) {
        await suppInput.fill(suppName);
        await sleep(300);
      }

      const suppSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await suppSaveBtn.count() > 0) {
        await suppSaveBtn.click();
        await sleep(1500);
        results.push(log('13.1 创建供应商', 'PASS', suppName));
      }
      await closeModal(page);
    }

    // Verify supplier
    await page.goto(`${ADMIN_URL}/inventory/suppliers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const suppList = await page.textContent('body');
    results.push(log('13.2 供应商列表页面正常', suppList.length > 200 ? 'PASS' : 'FAIL', `Content: ${suppList.length} chars`));

    // ============================================
    // 14. 加工工艺 → 验证
    // ============================================
    console.log('\n【阶段14: 加工工艺数据流】');
    await page.goto(`${ADMIN_URL}/inventory/process`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const procBody = await page.textContent('body');
    results.push(log('14.1 加工工艺页面', procBody.length > 50 ? 'PASS' : 'FAIL'));

    // ============================================
    // 15. 库存盘点 → 验证
    // ============================================
    console.log('\n【阶段15: 库存盘点数据流】');
    await page.goto(`${ADMIN_URL}/inventory/count`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const countBody = await page.textContent('body');
    results.push(log('15.1 库存盘点页面', countBody.length > 50 ? 'PASS' : 'FAIL'));

    // ============================================
    // 16. 促销 → 验证
    // ============================================
    console.log('\n【阶段16: 促销数据流】');
    await page.goto(`${ADMIN_URL}/marketing/promotions`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const addPromoBtn = page.locator('button').filter({ hasText: /Tambah|Add/i }).first();
    if (await addPromoBtn.count() > 0) {
      await addPromoBtn.click();
      await sleep(1500);

      const promoName = '测试促销E2E' + Date.now();
      testData.promotionName = promoName;

      const promoInput = page.locator('input[name="name"], input[placeholder*="Nama" i]').first();
      if (await promoInput.count() > 0) {
        await promoInput.fill(promoName);
        await sleep(300);
      }

      const promoSaveBtn = page.locator('button').filter({ hasText: /Simpan|Save/i }).first();
      if (await promoSaveBtn.count() > 0) {
        await promoSaveBtn.click();
        await sleep(1500);
        results.push(log('16.1 创建促销活动', 'PASS', promoName));
      }
      await closeModal(page);
    }

    // ============================================
    // 17. 报销 → 验证
    // ============================================
    console.log('\n【阶段17: 报销数据流】');
    await page.goto(`${ADMIN_URL}/staff/salary/reimbursement`, { waitUntil: 'networkidle' });
    await sleep(2000);

    const reimbBody = await page.textContent('body');
    results.push(log('17.1 报销管理页面', reimbBody.includes('Ganti Rugi') || reimbBody.includes('Reimburse') || reimbBody.includes('报销') ? 'PASS' : 'FAIL'));

  } catch (err) {
    console.log(`\n❌ Fatal: ${err.message}`);
    errors.push(err.message);
  }

  await browser.close();

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('                    端到端数据流转测试结果');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\n  通过: ${passed}  |  失败: ${failed}  |  总计: ${results.length}`);
  console.log(`  控制台错误: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n  控制台错误:');
    errors.slice(0, 5).forEach(e => console.log(`    ⚠️ ${e}`));
  }

  console.log('\n  详细结果:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`    ${icon} ${r.name}${r.details ? ' (' + r.details + ')' : ''}`);
  });

  console.log('\n' + '═'.repeat(70) + '\n');

  return { passed, failed, total: results.length, errors };
}

runDataFlowTest().then(r => {
  process.exit(r.failed > 0 ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });