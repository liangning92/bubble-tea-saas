const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n=== Tab点击测试 ===\n');

  try {
    // 登录
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 进入产品页面
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('当前URL:', page.url());

    // 查找所有Tab链接
    const tabLinks = await page.$$('a[href*="/products/"]');
    console.log(`\n找到 ${tabLinks.length} 个产品相关链接:`);
    for (let i = 0; i < tabLinks.length; i++) {
      const href = await tabLinks[i].getAttribute('href');
      const text = await tabLinks[i].innerText();
      console.log(`  [${i}] "${text}" -> ${href}`);
    }

    // 点击配方Tab
    console.log('\n--- 点击"Resep"Tab ---');
    const resepLink = await page.$('a:has-text("Resep")');
    if (resepLink) {
      const href = await resepLink.getAttribute('href');
      console.log(`找到Resep链接: ${href}`);
      console.log('点击前URL:', page.url());

      await resepLink.click();
      await page.waitForTimeout(2000);

      console.log('点击后URL:', page.url());
      console.log('URL变化:', page.url().includes('/recipes') ? '✅ 变化' : '❌ 无变化');

      // 检查页面内容
      const pageText = await page.evaluate(() => document.body.innerText);
      const hasContent = pageText.includes('Resep') || pageText.includes('BOM') || pageText.includes('Biaya');
      console.log('页面有内容:', hasContent ? '✅ 是' : '❌ 否');
    } else {
      console.log('❌ 未找到Resep链接');
    }

    // 测试其他Tab是否正常
    console.log('\n--- 测试其他Tab ---');
    const tabsToTest = ['Analisis Biaya', 'Tambahan', 'Analisis'];
    for (const tabText of tabsToTest) {
      await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      const tab = await page.$(`a:has-text("${tabText}")`);
      if (tab) {
        const href = await tab.getAttribute('href');
        await tab.click();
        await page.waitForTimeout(2000);
        const urlChanged = !page.url().endsWith('/products') && !page.url().endsWith('/products/');
        console.log(`${tabText}: ${urlChanged ? '✅ 跳转成功 -> ' + page.url() : '❌ 无反应'}`);
      }
    }

  } catch (e) {
    console.error('测试异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();