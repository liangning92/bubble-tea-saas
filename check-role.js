const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:6063/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Get user role from localStorage
  const auth = await page.evaluate(() => {
    const auth = localStorage.getItem('pos-auth');
    if (auth) {
      const parsed = JSON.parse(auth);
      return parsed.state?.user?.role;
    }
    return null;
  });
  console.log('User role:', auth);
  await browser.close();
})();
