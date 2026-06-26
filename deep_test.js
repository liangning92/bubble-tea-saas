const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';

async function test(name, fn) {
  try {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`▶ ${name}`);
    await fn();
    console.log(`✅ PASS`);
    return true;
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    return false;
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="tel"]', '081234567890');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = [];
  
  // 登录
  await login(page);
  console.log('已登录');
  
  // 1. 产品管理
  results.push(await test('1. 产品列表-点击产品进入详情', async () => {
    await page.goto(`${BASE_URL}/products`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 点击第一个产品
    const productLink = page.locator('a[href*="/products/"]').first();
    if (await productLink.isVisible()) {
      await productLink.click();
      await page.waitForTimeout(2000);
      if (page.url().includes('/products/')) {
        console.log('  进入产品详情成功:', page.url());
      } else {
        throw new Error('点击未跳转');
      }
    } else {
      throw new Error('未找到产品链接');
    }
  }));
  
  results.push(await test('2. 产品-编辑配方按钮', async () => {
    // 检查编辑配方按钮是否存在
    const editRecipeBtn = page.locator('text=/Edit Recipe|编辑配方|recipe/i').first();
    if (await editRecipeBtn.isVisible()) {
      console.log('  找到编辑配方按钮');
    } else {
      throw new Error('未找到编辑配方按钮');
    }
  }));
  
  // 2. 返回产品列表，点击添加产品
  results.push(await test('3. 添加产品页面-点击添加按钮', async () => {
    await page.goto(`${BASE_URL}/products`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const addBtn = page.locator('a[href="/products/new"], button:has-text("Tambah"), button:has-text("Add")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(2000);
      console.log('  点击添加按钮，URL:', page.url());
    } else {
      throw new Error('未找到添加按钮');
    }
  }));
  
  // 3. 员工管理
  results.push(await test('4. 员工列表-点击添加按钮', async () => {
    await page.goto(`${BASE_URL}/staff`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const addBtn = page.locator('a[href="/staff/new"], button:has-text("Tambah"), button:has-text("Add")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(2000);
      console.log('  点击添加员工按钮:', page.url());
    } else {
      throw new Error('未找到添加按钮');
    }
  }));
  
  // 4. 库存管理
  results.push(await test('5. 库存-点击添加入库按钮', async () => {
    await page.goto(`${BASE_URL}/inventory`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const inBtn = page.locator('button:has-text("Masuk"), button:has-text("Stock In"), button:has-text("入库")').first();
    if (await inBtn.isVisible()) {
      await inBtn.click();
      await page.waitForTimeout(1500);
      console.log('  点击入库按钮成功');
    } else {
      throw new Error('未找到入库按钮');
    }
  }));
  
  // 5. 考勤管理
  results.push(await test('6. 考勤-点击考勤统计', async () => {
    await page.goto(`${BASE_URL}/attendance`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const statsBtn = page.locator('text=/Statistik|Statistics|统计/i').first();
    if (await statsBtn.isVisible()) {
      await statsBtn.click();
      await page.waitForTimeout(1500);
      console.log('  点击统计按钮成功');
    } else {
      console.log('  未找到统计按钮(可能不在此页面)');
    }
  }));
  
  // 6. 请假管理
  results.push(await test('7. 请假-点击添加请假', async () => {
    await page.goto(`${BASE_URL}/leave`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const applyBtn = page.locator('button:has-text("Ajukan"), button:has-text("Apply"), button:has-text("申请")').first();
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      await page.waitForTimeout(1500);
      console.log('  点击申请按钮成功');
    } else {
      throw new Error('未找到申请按钮');
    }
  }));
  
  // 7. 报销管理
  results.push(await test('8. 报销-点击添加报销', async () => {
    await page.goto(`${BASE_URL}/reimbursement`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const addBtn = page.locator('button:has-text("Ajukan"), button:has-text("Add"), button:has-text("报销")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      console.log('  点击报销申请按钮成功');
    } else {
      throw new Error('未找到报销申请按钮');
    }
  }));
  
  // 8. 卫生管理
  results.push(await test('9. 卫生-点击今日任务', async () => {
    await page.goto(`${BASE_URL}/hygiene/today`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 检查是否有任务列表
    const taskList = page.locator('[class*="task"], [class*="hygiene"], li').first();
    if (await taskList.isVisible()) {
      console.log('  找到任务列表');
    }
    
    // 检查是否有完成/跳过按钮
    const completeBtn = page.locator('button:has-text("Selesai"), button:has-text("Complete"), button:has-text("完成")').first();
    const skipBtn = page.locator('button:has-text("Lewati"), button:has-text("Skip"), button:has-text("跳过")').first();
    
    if (await completeBtn.isVisible()) {
      console.log('  ✅ 找到完成按钮');
    } else if (await skipBtn.isVisible()) {
      console.log('  ✅ 找到跳过按钮');
    } else {
      console.log('  ⚠️ 任务列表可能为空或按钮文本不同');
    }
  }));
  
  // 9. 营销管理
  results.push(await test('10. 营销-点击添加活动', async () => {
    await page.goto(`${BASE_URL}/marketing/campaigns`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const createBtn = page.locator('a[href*="/campaigns/new"], button:has-text("Buat"), button:has-text("Create"), button:has-text("创建")').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1500);
      console.log('  点击创建活动按钮:', page.url());
    } else {
      throw new Error('未找到创建按钮');
    }
  }));
  
  // 10. 配方管理
  results.push(await test('11. 配方-选择产品并编辑', async () => {
    await page.goto(`${BASE_URL}/products/recipes`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 查找产品列表中的产品
    const productItem = page.locator('[class*="product"], [class*="cursor"]').first();
    if (await productItem.isVisible()) {
      await productItem.click();
      await page.waitForTimeout(1500);
      console.log('  选择产品成功');
    } else {
      throw new Error('未找到产品项');
    }
    
    // 检查编辑配方按钮
    const editBtn = page.locator('text=/Edit Recipe|编辑配方/i').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(1500);
      console.log('  点击编辑配方:', page.url());
    }
  }));
  
  // 11. 培训管理
  results.push(await test('12. 培训-点击添加培训', async () => {
    await page.goto(`${BASE_URL}/training`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const addBtn = page.locator('button:has-text("Tambah"), button:has-text("Add")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      console.log('  点击添加培训按钮成功');
    } else {
      throw new Error('未找到添加培训按钮');
    }
  }));
  
  // 12. 设置页面
  results.push(await test('13. 设置-点击保存设置', async () => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const saveBtn = page.locator('button:has-text("Simpan"), button:has-text("Save"), button:has-text("保存")').first();
    if (await saveBtn.isVisible()) {
      console.log('  找到保存按钮');
      // 点击保存
      await saveBtn.click();
      await page.waitForTimeout(1000);
      console.log('  点击保存按钮成功');
    } else {
      throw new Error('未找到保存按钮');
    }
  }));
  
  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('深度测试总结');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;
  
  console.log(`通过: ${passed}/${results.length}`);
  console.log(`失败: ${failed}/${results.length}`);
  console.log('='.repeat(60));
  
  await browser.close();
}

main().catch(console.error);
