/**
 * 深度测试：库存补货页面
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRestock() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // 登录
  console.log('登录中...');
  await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log('已登录\n');

  // 测试库存补货页面
  console.log('========== 库存补货页面测试 ==========');

  // 方法1: 直接访问补货页面
  console.log('\n1. 直接访问 /inventory/restock');
  await page.goto(ADMIN_URL + '/inventory/restock', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  const restockText = await page.textContent('body');
  console.log('页面长度:', restockText.length);
  console.log('页面内容预览:', restockText.substring(0, 300).replace(/\n/g, ' '));

  // 检查页面是否有实质内容
  const hasContent = restockText.length > 100;
  console.log('有实质内容:', hasContent);

  // 检查是否包含补货相关关键词
  const hasRestockKeyword = restockText.includes('Restock') || restockText.includes('补货') ||
                           restockText.includes('Saran') || restockText.includes('Suggestion') ||
                           restockText.includes('Restok');
  console.log('包含补货关键词:', hasRestockKeyword);

  // 检查是否有错误提示
  const hasError = restockText.includes('Error') || restockText.includes('404') || restockText.includes('500');
  console.log('有错误提示:', hasError);

  // 方法2: 从库存页面导航
  console.log('\n2. 从库存页面导航到补货');

  await page.goto(ADMIN_URL + '/inventory', { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(2000);

  // 查找补货相关按钮
  const restockBtn = page.locator('a[href*="restock"], button:has-text(/restock|saran|restok|补货/i)');
  const btnCount = await restockBtn.count();
  console.log('找到补货按钮/链接数量:', btnCount);

  if (btnCount > 0) {
    const btnText = await restockBtn.first().textContent();
    console.log('按钮文本:', btnText.trim());

    await restockBtn.first().click();
    await page.waitForTimeout(2000);

    const newUrl = page.url();
    console.log('点击后URL:', newUrl);

    const newText = await page.textContent('body');
    console.log('新页面长度:', newText.length);
    console.log('新页面包含补货内容:', newText.includes('Restock') || newText.includes('补货') || newText.includes('Saran'));
  }

  // 检查网络请求，看是否有API错误
  console.log('\n3. 检查API请求');
  const apiErrors = [];
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      apiErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(ADMIN_URL + '/inventory/restock', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  if (apiErrors.length > 0) {
    console.log('API错误:');
    apiErrors.forEach(e => console.log('  -', e));
  } else {
    console.log('无API错误');
  }

  // 截图
  await page.screenshot({ path: 'restock-page.png', fullPage: true });
  console.log('\n已截图: restock-page.png');

  await browser.close();
  console.log('\n测试完成');
}

testRestock().catch(console.error);
