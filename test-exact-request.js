const { chromium } = require('playwright');

async function testStaffForm() {
  console.log('Testing Staff Form - Exact Request Capture...');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  let staffRequest = null;

  page.on('request', req => {
    if (req.url().includes('/api/staff') && req.method() === 'POST') {
      staffRequest = {
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData(),
        postDataParsed: JSON.parse(req.postData() || '{}')
      };
    }
  });

  page.on('response', res => {
    if (res.url().includes('/api/staff') && res.status() !== 200) {
      res.text().then(body => {
        console.log('\n=== ERROR RESPONSE ===');
        console.log('Status:', res.status());
        console.log('Body:', body);
      });
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
    await page.goto('http://localhost:5173/staff/new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 3. Fill form
    console.log('\n=== Fill Form ===');
    await page.locator('input[type="text"]').first().fill('Test Staff Real');
    await page.locator('input[type="tel"]').first().fill('081234569777');
    await page.locator('input[type="password"]').fill('test123456');
    await page.waitForTimeout(500);

    // 4. Submit
    console.log('\n=== Submit ===');
    await page.evaluate(() => {
      document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true }));
    });
    await page.waitForTimeout(5000);

    // 5. Print captured request
    if (staffRequest) {
      console.log('\n=== CAPTURED REQUEST ===');
      console.log('postData string:', staffRequest.postData);
      console.log('postData parsed:', JSON.stringify(staffRequest.postDataParsed, null, 2));
    }

    console.log('\nFinal URL:', page.url());
    await page.screenshot({ path: '/tmp/staff-result.png' });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testStaffForm();