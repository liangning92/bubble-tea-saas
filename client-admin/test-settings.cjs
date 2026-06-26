const { chromium } = require('playwright');

async function testSettings() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 登录
    await page.goto('http://localhost:5175/login');
    await page.fill('input[type="tel"]', '081234567890');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('✅ 登录成功');
    
    // 进入财务设置页面
    console.log('\n=== 测试财务设置页面 ===');
    await page.goto('http://localhost:5175/finance/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const title = await page.textContent('h1');
    console.log('页面标题:', title);
    
    // 检查是否有模式选择
    const simpleMode = await page.$('text=/Simple Mode|Mode Sederhana|简单模式/');
    const standardMode = await page.$('text=/Standard Mode|Mode Standar|标准模式/');
    console.log('有简单模式选项:', !!simpleMode);
    console.log('有标准模式选项:', !!standardMode);
    
    // 检查是否有功能开关
    const accountToggle = await page.$('text=/Account Management|Manajemen Akun|账户管理/');
    console.log('有账户管理开关:', !!accountToggle);
    
    // 检查是否有设置按钮
    const settingsTab = await page.$('text=/Settings|Pengaturan|设置/');
    console.log('有设置Tab:', !!settingsTab);
    
    // 截图
    await page.screenshot({ path: 'finance-settings.png', fullPage: true });
    console.log('截图已保存: finance-settings.png');
    
    // 测试切换到简单模式
    if (simpleMode) {
      await simpleMode.click();
      await page.waitForTimeout(500);
      console.log('✅ 点击简单模式');
    }
    
    // 检查导航Tab变化
    const tabs = await page.$$eval('a[href*="/finance/"]', els => els.map(e => e.textContent?.trim()).filter(Boolean));
    console.log('财务Tab列表:', tabs);
    
    console.log('\n✅ 财务设置功能测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    await page.screenshot({ path: 'error-settings.png' });
  }
  
  await browser.close();
}

testSettings().catch(console.error);
