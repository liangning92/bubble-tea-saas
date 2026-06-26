const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 检查页面内容 ===\n');

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // 自动化规则
  console.log('【自动化规则】');
  await page.goto(`${BASE_URL}/marketing/operations/automation/rules`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  let text = await page.evaluate(() => document.body.innerText);
  console.log(`内容长度: ${text.length}`);
  console.log(`内容: ${text.substring(0, 500)}`);

  const buttons = await page.$$('button');
  console.log(`按钮数: ${buttons.length}`);

  // 检查网络请求看是否有错误
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 积分规则
  console.log('\n【积分规则】');
  await page.goto(`${BASE_URL}/marketing/points`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  text = await page.evaluate(() => document.body.innerText);
  console.log(`内容长度: ${text.length}`);
  console.log(`内容: ${text.substring(0, 500)}`);

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})();