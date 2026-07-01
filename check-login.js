const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 获取页面所有 input
  const inputs = await page.locator('input').all();
  console.log('Input 数量:', inputs.length);

  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    const id = await inputs[i].getAttribute('id');
    console.log('Input', i, '- type:', type, ', placeholder:', placeholder, ', id:', id);
  }

  // 获取所有按钮
  const buttons = await page.locator('button').all();
  console.log('\nButton 数量:', buttons.length);

  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].textContent();
    const type = await buttons[i].getAttribute('type');
    console.log('Button', i, '- text:', text.trim(), ', type:', type);
  }

  // 尝试登录
  console.log('\n尝试登录...');
  const phoneInput = page.locator('input').first();
  const passwordInput = page.locator('input[type="password"]');

  await phoneInput.fill('081234567890');
  await passwordInput.fill('admin123');
  await page.waitForTimeout(500);

  const loginBtn = page.locator('button[type="submit"]');
  await loginBtn.click();
  await page.waitForTimeout(3000);

  console.log('登录后 URL:', page.url());

  if (!page.url().includes('login')) {
    console.log('✅ 登录成功!');
  } else {
    console.log('❌ 登录失败，可能需要检查');
    // 获取页面错误信息
    const errorText = await page.locator('body').textContent();
    if (errorText.includes('错误') || errorText.includes('error')) {
      console.log('页面显示错误');
    }
  }

  await browser.close();
})();
