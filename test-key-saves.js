const { chromium } = require('playwright');

async function testKey() {
  console.log('Testing key save functions\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const errors = [];
  const networkErrors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('DevTools') && !t.includes('Download')) errors.push(t);
    }
  });
  
  page.on('response', res => {
    if (res.status() >= 400) {
      networkErrors.push(res.status() + ' ' + res.url());
    }
  });

  try {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('Login OK\n');

    // Test 1: Hygiene Template Save
    console.log('[1] Hygiene Template Save');
    await page.goto('http://localhost:5173/hygiene/new');
    await page.waitForLoadState('networkidle');
    const nameInput = await page.$('input[placeholder*="name"], input[name*="name"]');
    if (nameInput) await nameInput.fill('Test Template ' + Date.now());
    const templateSaveBtn = await page.$('button[type="submit"]');
    if (templateSaveBtn) {
      await templateSaveBtn.click();
      await page.waitForTimeout(2000);
      const url = page.url();
      console.log(url.includes('/hygiene') && !url.includes('/new') ? 'OK: Template saved, redirected' : 'FAIL: ' + url);
    }

    // Test 2: Staff Save  
    console.log('\n[2] Staff Save');
    await page.goto('http://localhost:5173/staff/new');
    await page.waitForLoadState('networkidle');
    const staffName = await page.$('input[placeholder*="name"], input[name*="name"]');
    if (staffName) {
      await staffName.fill('Test Staff');
      const staffSaveBtn = await page.$('button[type="submit"]');
      if (staffSaveBtn) {
        await staffSaveBtn.click();
        await page.waitForTimeout(2000);
        const url = page.url();
        console.log(url.includes('/staff') && !url.includes('/new') ? 'OK: Staff saved' : 'FAIL: ' + url);
      }
    }

    console.log('\n--- Network Errors ---');
    if (networkErrors.length > 0) {
      networkErrors.forEach(e => console.log(e));
    } else {
      console.log('None');
    }
    
    console.log('--- Console Errors ---');
    if (errors.length > 0) {
      errors.forEach(e => console.log(e.substring(0, 100)));
    } else {
      console.log('None');
    }

  } catch (err) {
    console.log('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testKey();
