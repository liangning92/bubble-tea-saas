const { chromium } = require('playwright');

async function debugAttendance() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 登录
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  // 访问员工考勤
  await page.goto('http://localhost:5173/staff/attendance', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  const text = await page.textContent('body');
  console.log('页面长度:', text.length);
  console.log('内容预览:', text.substring(0, 500).replace(/\n/g, ' '));

  await browser.close();
}

debugAttendance().catch(console.error);
