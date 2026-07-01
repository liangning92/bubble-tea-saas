/**
 * 详细调试页面加载问题
 */

const { chromium } = require('playwright');

const ADMIN_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function debugPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // 监听网络请求
  page.on('response', response => {
    if (response.url().includes('/api/') && !response.url().includes('health')) {
      console.log(`API: ${response.status()} ${response.url().substring(0, 80)}`);
    }
  });

  // 登录
  console.log('登录中...');
  await page.goto(ADMIN_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log('已登录\n');

  // 测试几个关键页面
  const pages = [
    { name: 'orders', path: '/orders' },
    { name: 'expenses', path: '/expenses' },
    { name: 'reports', path: '/reports' },
  ];

  for (const p of pages) {
    console.log(`\n========== ${p.name} ==========`);
    console.log(`URL: ${ADMIN_URL}${p.path}`);

    await page.goto(ADMIN_URL + p.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);

    // 获取 HTML 内容
    const html = await page.content();
    console.log(`HTML 长度: ${html.length}`);

    // 获取 body 文本
    const text = await page.textContent('body');
    console.log(`Body 文本: "${text.substring(0, 100).replace(/\n/g, ' ')}"`);
    console.log(`Body 长度: ${text.length}`);

    // 截图
    await page.screenshot({ path: `debug-${p.name}.png` });
    console.log(`已截图: debug-${p.name}.png`);

    // 检查是否有错误元素
    const errorElements = await page.locator('.ant-result, .ant Alert, [class*="error"]').count();
    console.log(`错误元素数量: ${errorElements}`);
  }

  // 测试 products 页面作为对比
  console.log('\n========== products (对比) ==========');
  await page.goto(ADMIN_URL + '/products', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(3000);

  const productsText = await page.textContent('body');
  console.log(`Products Body 长度: ${productsText.length}`);

  await browser.close();
  console.log('\n调试完成');
}

debugPages().catch(console.error);
