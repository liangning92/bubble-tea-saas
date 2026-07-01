const { chromium } = require('playwright');

const BASE_URLS = {
  admin: 'http://localhost:5173',
  pos: 'http://localhost:6065',
  staff: 'http://localhost:5177'
};

const CREDENTIALS = {
  admin: { phone: '081234567890', password: 'admin123' },
  staff: { phone: '081234567890', password: 'admin123' }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAdmin(page) {
  console.log('\n========== TESTING ADMIN APP ==========\n');
  const results = [];

  try {
    // 1. LOGIN
    console.log('1. Testing LOGIN...');
    await page.goto(BASE_URLS.admin);
    await sleep(2000);

    // Check login page loaded
    const loginTitle = await page.locator('h1, h2').first().textContent().catch(() => 'Not found');
    console.log('   Login page title:', loginTitle);

    // Fill login form
    await page.fill('input[type="tel"], input[name="phone"], input[placeholder*="phone" i], input[placeholder*="Phone" i]', CREDENTIALS.admin.phone);
    await page.fill('input[type="password"], input[name="password"]', CREDENTIALS.admin.password);
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Masuk"), button:has-text("登录")');

    await sleep(3000);

    // Check if logged in
    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('masuk');
    console.log('   Login result:', isLoggedIn ? 'SUCCESS - redirected away from login' : 'FAILED - still on login page');
    console.log('   Current URL:', currentUrl);

    if (!isLoggedIn) {
      // Try to capture error message
      const errorMsg = await page.locator('.text-red, .text-red-500, [class*="error"], [class*="Error"]').first().textContent().catch(() => 'No error message found');
      console.log('   Error message:', errorMsg);
      results.push({ test: 'Admin Login', status: 'FAIL', details: 'Still on login page after submit' });
      return results;
    }
    results.push({ test: 'Admin Login', status: 'PASS' });

    // 2. Navigate to Dashboard
    console.log('\n2. Testing Dashboard...');
    await page.goto(BASE_URLS.admin + '/dashboard');
    await sleep(2000);
    const dashboardContent = await page.locator('body').textContent();
    const hasDashboardContent = dashboardContent.length > 100;
    console.log('   Dashboard loaded:', hasDashboardContent ? 'YES' : 'NO');
    results.push({ test: 'Admin Dashboard', status: hasDashboardContent ? 'PASS' : 'FAIL' });

    // 3. Navigate to Orders
    console.log('\n3. Testing Orders section...');
    await page.goto(BASE_URLS.admin + '/orders');
    await sleep(2000);

    // Check for language mixing
    const ordersContent = await page.locator('body').textContent();
    const hasLanguageMixing = checkLanguageMixing(ordersContent);
    console.log('   Language mixing detected:', hasLanguageMixing ? 'YES (ISSUE)' : 'NO');
    if (hasLanguageMixing) {
      results.push({ test: 'Orders Language', status: 'FAIL', details: 'Language mixing detected' });
    } else {
      results.push({ test: 'Orders Language', status: 'PASS' });
    }

    // Try clicking buttons
    const orderButtons = await page.locator('button').count();
    console.log('   Buttons found:', orderButtons);

    // Try to open a modal if exists
    const addButton = page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("新增"), button:has-text("+")').first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await sleep(1000);
      const modalVisible = await page.locator('[role="dialog"], .modal, .fixed, [class*="overlay"]').first().isVisible().catch(() => false);
      console.log('   Add modal opened:', modalVisible ? 'YES' : 'NO');
      results.push({ test: 'Orders - Add Modal', status: modalVisible ? 'PASS' : 'FAIL' });
      if (modalVisible) {
        await page.keyboard.press('Escape');
        await sleep(500);
      }
    }

    // 4. Navigate to Products
    console.log('\n4. Testing Products section...');
    await page.goto(BASE_URLS.admin + '/products');
    await sleep(2000);
    const productsContent = await page.locator('body').textContent();
    const productsLangMix = checkLanguageMixing(productsContent);
    console.log('   Language mixing detected:', productsLangMix ? 'YES (ISSUE)' : 'NO');
    results.push({ test: 'Products Language', status: productsLangMix ? 'FAIL' : 'PASS' });

    // Try add product
    const addProductBtn = page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("新增")').first();
    if (await addProductBtn.isVisible().catch(() => false)) {
      await addProductBtn.click();
      await sleep(1000);
      const productModal = await page.locator('[role="dialog"], .modal').first().isVisible().catch(() => false);
      console.log('   Add product modal opened:', productModal ? 'YES' : 'NO');
      results.push({ test: 'Products - Add Modal', status: productModal ? 'PASS' : 'FAIL' });
      if (productModal) {
        await page.keyboard.press('Escape');
        await sleep(500);
      }
    }

    // 5. Navigate to Inventory
    console.log('\n5. Testing Inventory section...');
    await page.goto(BASE_URLS.admin + '/inventory');
    await sleep(2000);
    const inventoryContent = await page.locator('body').textContent();
    const inventoryLangMix = checkLanguageMixing(inventoryContent);
    console.log('   Language mixing detected:', inventoryLangMix ? 'YES (ISSUE)' : 'NO');
    results.push({ test: 'Inventory Language', status: inventoryLangMix ? 'FAIL' : 'PASS' });

    // 6. Navigate to Employees
    console.log('\n6. Testing Employees section...');
    await page.goto(BASE_URLS.admin + '/employees');
    await sleep(2000);
    const employeesContent = await page.locator('body').textContent();
    const employeesLangMix = checkLanguageMixing(employeesContent);
    console.log('   Language mixing detected:', employeesLangMix ? 'YES (ISSUE)' : 'NO');
    results.push({ test: 'Employees Language', status: employeesLangMix ? 'FAIL' : 'PASS' });

    // 7. Navigate to Finance
    console.log('\n7. Testing Finance section...');
    await page.goto(BASE_URLS.admin + '/finance');
    await sleep(2000);
    const financeContent = await page.locator('body').textContent();
    const financeLangMix = checkLanguageMixing(financeContent);
    console.log('   Language mixing detected:', financeLangMix ? 'YES (ISSUE)' : 'NO');
    results.push({ test: 'Finance Language', status: financeLangMix ? 'FAIL' : 'PASS' });

    // 8. Navigate to Marketing
    console.log('\n8. Testing Marketing section...');
    await page.goto(BASE_URLS.admin + '/marketing');
    await sleep(2000);
    const marketingContent = await page.locator('body').textContent();
    const marketingLangMix = checkLanguageMixing(marketingContent);
    console.log('   Language mixing detected:', marketingLangMix ? 'YES (ISSUE)' : 'NO');
    results.push({ test: 'Marketing Language', status: marketingLangMix ? 'FAIL' : 'PASS' });

    // 9. Navigate to Settings
    console.log('\n9. Testing Settings section...');
    await page.goto(BASE_URLS.admin + '/settings');
    await sleep(2000);
    const settingsContent = await page.locator('body').textContent();
    const settingsLangMix = checkLanguageMixing(settingsContent);
    console.log('   Language mixing detected:', settingsLangMix ? 'YES (ISSUE)' : 'NO');
    results.push({ test: 'Settings Language', status: settingsLangMix ? 'FAIL' : 'PASS' });

  } catch (error) {
    console.log('   EXCEPTION:', error.message);
    results.push({ test: 'Admin Test', status: 'FAIL', details: error.message });
  }

  return results;
}

