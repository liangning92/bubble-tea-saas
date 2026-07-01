const { chromium } = require('playwright');

const BASE_URLS = {
  admin: 'http://localhost:5173',
  pos: 'http://localhost:6065',
  staff: 'http://localhost:5177'
};

const CREDENTIALS = {
  admin: { phone: '081234567890', password: 'admin123' }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTargetedTests() {
  console.log('=== TARGETED ISSUE VERIFICATION ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // ===== ADMIN: Test Products Add Modal =====
  console.log('--- TESTING ADMIN PRODUCTS ADD MODAL ---');
  await page.goto(BASE_URLS.admin);
  await sleep(1000);
  await page.locator('input[type="tel"]').fill(CREDENTIALS.admin.phone);
  await page.locator('input[type="password"]').fill(CREDENTIALS.admin.password);
  await page.locator('button[type="submit"]').click();
  await sleep(3000);

  await page.goto(BASE_URLS.admin + '/products');
  await sleep(3000);

  // Click "Tambah Produk" button specifically
  const tambahProdukBtn = page.locator('button:has-text("Tambah Produk")');
  console.log('Looking for "Tambah Produk" button...');
  const btnExists = await tambahProdukBtn.count();
  console.log(`Found ${btnExists} "Tambah Produk" buttons`);

  if (btnExists > 0) {
    console.log('Clicking "Tambah Produk"...');
    await tambahProdukBtn.first().click();
    await sleep(2000);

    // Check if modal appeared
    const modal = page.locator('[role="dialog"]');
    const modalCount = await modal.count();
    console.log(`Modal elements found: ${modalCount}`);

    const modalVisible = await modal.first().isVisible().catch(() => false);
    console.log(`Modal visible: ${modalVisible}`);

    if (!modalVisible) {
      // Maybe it uses a different selector
      const anyModal = await page.locator('.fixed, .absolute, [class*="inset-0"]').first().isVisible().catch(() => false);
      console.log(`Any overlay element visible: ${anyModal}`);

      // Take a screenshot for debugging
      await page.screenshot({ path: '/Users/liangning/Desktop/Claude_Work/bubble-tea-saas/test-results/admin-products-modal.png' });
      console.log('Screenshot saved to test-results/admin-products-modal.png');
    }
  }

  // ===== ADMIN: Verify Language Mixing on Products =====
  console.log('\n--- VERIFYING LANGUAGE MIXING ON PRODUCTS ---');
  const productsText = await page.locator('body').textContent();

  // Check for mixed language strings
  const findings = [];
  if (productsText.includes('Tambah') && productsText.includes('产品')) {
    findings.push('Products page has BOTH Indonesian "Tambah" AND Chinese "产品"');
  }
  if (productsText.includes('Edit') && productsText.includes('编辑')) {
    findings.push('Products page has BOTH English "Edit" AND Chinese "编辑"');
  }
  if (productsText.includes('Produk') && productsText.includes('Product')) {
    findings.push('Products page has BOTH Indonesian "Produk" AND English "Product"');
  }

  if (findings.length > 0) {
    console.log('LANGUAGE MIXING DETECTED:');
    findings.forEach(f => console.log(`  - ${f}`));
  } else {
    console.log('No language mixing detected on Products');
  }

  // ===== ADMIN: Verify Language Mixing on Inventory =====
  console.log('\n--- VERIFYING LANGUAGE MIXING ON INVENTORY ---');
  await page.goto(BASE_URLS.admin + '/inventory');
  await sleep(3000);
  const inventoryText = await page.locator('body').textContent();

  const invFindings = [];
  if (inventoryText.includes('Tambah') && inventoryText.includes('产品')) {
    invFindings.push('Inventory page has BOTH Indonesian "Tambah" AND Chinese "产品"');
  }
  if (inventoryText.includes('Stok') && inventoryText.includes('库存')) {
    invFindings.push('Inventory page has BOTH Indonesian "Stok" AND Chinese "库存"');
  }
  if (inventoryText.includes('items') && inventoryText.includes('items')) {
    // Check case - "inventory.items" is a key name
    if (inventoryText.match(/inventory\.items/) && inventoryText.includes('items')) {
      invFindings.push('Inventory page has mixed "inventory.items" (translation key leaking)');
    }
  }

  if (invFindings.length > 0) {
    console.log('LANGUAGE MIXING DETECTED:');
    invFindings.forEach(f => console.log(`  - ${f}`));
  } else {
    console.log('No language mixing detected on Inventory');
  }

  // ===== POS: Test Checkout Flow =====
  console.log('\n\n--- TESTING POS CHECKOUT FLOW ---');
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();

  await page2.goto(BASE_URLS.pos);
  await sleep(1000);
  await page2.locator('input[type="tel"]').fill(CREDENTIALS.admin.phone);
  await page2.locator('input[type="password"]').fill(CREDENTIALS.admin.password);
  await page2.locator('button[type="submit"]').click();
  await sleep(3000);

  console.log('Current URL:', page2.url());

  // Click on a product to add to cart
  const firstProduct = page2.locator('button').filter({ hasText: 'Rp' }).first();
  if (await firstProduct.isVisible().catch(() => false)) {
    console.log('Clicking first product...');
    await firstProduct.click();
    await sleep(2000);

    // Check cart count
    const cartText = await page2.locator('text=/购物车|cart|0|1|2|3|4|5/i').first().textContent().catch(() => '');
    console.log('Cart area text:', cartText);

    // Look for checkout button
    const cashBtn = page2.locator('button:has-text("现金")');
    if (await cashBtn.isVisible().catch(() => false)) {
      console.log('Found "现金" (Cash) button, clicking...');
      await cashBtn.click();
      await sleep(2000);

      const afterCashText = await page2.locator('body').textContent();
      console.log('After clicking cash, preview:', afterCashText.substring(0, 500));
    }

    // Check for any payment modal
    const paymentModal = page2.locator('[role="dialog"]');
    if (await paymentModal.first().isVisible().catch(() => false)) {
      console.log('Payment modal appeared!');
    } else {
      console.log('No payment modal appeared after clicking cash');
    }
  }

  // ===== POS: Test Refund =====
  console.log('\n--- TESTING POS REFUND ---');
  const refundBtn = page2.locator('button:has-text("退款")');
  if (await refundBtn.isVisible().catch(() => false)) {
    console.log('Found "退款" (Refund) button, clicking...');
    await refundBtn.click();
    await sleep(2000);

    const refundModal = page2.locator('[role="dialog"]');
    const refundModalVisible = await refundModal.first().isVisible().catch(() => false);
    console.log(`Refund modal visible: ${refundModalVisible}`);

    if (!refundModalVisible) {
      await page2.screenshot({ path: '/Users/liangning/Desktop/Claude_Work/bubble-tea-saas/test-results/pos-refund-attempt.png' });
      console.log('Screenshot saved to test-results/pos-refund-attempt.png');
    }
  } else {
    console.log('Refund button not visible');
  }

  // ===== STAFF: Test Clock In =====
  console.log('\n\n--- TESTING STAFF CLOCK IN ---');
  const context3 = await browser.newContext();
  const page3 = await context3.newPage();

  await page3.goto(BASE_URLS.staff);
  await sleep(1000);
  await page3.locator('input[type="tel"]').fill(CREDENTIALS.admin.phone);
  await page3.locator('input[type="password"]').fill(CREDENTIALS.admin.password);
  await page3.locator('button[type="submit"]').click();
  await sleep(3000);

  console.log('Current URL:', page3.url());
  const staffBody = await page3.locator('body').textContent();
  console.log('Staff page preview:', staffBody.substring(0, 800));

  // Look for "Masuk" (Clock In) button
  const masukBtn = page3.locator('button:has-text("Masuk")');
  const masukBtnVisible = await masukBtn.first().isVisible().catch(() => false);
  console.log(`"Masuk" button visible: ${masukBtnVisible}`);

  if (masukBtnVisible) {
    console.log('Clicking "Masuk" (Clock In)...');
    await masukBtn.first().click();
    await sleep(3000);

    const afterClockText = await page3.locator('body').textContent();
    const clockSuccess = afterClockText.includes('Check In') || afterClockText.includes('Berhasil') || afterClockText.includes('成功');
    console.log(`Clock In appears successful: ${clockSuccess}`);
    console.log('After clock in preview:', afterClockText.substring(0, 500));

    // Now try Clock Out
    const pulangBtn = page3.locator('button:has-text("Pulang")');
    if (await pulangBtn.isVisible().catch(() => false)) {
      console.log('Found "Pulang" (Clock Out) button, clicking...');
      await pulangBtn.click();
      await sleep(2000);
      const afterOutText = await page3.locator('body').textContent();
      console.log('After clock out preview:', afterOutText.substring(0, 500));
    } else {
      console.log('"Pulang" (Clock Out) button not visible');
    }
  }

  // ===== STAFF: Test Leave Request =====
  console.log('\n--- TESTING STAFF LEAVE REQUEST ---');
  const cutiBtn = page3.locator('button:has-text("Cuti")');
  if (await cutiBtn.isVisible().catch(() => false)) {
    console.log('Found "Cuti" (Leave) button, clicking...');
    await cutiBtn.click();
    await sleep(2000);

    const leaveModal = page3.locator('[role="dialog"]');
    const leaveModalVisible = await leaveModal.first().isVisible().catch(() => false);
    console.log(`Leave request modal visible: ${leaveModalVisible}`);

    if (!leaveModalVisible) {
      await page3.screenshot({ path: '/Users/liangning/Desktop/Claude_Work/bubble-tea-saas/test-results/staff-leave-attempt.png' });
      console.log('Screenshot saved to test-results/staff-leave-attempt.png');
    }
  } else {
    console.log('"Cuti" button not visible');
  }

  await browser.close();

  console.log('\n\n=== TARGETED TESTING COMPLETE ===');
  console.log('Check test-results/ folder for screenshots of failures');
}

runTargetedTests().catch(console.error);