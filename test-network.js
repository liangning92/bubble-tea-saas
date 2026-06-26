const { chromium } = require('playwright');

async function testNetwork() {
  console.log('🔍 测试网络请求...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 监听所有网络请求
  const requests = [];
  page.on('request', req => {
    if (req.method() !== 'GET') {
      requests.push({ method: req.method(), url: req.url(), postData: req.postData()?.substring(0, 100) });
    }
  });
  
  const responses = [];
  page.on('response', res => {
    if (res.status() >= 400) {
      responses.push({ status: res.status(), url: res.url() });
    }
  });
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    // 登录
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('✅ 登录成功\n');

    // 测试卫生模板表单
    console.log('【测试卫生模板表单】');
    await page.goto('http://localhost:5173/hygiene/new');
    await page.waitForSelector('form');
    
    // 填写名称
    const nameInput = await page.$('input[placeholder*="名称"], input[placeholder*="nama"], input[placeholder*="name"]');
    if (nameInput) {
      await nameInput.fill('测试模板名称');
      console.log('✅ 已填写名称');
    }
    
    // 点击保存按钮
    console.log('点击保存...');
    const saveBtn = await page.$('button[type="submit"]');
    await saveBtn.click();
    
    // 等待网络请求
    await page.waitForTimeout(3000);
    
    // 检查请求
    console.log('\n📡 发送的非GET请求:');
    requests.forEach(r => {
      console.log(`   ${r.method} ${r.url.substring(0, 60)}`);
    });
    
    console.log('\n❌ 失败的响应 (4xx/5xx):');
    responses.forEach(r => {
      console.log(`   ${r.status} ${r.url.substring(0, 60)}`);
    });
    
    console.log('\n⚠️ 控制台错误:');
    errors.filter(e => !e.includes('DevTools')).slice(0, 3).forEach(e => console.log('   ', e.substring(0, 100)));
    
    console.log('\n📌 当前URL:', page.url());
    
  } catch (err) {
    console.log('❌ 测试错误:', err.message);
  } finally {
    await browser.close();
  }
}

testNetwork();
