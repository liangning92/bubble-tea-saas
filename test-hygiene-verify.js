const { chromium } = require('playwright');

async function verifyHygieneModule() {
  console.log('Starting hygiene module verification...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE: ' + err.message));

  try {
    // 1. Login
    console.log('\n=== Step 1: Login ===');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('Logged in');

    // 2. Navigate to Today Tasks
    console.log('\n=== Step 2: Navigate to Today Tasks ===');
    await page.goto('http://localhost:5173/hygiene/today', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 3. Click Add Temporary Task button
    console.log('\n=== Step 3: Open Create Modal ===');
    await page.click('button:has-text("Tambah Tugas Sementara")');
    await page.waitForTimeout(2000);

    // 4. Get HTML of modal to debug structure
    console.log('\n=== Step 4: Debug Modal Structure ===');
    const modalContent = await page.$eval('[class*="max-w-md"]', el => el.innerHTML).catch(() => 'not found');
    console.log('Modal content (first 500 chars):', modalContent.substring(0, 500));

    // Count inputs differently
    const allInputs = await page.$$('input');
    console.log('Total inputs on page:', allInputs.length);

    const textInputs = await page.$$('input[type="text"], input[type="tel"], input[type="number"], textarea');
    console.log('Text/number inputs:', textInputs.length);

    for (const input of textInputs) {
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');
      const name = await input.getAttribute('name');
      console.log(`  Input: type=${type}, placeholder="${placeholder}", name="${name}"`);
    }

    // 5. Fill form
    console.log('\n=== Step 5: Fill Form ===');
    const taskNameInput = await page.$('input[placeholder*="task"], input[placeholder*="tugas"], input[placeholder*="任务"]');
    if (taskNameInput) {
      await taskNameInput.fill('Test Task ' + Date.now());
      console.log('Filled task name');
    } else {
      // Try by placeholder
      const firstInput = await page.$('input[placeholder]');
      if (firstInput) {
        const placeholder = await firstInput.getAttribute('placeholder');
        console.log('Found input with placeholder:', placeholder);
        await firstInput.fill('Test Task ' + Date.now());
        console.log('Filled first input');
      }
    }

    // 6. Submit
    console.log('\n=== Step 6: Submit ===');
    const saveBtn = await page.$('button:has-text("Simpan"), button:has-text("保存"), button[type="submit"]');
    if (saveBtn) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
      console.log('Clicked save');
    }

    console.log('\n=== Results ===');
    console.log('Errors:', errors.length > 0 ? errors : 'None');
    console.log('Final URL:', page.url());

    await page.screenshot({ path: '/tmp/hygiene-modal-test.png', fullPage: true });
    console.log('Screenshot saved');

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/hygiene-error.png' });
  } finally {
    await browser.close();
  }
  console.log('\nDone');
}

verifyHygieneModule();