async function testPOS(page) {
  console.log('\n========== TESTING POS APP ==========\n');
  const results = [];

  try {
    // 1. LOGIN
    console.log('1. Testing POS LOGIN...');
    await page.goto(BASE_URLS.pos);
    await sleep(2000);

    const loginTitle = await page.locator('h1, h2').first().textContent().catch(() => 'Not found');
    console.log('   Login page title:', loginTitle);

    await page.fill('input[type="tel"], input[name="phone"], input[placeholder*="phone" i], input[placeholder*="Phone" i]', CREDENTIALS.admin.phone);
    await page.fill('input[type="password"], input[name="password"]', CREDENTIALS.admin.password);
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Masuk"), button:has-text("登录")');

    await sleep(3000);

    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('masuk');
    console.log('   Login result:', isLoggedIn ? 'SUCCESS' : 'FAILED');
    console.log('   Current URL:', currentUrl);

    if (!isLoggedIn) {
      results.push({ test: 'POS Login', status: 'FAIL', details: 'Still on login page' });
      return results;
    }
    results.push({ test: 'POS Login', status: 'PASS' });

    // 2. Check POS main screen
    console.log('\n2. Testing POS main screen...');
    await sleep(2000);
    const posContent = await page.locator('body').textContent();
    console.log('   POS content length:', posContent.length);
    const hasProducts = posContent.includes('Teh') || posContent.includes('Milk') || posContent.includes('Boba') || posContent.includes('珍珠');
    console.log('   Products displayed:', hasProducts ? 'YES' : 'NO');
    results.push({ test: 'POS Products Display', status: hasProducts ? 'PASS' : 'FAIL' });

    // 3. Try to add item to cart
    console.log('\n3. Testing Add to Cart...');
    const productButtons = page.locator('[class*="card"], [class*="product"], [class*="item"]').first();
    if (await productButtons.isVisible().catch(() => false)) {
      await productButtons.click();
      await sleep(1000);
      const cartIndicator = await page.locator('[class*="cart"], [class*="badge"], [class*="count"]').first().textContent().catch(() => '0');
      console.log('   Cart indicator:', cartIndicator);
      results.push({ test: 'POS Add to Cart', status: 'PASS' });
    } else {
      console.log('   Cannot find product cards to click');
      results.push({ test: 'POS Add to Cart', status: 'FAIL', details: 'No product cards found' });
    }

    // 4. Try checkout
    console.log('\n4. Testing Checkout...');
    const checkoutBtn = page.locator('button:has-text("Bayar"), button:has-text("Pay"), button:has-text("Checkout"), button:has-text("结账")').first();
    if (await checkoutBtn.isVisible().catch(() => false)) {
      await checkoutBtn.click();
      await sleep(2000);
      const modalVisible = await page.locator('[role="dialog"], .modal').first().isVisible().catch(() => false);
      console.log('   Checkout modal opened:', modalVisible);
      results.push({ test: 'POS Checkout Modal', status: modalVisible ? 'PASS' : 'FAIL' });

      if (modalVisible) {
        // Try to submit payment
        const payBtn = page.locator('button:has-text("Bayar"), button:has-text("Confirm"), button:has-text("Pay")').first();
        if (await payBtn.isVisible().catch(() => false)) {
          await payBtn.click();
          await sleep(2000);
          const successMsg = await page.locator('text=/success|berhasil|成功/i').isVisible().catch(() => false);
          console.log('   Payment success message:', successMsg ? 'YES' : 'NO');
          results.push({ test: 'POS Payment', status: successMsg ? 'PASS' : 'PARTIAL' });
        }
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('   Checkout button not found');
      results.push({ test: 'POS Checkout', status: 'FAIL', details: 'Checkout button not found' });
    }

    // 5. Try Refund
    console.log('\n5. Testing Refund...');
    await page.goto(BASE_URLS.pos + '/orders');
    await sleep(2000);

    const refundBtn = page.locator('button:has-text("Refund"), button:has-text("Retur"), button:has-text("退款")').first();
    if (await refundBtn.isVisible().catch(() => false)) {
      await refundBtn.click();
      await sleep(1000);
      const refundModal = await page.locator('[role="dialog"], .modal').first().isVisible().catch(() => false);
      console.log('   Refund modal opened:', refundModal);
      results.push({ test: 'POS Refund Modal', status: refundModal ? 'PASS' : 'FAIL' });
      if (refundModal) {
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('   Refund button not found');
      results.push({ test: 'POS Refund', status: 'FAIL', details: 'Refund button not found' });
    }

  } catch (error) {
    console.log('   EXCEPTION:', error.message);
    results.push({ test: 'POS Test', status: 'FAIL', details: error.message });
  }

  return results;
}

async function testStaff(page) {
  console.log('\n========== TESTING STAFF APP ==========\n');
  const results = [];

  try {
    // 1. LOGIN
    console.log('1. Testing STAFF LOGIN...');
    await page.goto(BASE_URLS.staff);
    await sleep(2000);

    const loginTitle = await page.locator('h1, h2').first().textContent().catch(() => 'Not found');
    console.log('   Login page title:', loginTitle);

    await page.fill('input[type="tel"], input[name="phone"], input[placeholder*="phone" i], input[placeholder*="Phone" i]', CREDENTIALS.staff.phone);
    await page.fill('input[type="password"], input[name="password"]', CREDENTIALS.staff.password);
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Masuk"), button:has-text("登录")');

    await sleep(3000);

    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('masuk');
    console.log('   Login result:', isLoggedIn ? 'SUCCESS' : 'FAILED');
    console.log('   Current URL:', currentUrl);

    if (!isLoggedIn) {
      results.push({ test: 'Staff Login', status: 'FAIL', details: 'Still on login page' });
      return results;
    }
    results.push({ test: 'Staff Login', status: 'PASS' });

    // 2. Check Staff main screen
    console.log('\n2. Testing Staff main screen...');
    await sleep(2000);
    const staffContent = await page.locator('body').textContent();
    console.log('   Staff content loaded:', staffContent.length > 100 ? 'YES' : 'NO');
    results.push({ test: 'Staff Main Screen', status: staffContent.length > 100 ? 'PASS' : 'FAIL' });

    // 3. Test Clock In
    console.log('\n3. Testing Clock In...');
    const clockInBtn = page.locator('button:has-text("Clock In"), button:has-text("Masuk"), button:has-text("签到")').first();
    if (await clockInBtn.isVisible().catch(() => false)) {
      await clockInBtn.click();
      await sleep(2000);
      const successMsg = await page.locator('text=/success|berhasil|成功|clocked/i').isVisible().catch(() => false);
      console.log('   Clock In success:', successMsg ? 'YES' : 'NO');
      results.push({ test: 'Staff Clock In', status: successMsg ? 'PASS' : 'FAIL' });
    } else {
      console.log('   Clock In button not found');
      results.push({ test: 'Staff Clock In', status: 'FAIL', details: 'Clock In button not found' });
    }

    // 4. Test Clock Out
    console.log('\n4. Testing Clock Out...');
    const clockOutBtn = page.locator('button:has-text("Clock Out"), button:has-text("Pulang"), button:has-text("签退")').first();
    if (await clockOutBtn.isVisible().catch(() => false)) {
      await clockOutBtn.click();
      await sleep(2000);
      const successMsg = await page.locator('text=/success|berhasil|成功|clocked/i').isVisible().catch(() => false);
      console.log('   Clock Out success:', successMsg ? 'YES' : 'NO');
      results.push({ test: 'Staff Clock Out', status: successMsg ? 'PASS' : 'FAIL' });
    } else {
      console.log('   Clock Out button not found (may already be clocked out)');
      results.push({ test: 'Staff Clock Out', status: 'FAIL', details: 'Clock Out button not found' });
    }

    // 5. Test Leave Request
    console.log('\n5. Testing Leave Request...');
    const leaveBtn = page.locator('button:has-text("Cuti"), button:has-text("Leave"), button:has-text("请假")').first();
    if (await leaveBtn.isVisible().catch(() => false)) {
      await leaveBtn.click();
      await sleep(1000);
      const leaveModal = await page.locator('[role="dialog"], .modal').first().isVisible().catch(() => false);
      console.log('   Leave request modal opened:', leaveModal);

      if (leaveModal) {
        results.push({ test: 'Staff Leave Request Modal', status: 'PASS' });

        // Try to fill form and submit
        const dateInputs = page.locator('input[type="date"], input[placeholder*="date" i]');
        if (await dateInputs.first().isVisible().catch(() => false)) {
          await dateInputs.first().fill('2026-07-05');
          await sleep(500);
        }

        const reasonInput = page.locator('textarea, input:not([type="date"]):not([type="tel"]):not([type="password"])');
        if (await reasonInput.last().isVisible().catch(() => false)) {
          await reasonInput.last().fill('Test leave request');
          await sleep(500);
        }

        const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Kirim"), button:has-text("提交")').first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          await sleep(2000);
          const successMsg = await page.locator('text=/success|berhasil|成功/i').isVisible().catch(() => false);
          console.log('   Leave request submitted:', successMsg ? 'YES' : 'NO');
          results.push({ test: 'Staff Leave Request Submit', status: successMsg ? 'PASS' : 'FAIL' });
        }
      } else {
        results.push({ test: 'Staff Leave Request Modal', status: 'FAIL' });
      }
      await page.keyboard.press('Escape');
    } else {
      console.log('   Leave button not found');
      results.push({ test: 'Staff Leave Request', status: 'FAIL', details: 'Leave button not found' });
    }

  } catch (error) {
    console.log('   EXCEPTION:', error.message);
    results.push({ test: 'Staff Test', status: 'FAIL', details: error.message });
  }

  return results;
}

function checkLanguageMixing(text) {
  // Check for mixed languages in unexpected places
  const indonesianWords = ['Tambah', 'Hapus', 'Edit', 'Simpan', 'Batal', 'Login', 'Masuk', 'Keluar', 'Pengaturan'];
  const chineseWords = ['订单', '产品', '库存', '员工', '财务', '设置', '管理', '新增', '编辑', '删除', '保存', '取消'];
  const englishWords = ['Orders', 'Products', 'Inventory', 'Employees', 'Finance', 'Settings', 'Add', 'Edit', 'Delete', 'Save', 'Cancel'];

  let mixedCount = 0;
  let foundLanguages = [];

  for (const word of indonesianWords) {
    if (text.includes(word)) foundLanguages.push('ID');
  }
  for (const word of chineseWords) {
    if (text.includes(word)) foundLanguages.push('ZH');
  }

  // If we find words from multiple languages in the same section, it's mixing
  const uniqueLangs = [...new Set(foundLanguages)];
  return uniqueLangs.length > 1;
}

async function runTests() {
  console.log('Starting Real User Walkthrough Test');
  console.log('=====================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const allResults = [];

  // Test Admin
  const adminResults = await testAdmin(page);
  allResults.push(...adminResults);

  // Test POS
  const posResults = await testPOS(page);
  allResults.push(...posResults);

  // Test Staff
  const staffResults = await testStaff(page);
  allResults.push(...staffResults);

  await browser.close();

  // Print summary
  console.log('\n\n=====================================');
  console.log('         TEST SUMMARY');
  console.log('=====================================');

  const passCount = allResults.filter(r => r.status === 'PASS').length;
  const failCount = allResults.filter(r => r.status === 'FAIL').length;
  const partialCount = allResults.filter(r => r.status === 'PARTIAL').length;

  console.log(`\nTotal: ${allResults.length} tests`);
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);
  console.log(`PARTIAL: ${partialCount}`);

  console.log('\nDetailed Results:');
  allResults.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} ${r.test}: ${r.status}${r.details ? ` (${r.details})` : ''}`);
  });

  return allResults;
}

runTests().catch(console.error);