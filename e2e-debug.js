const { chromium } = require('playwright');
const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:7072';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       端到端业务流程测试 - 完整数据流验证                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  try {
    // ========== 登录获取Token ==========
    console.log('【步骤1: 登录获取认证Token】\n');

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 从localStorage获取token
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const user = await page.evaluate(() => localStorage.getItem('user'));
    console.log(`Token获取: ${token ? '成功' : '失败'} (${token ? token.substring(0, 20) + '...' : 'null'})`);
    console.log(`用户信息: ${user || 'null'}`);

    if (!token) {
      console.log('\n❌ 无法获取token，测试终止');
      await browser.close();
      process.exit(1);
    }

    // ========== 添加产品 ==========
    console.log('\n【步骤2: 添加产品并验证数据流】\n');

    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const uniqueName = 'E2E测试产品-' + Date.now();
    console.log(`添加产品: ${uniqueName}`);

    // 点击添加
    await page.click('button:has-text("Tambah Produk")');
    await page.waitForTimeout(1500);

    // 填写表单
    await page.fill('form input[type="text"]', uniqueName);

    // 选择分类
    const select = await page.$('form select');
    if (select) {
      const opts = await select.$$('option');
      if (opts.length > 1) await select.selectOption({ index: 1 });
    }

    // 输入价格
    await page.fill('form input[type="number"]', '20000');

    // 提交
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(3000);

    // ========== 验证前端显示 ==========
    console.log('\n【步骤3: 验证前端列表显示】\n');
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const pageText = await page.evaluate(() => document.body.innerText);
    const foundInUI = pageText.includes(uniqueName);
    console.log(`前端验证: ${foundInUI ? '✅ 找到' : '❌ 未找到'} - ${uniqueName}`);

    // ========== 验证API数据 ==========
    console.log('\n【步骤4: 验证API数据库保存】\n');

    // 使用Playwright的API请求（带cookie和token）
    const apiResponse = await page.evaluate(async (t) => {
      const res = await fetch('http://localhost:7072/api/products?pageSize=100', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      return res.json();
    }, token);

    console.log('API响应:', JSON.stringify(apiResponse).substring(0, 300));

    const foundInAPI = apiResponse?.data?.list?.some(p => p.name.includes('E2E测试产品'));
    console.log(`\nAPI验证: ${foundInAPI ? '✅ 数据库中找到' : '❌ 数据库中未找到'}`);

    // 如果找到，获取详情
    if (foundInAPI) {
      const product = apiResponse.data.list.find(p => p.name.includes('E2E测试产品'));
      console.log(`产品ID: ${product.id}`);
      console.log(`产品名称: ${product.name}`);
      console.log(`产品分类: ${product.categoryId}`);
      console.log(`产品状态: ${product.status}`);
      console.log(`创建时间: ${product.createdAt}`);
    }

    // ========== 完整流程测试总结 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                      数据流验证总结                             ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');
    console.log(`前端显示: ${foundInUI ? '✅ 正常' : '❌ 异常'}`);
    console.log(`API/数据库: ${foundInAPI ? '✅ 正常' : '❌ 异常'}`);

    if (foundInUI && foundInAPI) {
      console.log('\n✅ 完整数据流验证通过！产品创建 → 前端显示 → 数据库保存全部正常\n');
    } else {
      console.log('\n⚠️ 数据流存在问题，需要检查\n');
    }

  } catch (e) {
    console.error('\n测试异常:', e.message);
  }

  await browser.close();
  process.exit(0);
})();