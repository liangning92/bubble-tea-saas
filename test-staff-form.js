const { chromium } = require('playwright');

async function testStaffForm() {
  console.log('Testing Staff Form with React events...');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', msg => console.log('CONSOLE:', msg.type(), '-', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  page.on('request', req => {
    if (req.url().includes('/api/staff')) {
      console.log('\n>> STAFF API:', req.method(), req.url());
      console.log('Body:', req.postData());
    }
  });

  page.on('response', res => {
    if (res.url().includes('/api/staff')) {
      res.text().then(body => console.log('\n<< RESPONSE:', res.status(), body));
    }
  });

  page.on('dialog', async dialog => {
    console.log('\nDIALOG:', dialog.message());
    await dialog.accept();
  });

  try {
    // 1. Login
    console.log('\n=== Login ===');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('Logged in');

    // 2. Go to staff form
    console.log('\n=== Staff Form ===');
    await page.goto('http://localhost:5173/staff/new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 3. Fill using React-compatible approach with fill + dispatchEvent
    console.log('\n=== Fill Form ===');

    // Fill name
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill('Test Staff');
    await nameInput.dispatchEvent('input');
    console.log('Filled name');

    // Fill phone
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('081234569822');
    await phoneInput.dispatchEvent('input');
    console.log('Filled phone');

    // Fill password
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('test123456');
    await passwordInput.dispatchEvent('input');
    console.log('Filled password');

    await page.waitForTimeout(1000);

    // Debug: Check React internal state (if accessible)
    const debugInfo = await page.evaluate(() => {
      // Try to find React component
      const form = document.querySelector('form');
      if (form) {
        const keys = Object.keys(form);
        return { formFound: true, keys: keys.slice(0, 5) };
      }
      return { formFound: false };
    });
    console.log('Debug:', debugInfo);

    // 4. Submit using form submit directly
    console.log('\n=== Submit ===');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        console.log('Found form, submitting...');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } else {
        console.log('No form found');
      }
    });
    await page.waitForTimeout(5000);
    console.log('Final URL:', page.url());

    await page.screenshot({ path: '/tmp/staff-form-result.png' });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testStaffForm();