const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 检查按钮文字 ===\n');

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // 检查自动化规则页
  console.log('【自动化规则】');
  await page.goto(`${BASE_URL}/marketing/operations/automation/rules`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const buttons1 = await page.$$('button');
  console.log(`按钮总数: ${buttons1.length}`);
  for (let i = 0; i < Math.min(buttons1.length, 10); i++) {
    const text = await buttons1[i].innerText();
    if (text.trim()) console.log(`  "${text}"`);
  }

  // 检查积分规则页
  console.log('\n【积分规则】');
  await page.goto(`${BASE_URL}/marketing/points`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const buttons2 = await page.$$('button');
  console.log(`按钮总数: ${buttons2.length}`);
  for (let i = 0; i < Math.min(buttons2.length, 10); i++) {
    const text = await buttons2[i].innerText();
    if (text.trim()) console.log(`  "${text}"`);
  }

  // 检查消息渠道页
  console.log('\n【消息渠道】');
  await page.goto(`${BASE_URL}/marketing/messages/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const buttons3 = await page.$$('button');
  console.log(`按钮总数: ${buttons3.length}`);
  for (let i = 0; i < Math.min(buttons3.length, 10); i++) {
    const text = await buttons3[i].innerText();
    if (text.trim()) console.log(`  "${text}"`);
  }

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})();