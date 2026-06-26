const { chromium } = require('playwright');

async function test() {
  console.log('Testing Admin access...');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Test admin page
    console.log('1. Loading http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 10000 });
    console.log('   Page loaded, URL:', page.url());

    // Wait a bit for React to render
    await page.waitForTimeout(2000);

    // Check page title or content
    const content = await page.content();
    console.log('   Page has login form:', content.includes('login') || content.includes('Login'));
    console.log('   Page has卫生管理:', content.includes('hygiene') || content.includes('Hygiene'));

    await page.screenshot({ path: '/tmp/admin-page.png' });
    console.log('   Screenshot saved');

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/admin-error.png' });
  } finally {
    await browser.close();
  }
  console.log('Done');
}

test();