const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== 配方页面测试 ===\n');

  // 收集控制台错误
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    errors.push(err.message);
  });

  try {
    // 登录
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('--- 测试 /products/recipes ---\n');
    await page.goto(`${BASE_URL}/products/recipes`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const recipesUrl = page.url();
    const recipesText = await page.evaluate(() => document.body.innerText);
    console.log(`URL: ${recipesUrl}`);
    console.log(`页面内容长度: ${recipesText.length}`);
    console.log(`页面内容前500字符:\n${recipesText.substring(0, 500)}`);

    if (errors.length > 0) {
      console.log('\n控制台错误:');
      errors.forEach(e => console.log(`  ❌ ${e}`));
    } else {
      console.log('\n✅ 无控制台错误');
    }

    // 清理错误，准备下一个测试
    errors.length = 0;

    console.log('\n--- 测试 /products/:id/recipe ---\n');

    // 先获取一个产品ID
    const productsAPI = await page.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token;
      const res = await fetch('http://localhost:7072/api/products?pageSize=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      return data?.data?.list?.[0]?.id;
    });

    if (productsAPI) {
      console.log(`产品ID: ${productsAPI}`);

      await page.goto(`${BASE_URL}/products/${productsAPI}/recipe`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      const recipeUrl = page.url();
      const recipeText = await page.evaluate(() => document.body.innerText);
      console.log(`URL: ${recipeUrl}`);
      console.log(`页面内容长度: ${recipeText.length}`);
      console.log(`页面内容前500字符:\n${recipeText.substring(0, 500)}`);

      if (errors.length > 0) {
        console.log('\n控制台错误:');
        errors.forEach(e => console.log(`  ❌ ${e}`));
      } else {
        console.log('\n✅ 无控制台错误');
      }
    } else {
      console.log('无法获取产品ID，跳过产品配方测试');
    }

  } catch (e) {
    console.error('测试异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();