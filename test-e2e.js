const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  console.log('=== POS E2E Test ===');

  // Login
  await page.goto('http://localhost:6063/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/pos-e2e-01-login.png' });
  console.log('01 Login OK:', page.url());

  // Channel select - click 堂食
  await page.locator('button').filter({ hasText: '堂食' }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/pos-e2e-02-channel.png' });
  
  // Select 5 people
  await page.locator('button').filter({ hasText: '5' }).first().click();
  await page.waitForTimeout(300);
  
  // Confirm
  await page.locator('button').filter({ hasText: 'confirm' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/pos-e2e-03-main.png' });

  // Add to cart
  await page.locator('text=Blueberry Seed Tea').first().click();
  await page.waitForTimeout(1000);
  await page.locator('button').filter({ hasText: '加入购物车' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/pos-e2e-04-cart.png' });
  console.log('04 Cart OK');

  // Checkout
  await page.locator('button').filter({ hasText: '结账' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/pos-e2e-05-checkout.png' });
  
  // Select cash
  await page.locator('text=现金').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/pos-e2e-06-cash.png' });
  
  // Quick amount
  await page.locator('text=50.000').click();
  await page.waitForTimeout(300);
  
  // Confirm pay
  await page.locator('button').filter({ hasText: '确认支付' }).click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/pos-e2e-07-result.png' });
  console.log('07 Pay Done');

  // History
  await page.locator('button').filter({ hasText: '历史' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/pos-e2e-08-history.png' });
  
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Shift
  await page.locator('button').filter({ hasText: '交班' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/pos-e2e-09-shift.png' });

  console.log('=== Test Complete ===');
  console.log('Screenshots in test-results/pos-e2e-*.png');
  
  await browser.close();
})();
