const { chromium } = require('playwright');

async function testHygiene() {
  console.log('🔍 Starting Hygiene Module Test...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  const errors = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  try {
    // 1. Login
    console.log('1. Testing login...');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    // Find phone input
    const phoneInput = await page.$('input');
    const passwordInput = await page.$('input[type="password"]');

    if (phoneInput && passwordInput) {
      // Login page uses controlled inputs, need to type into them
      await page.fill('input[type="tel"]', '081234567890');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
      console.log('   ✅ Login as admin: 081234567890');
    } else {
      console.log('   ⚠️ Login inputs not found, skipping login');
    }

    // 2. Navigate directly to hygiene new template
    console.log('2. Going to /hygiene/new...');
    await page.goto('http://localhost:5173/hygiene/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 3. Check form
    console.log('3. Checking form...');
    const form = await page.$('form');
    console.log(`   ${form ? '✅ Form found' : '❌ Form not found'}`);

    const saveBtn = await page.$('button[type="submit"]');
    if (saveBtn) {
      const btnText = await saveBtn.textContent();
      console.log(`   ✅ Save button: "${btnText}"`);

      // 4. Fill required fields
      console.log('4. Filling form fields...');
      const inputs = await page.$$('input:not([type="hidden"])');
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const isVisible = await input.isVisible().catch(() => false);
        if (isVisible) {
          const tagName = await input.evaluate(el => el.tagName);
          const type = await input.getAttribute('type');
          const placeholder = await input.getAttribute('placeholder');
          console.log(`   Input ${i}: ${tagName} type="${type}" placeholder="${placeholder}"`);
        }
      }

      // Try to fill first visible text input
      const nameInput = await page.$('input[placeholder*="名称"], input[placeholder*="name"], input[placeholder*="nama"]');
      if (nameInput) {
        await nameInput.fill('Test Template Name');
        console.log('   ✅ Filled template name');
      }

      // 5. Click save
      console.log('5. Clicking save...');
      await saveBtn.click();
      await page.waitForTimeout(3000);

      // Check if anything happened
      const currentUrl = page.url();
      console.log(`   Current URL: ${currentUrl}`);

      if (currentUrl.includes('/hygiene')) {
        console.log('   ✅ Navigated away from form (success?)');
      } else {
        console.log('   ⚠️ Still on form page');
      }
    } else {
      console.log('   ❌ Save button not found');
    }

    // Check errors
    if (errors.length > 0) {
      console.log('\n⚠️ Console Errors:');
      errors.slice(0, 5).forEach(e => console.log('   -', e.substring(0, 150)));
    } else {
      console.log('\n✅ No console errors');
    }

  } catch (err) {
    console.log('❌ Test error:', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n📊 Test complete.');
}

testHygiene();