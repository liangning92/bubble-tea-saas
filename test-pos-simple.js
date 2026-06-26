const { chromium } = require('playwright');

async function runSimpleTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Connecting to POS...');

  // Go to POS and login
  await page.goto('http://localhost:6063/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"], input[placeholder*="08"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  console.log('After login URL:', page.url());

  // Get visible text content
  const bodyText = await page.textContent('body');
  console.log('\nBody contains keywords:');
  console.log('- "挂":', bodyText.includes('挂') || bodyText.includes('Gantung'));
  console.log('- "历史":', bodyText.includes('历史') || bodyText.includes('Riwayat'));
  console.log('- "购物车":', bodyText.includes('购物车') || bodyText.includes('Cart') || bodyText.includes('Keranjang'));
  console.log('- "产品":', bodyText.includes('产品') || bodyText.includes('Produk') || bodyText.includes('Menu'));

  // Get all buttons
  const buttons = await page.$$('button');
  console.log('\nTotal buttons found:', buttons.length);

  for (let i = 0; i < Math.min(buttons.length, 20); i++) {
    const text = await buttons[i].textContent();
    if (text && text.trim()) {
      console.log(`  Button ${i}: "${text.trim()}"`);
    }
  }

  // Check for main navigation elements
  const navItems = await page.$$('nav a, aside a, [class*="sidebar"] a, [class*="menu"] a');
  console.log('\nNav/menu items:', navItems.length);

  await browser.close();
}

runSimpleTest().catch(console.error);