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

async function login(page, app) {
  const baseUrl = BASE_URLS[app];
  await page.goto(baseUrl);
  await sleep(2000);

  // Find and fill phone input
  const phoneInput = page.locator('input').filter({ hasText: '' }).first();
  await page.locator('input[type="tel"], input[name="phone"]').first().fill(CREDENTIALS.admin.phone);
  await page.locator('input[type="password"]').first().fill(CREDENTIALS.admin.password);
  await page.locator('button[type="submit"]').first().click();
  await sleep(3000);
}

async function investigateProducts(page) {
  console.log('\n--- INVESTIGATING PRODUCTS PAGE ---');
  await page.goto(BASE_URLS.admin + '/products');
  await sleep(3000);

  // Get full page content
  const bodyText = await page.locator('body').textContent();
  console.log('Page content preview (first 2000 chars):');
  console.log(bodyText.substring(0, 2000));

  // List all buttons
  const buttons = await page.locator('button').all();
  console.log('\nAll buttons on page:');
  for (const btn of buttons) {
    const text = await btn.textContent();
    const isVisible = await btn.isVisible();
    console.log(`  Button: "${text.trim()}" - visible: ${isVisible}`);
  }

  // List all clickable elements
  const clickables = await page.locator('[role="button"], .cursor-pointer, [class*="click"]').all();
  console.log('\nClickable elements:', clickables.length);

  // Check for any modal-like elements
  const modals = await page.locator('[role="dialog"], .modal, .fixed.inset-0, [class*="overlay"]').all();
  console.log('Modal-like elements:', modals.length);

  // Check what language keys are visible
  console.log('\nChecking for language-specific strings:');
  const idStrings = ['Tambah', 'Hapus', 'Edit', 'Produk', 'items'];
  const zhStrings = ['产品', '新增', '编辑', '删除', '商品'];
  const enStrings = ['Product', 'Add', 'Items'];

  for (const str of idStrings) {
    if (bodyText.includes(str)) console.log(`  Found Indonesian: "${str}"`);
  }
  for (const str of zhStrings) {
    if (bodyText.includes(str)) console.log(`  Found Chinese: "${str}"`);
  }
  for (const str of enStrings) {
    if (bodyText.includes(str)) console.log(`  Found English: "${str}"`);
  }
}

async function investigateInventory(page) {
  console.log('\n--- INVESTIGATING INVENTORY PAGE ---');
  await page.goto(BASE_URLS.admin + '/inventory');
  await sleep(3000);

  const bodyText = await page.locator('body').textContent();
  console.log('Page content preview (first 2000 chars):');
  console.log(bodyText.substring(0, 2000));

  // Check for language strings
  const idStrings = ['Stok', 'Tambah', 'inventory', 'items'];
  const zhStrings = ['库存', '产品', '入库', '出库'];
  const enStrings = ['Stock', 'Add', 'Inventory'];

  console.log('\nLanguage detection:');
  for (const str of idStrings) {
    if (bodyText.includes(str)) console.log(`  Found Indonesian: "${str}"`);
  }
  for (const str of zhStrings) {
    if (bodyText.includes(str)) console.log(`  Found Chinese: "${str}"`);
  }
  for (const str of enStrings) {
    if (bodyText.includes(str)) console.log(`  Found English: "${str}"`);
  }
}

async function investigatePOS(page) {
  console.log('\n--- INVESTIGATING POS PAGE ---');
  await page.goto(BASE_URLS.pos + '/dashboard');
  await sleep(3000);

  const bodyText = await page.locator('body').textContent();
  console.log('Page content preview (first 2000 chars):');
  console.log(bodyText.substring(0, 2000));

  // List all buttons
  const buttons = await page.locator('button').all();
  console.log('\nAll buttons on POS:');
  for (const btn of buttons) {
    const text = await btn.textContent();
    const isVisible = await btn.isVisible();
    console.log(`  Button: "${text.trim()}" - visible: ${isVisible}`);
  }

  // List all clickable product cards
  const cards = await page.locator('[class*="card"], [class*="product"], [class*="item"], .cursor-pointer').all();
  console.log('\nProduct/item cards:', cards.length);

  // Check for checkout-related text
  const checkoutRelated = await page.locator('text=/bayar|pay|checkout|total|total:/i').all();
  console.log('Checkout-related elements:', checkoutRelated.length);

  // Navigate to orders page
  console.log('\n--- POS ORDERS PAGE ---');
  await page.goto(BASE_URLS.pos + '/orders');
  await sleep(3000);

  const ordersText = await page.locator('body').textContent();
  console.log('Orders page preview:');
  console.log(ordersText.substring(0, 1500));

  const orderButtons = await page.locator('button').all();
  console.log('\nAll buttons on orders page:');
  for (const btn of orderButtons) {
    const text = await btn.textContent();
    const isVisible = await btn.isVisible();
    console.log(`  Button: "${text.trim()}" - visible: ${isVisible}`);
  }
}

async function investigateStaff(page) {
  console.log('\n--- INVESTIGATING STAFF PAGE ---');
  await page.goto(BASE_URLS.staff);
  await sleep(3000);

  const bodyText = await page.locator('body').textContent();
  console.log('Page content preview (first 2000 chars):');
  console.log(bodyText.substring(0, 2000));

  // List all buttons
  const buttons = await page.locator('button').all();
  console.log('\nAll buttons on Staff page:');
  for (const btn of buttons) {
    const text = await btn.textContent();
    const isVisible = await btn.isVisible();
    console.log(`  Button: "${text.trim()}" - visible: ${isVisible}`);
  }

  // Try clicking on the main action area
  console.log('\nLooking for attendance/clock section...');
  const attendanceSection = await page.locator('text=/absen|attendance|hadir|clock/i').first();
  if (await attendanceSection.isVisible().catch(() => false)) {
    console.log('Found attendance section');
    const parent = await attendanceSection.locator('..').first();
    const parentText = await parent.textContent().catch(() => '');
    console.log('Parent content:', parentText);
  }
}

async function runInvestigation() {
  console.log('=== DETAILED WALKTHROUGH INVESTIGATION ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login to Admin
  console.log('Logging into Admin...');
  await login(page, 'admin');
  console.log('Admin logged in, URL:', page.url());

  // Investigate Products
  await investigateProducts(page);

  // Investigate Inventory
  await investigateInventory(page);

  // Close admin context and start fresh for POS
  await context.close();
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();

  console.log('\n\nLogging into POS...');
  await login(page2, 'pos');
  console.log('POS logged in, URL:', page2.url());

  await investigatePOS(page2);

  // Close POS context and start fresh for Staff
  await context2.close();
  const context3 = await browser.newContext();
  const page3 = await context3.newPage();

  console.log('\n\nLogging into Staff...');
  await login(page3, 'staff');
  console.log('Staff logged in, URL:', page3.url());

  await investigateStaff(page3);

  await browser.close();
  console.log('\n\n=== INVESTIGATION COMPLETE ===');
}

runInvestigation().catch(console.error);