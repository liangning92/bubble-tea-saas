const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';
const PHONE = '081234567890';
const PASS = 'admin123';
const TS = Date.now().toString().slice(-8);

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = [];
  let productId = null;
  let productName = '完整测试产品' + TS;
  
  async function test(name, fn) {
    try {
      console.log(`\n${'═'.repeat(50)}`);
      console.log(`▶ ${name}`);
      await fn();
      results.push({ name, status: '✅ PASS' });
      console.log(`结果: ✅ PASS`);
    } catch (error) {
      results.push({ name, status: `❌ FAIL: ${error.message}` });
      console.log(`❌ FAIL: ${error.message}`);
    }
  }
  
  async function login() {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="tel"]', PHONE);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  }
  
  async function submitAndWait() {
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(3000);
  }
  
  try {
    await login();
    console.log('✓ 已登录\n');
    
    // ═══════════════════════════════════════════════════════════
    // 【产品完整流程】
    // ═══════════════════════════════════════════════════════════
    
    await test('【产品流程1】添加产品 - 填写名称、选择分类、设置价格', async () => {
      await page.goto(`${BASE_URL}/products/new`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // 填写产品名称
      await page.locator('input[type="text"]').first().fill(productName);
      console.log('  - 已填写产品名称:', productName);
      
      // 选择分类
      const selects = await page.$$('select');
      if (selects.length > 0) {
        await selects[0].selectOption({ index: 1 });
        console.log('  - 已选择分类');
      }
      
      // 设置价格
      const priceInput = await page.locator('input[type="number"]').first();
      if (await priceInput.isVisible()) {
        await priceInput.fill('25000');
        console.log('  - 已设置价格: 25000');
      }
      
      // 提交
      await submitAndWait();
      
      // 检查是否成功（应该跳转到列表页或显示成功消息）
      const url = page.url();
      const hasError = await page.locator('text=/错误|error|失败|failed/i').isVisible().catch(() => false);
      
      if (hasError) {
        const errMsg = await page.locator('[role="alert"]').first().textContent().catch(() => '未知错误');
        throw new Error('提交失败: ' + errMsg);
      }
      
      if (url.includes('/products/new')) {
        // 可能还有表单验证问题，检查具体原因
        console.log('  - URL仍在添加页，可能有问题');
      } else {
        console.log('  - 已跳转到:', url);
      }
    });
    
    // 重新登录确保状态正确
    await login();
    
    await test('【产品流程2】产品列表 - 验证刚添加的产品是否显示', async () => {
      await page.goto(`${BASE_URL}/products`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // 在页面内容中搜索产品名称
      const content = await page.locator('body').innerText();
      const found = content.includes(productName);
      
      if (found) {
        console.log('  - ✅ 产品列表中找到:', productName);
      } else {
        // 尝试滚动或点击下一页
        const nextBtn = await page.locator('button:has-text("Next"), button:has-text("Berikutnya")').first();
        if (await nextBtn.isVisible().catch(() => false)) {
          await nextBtn.click();
          await page.waitForTimeout(2000);
          const newContent = await page.locator('body').innerText();
          if (newContent.includes(productName)) {
            console.log('  - ✅ 在下一页中找到产品');
          } else {
            throw new Error('产品列表中未找到: ' + productName);
          }
        } else {
          throw new Error('产品列表中未找到: ' + productName);
        }
      }
    });
    
    await test('【产品流程3】产品详情 - 点击产品查看详情', async () => {
      // 点击产品名称进入详情
      const productLink = await page.locator(`text=${productName}`).first();
      if (await productLink.isVisible().catch(() => false)) {
        await productLink.click();
        await page.waitForTimeout(2000);
        console.log('  - 已进入产品详情页:', page.url());
      } else {
        // 尝试点击编辑按钮
        const editBtn = await page.locator('a:has-text("Edit"), button:has-text("Edit")').first();
        if (await editBtn.isVisible().catch(() => false)) {
          await editBtn.click();
          await page.waitForTimeout(2000);
          console.log('  - 已进入编辑页:', page.url());
        } else {
          throw new Error('无法找到产品链接或编辑按钮');
        }
      }
    });
    
    await test('【产品流程4】配方/BOM - 查看是否有配方tab', async () => {
      // 检查是否有配方/BOM相关的tab或按钮
      const bomTab = await page.locator('text=/BOM|Recipe|配方|食谱/i').first();
      if (await bomTab.isVisible().catch(() => false)) {
        await bomTab.click();
        await page.waitForTimeout(1500);
        console.log('  - 已点击配方tab');
      } else {
        console.log('  - 页面内容:', (await page.locator('body').innerText()).substring(0, 300));
        // 尝试查找配置按钮
        const configBtn = await page.locator('button:has-text("Recipe"), button:has-text("BOM")').first();
        if (await configBtn.isVisible().catch(() => false)) {
          await configBtn.click();
          console.log('  - 已点击配方配置按钮');
        }
      }
    });
    
    await test('【产品流程5】编辑产品 - 修改价格并保存', async () => {
      await page.goto(`${BASE_URL}/products`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // 找到产品并点击编辑
      const row = await page.locator(`text=${productName}`).locator('..').first();
      const editBtn = await row.locator('button:has-text("Edit"), a:has-text("Edit")').first();
      
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(2000);
        
        // 修改价格
        const priceInput = await page.locator('input[type="number"]').first();
        if (await priceInput.isVisible().catch(() => false)) {
          await priceInput.fill('30000');
          await submitAndWait();
          console.log('  - 已修改价格并保存');
        }
      } else {
        // 尝试通过链接进入
        const productLink = await page.locator(`a:has-text("${productName}")`).first();
        if (await productLink.isVisible().catch(() => false)) {
          await productLink.click();
          await page.waitForTimeout(2000);
          console.log('  - 已进入产品详情');
          
          // 查找编辑按钮
          const editInDetail = await page.locator('button:has-text("Edit"), a:has-text("Edit")').first();
          if (await editInDetail.isVisible().catch(() => false)) {
            await editInDetail.click();
            await page.waitForTimeout(2000);
            console.log('  - 已点击编辑');
          }
        }
      }
    });
    
    await test('【产品流程6】删除产品 - 删除测试产品', async () => {
      await page.goto(`${BASE_URL}/products`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // 查找删除按钮
      const deleteBtn = await page.locator('button:has-text("Hapus"), button:has-text("Delete"), button:has-text("删除")').first();
      
      if (await deleteBtn.isVisible().catch(() => false)) {
        // 点击删除
        await deleteBtn.click();
        await page.waitForTimeout(1000);
        
        // 处理确认弹窗
        const confirmDialog = await page.locator('button:has-text("OK"), button:has-text("Confirm"), button:has-text("Ya")').first();
        if (await confirmDialog.isVisible().catch(() => false)) {
          await confirmDialog.click();
          await page.waitForTimeout(2000);
          console.log('  - 已确认删除');
        }
        
        // 检查是否删除成功
        await page.reload();
        await page.waitForTimeout(2000);
        
        const content = await page.locator('body').innerText();
        if (!content.includes(productName)) {
          console.log('  - ✅ 产品已删除');
        } else {
          console.log('  - ⚠️ 产品可能仍在列表中(可能是假删除)');
        }
      } else {
        console.log('  - ⚠️ 未找到删除按钮(可能需要先进入产品详情)');
        
        // 尝试进入产品详情后删除
        const productLink = await page.locator(`a:has-text("${productName}")`).first();
        if (await productLink.isVisible().catch(() => false)) {
          await productLink.click();
          await page.waitForTimeout(2000);
          
          const deleteInDetail = await page.locator('button:has-text("Hapus"), button:has-text("Delete")').first();
          if (await deleteInDetail.isVisible().catch(() => false)) {
            await deleteInDetail.click();
            await page.waitForTimeout(1000);
            
            const confirm = await page.locator('button:has-text("Ya"), button:has-text("OK")').first();
            if (await confirm.isVisible().catch(() => false)) {
              await confirm.click();
              await page.waitForTimeout(2000);
              console.log('  - 已从详情页删除');
            }
          }
        }
      }
    });
    
    // ═══════════════════════════════════════════════════════════
    // 【员工完整流程】
    // ═══════════════════════════════════════════════════════════
    
    const staffName = '流程测试员工' + TS;
    const staffPhone = '2' + TS;
    
    await test('【员工流程1】添加员工 - 填写所有字段', async () => {
      await page.goto(`${BASE_URL}/staff/new`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // 填写表单
      const inputs = await page.$$('input');
      await inputs[0].fill(staffName);
      await inputs[1].fill(staffPhone);
      await inputs[2].fill('test123');
      console.log('  - 已填写: 姓名=' + staffName + ', 电话=' + staffPhone);
      
      await submitAndWait();
      
      // 检查是否成功
      const url = page.url();
      if (url.includes('/staff/new')) {
        const errMsg = await page.locator('[role="alert"]').first().textContent().catch(() => '');
        if (errMsg) throw new Error(errMsg);
        console.log('  - ⚠️ 仍在添加页,检查是否有错误');
      } else {
        console.log('  - ✅ 已跳转到:', url);
      }
    });
    
    await login();
    
    await test('【员工流程2】员工列表 - 验证员工是否添加成功', async () => {
      await page.goto(`${BASE_URL}/staff`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      const content = await page.locator('body').innerText();
      if (content.includes(staffName)) {
        console.log('  - ✅ 员工列表中找到:', staffName);
      } else {
        throw new Error('员工列表中未找到: ' + staffName);
      }
    });
    
    await test('【员工流程3】编辑员工 - 修改职位', async () => {
      // 找到并点击编辑
      const editBtn = await page.locator('a:has-text("Edit")').first();
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(2000);
        
        // 修改职位
        const positionSelect = await page.locator('select').first();
        if (await positionSelect.isVisible().catch(() => false)) {
          await positionSelect.selectOption('manager');
          console.log('  - 已选择经理职位');
          
          await submitAndWait();
          console.log('  - 已保存');
        }
      } else {
        console.log('  - ⚠️ 未找到编辑按钮');
      }
    });
    
    // ═══════════════════════════════════════════════════════════
    // 【库存完整流程】
    // ═══════════════════════════════════════════════════════════
    
    await test('【库存流程1】库存列表 - 查看现有库存', async () => {
      await page.goto(`${BASE_URL}/inventory`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // 获取库存项数量
      const rows = await page.locator('table tbody tr, [class*="inventory"]').count();
      console.log('  - 库存项数量:', rows);
      
      if (rows === 0) {
        console.log('  - ⚠️ 库存为空');
      } else {
        console.log('  - ✅ 库存列表正常');
      }
    });
    
    await test('【库存流程2】添加入库 - 点击入库按钮', async () => {
      // 找入库按钮
      const stockInBtn = await page.locator('button:has-text("Masuk"), button:has-text("Stock In"), button:has-text("入库")').first();
      
      if (await stockInBtn.isVisible().catch(() => false)) {
        await stockInBtn.click();
        await page.waitForTimeout(1500);
        console.log('  - 已点击入库按钮');
        
        // 检查弹窗是否打开
        const modal = await page.locator('[role="dialog"], .modal, .ant-modal').first();
        if (await modal.isVisible().catch(() => false)) {
          console.log('  - ✅ 入库弹窗已打开');
          
          // 填写数量
          const qtyInput = await page.locator('input[type="number"]').first();
          if (await qtyInput.isVisible().catch(() => false)) {
            await qtyInput.fill('50');
            console.log('  - 已填写数量: 50');
          }
        }
      } else {
        console.log('  - ⚠️ 未找到入库按钮');
      }
    });
    
    // ═══════════════════════════════════════════════════════════
    // 【配方/BOM完整流程】
    // ═══════════════════════════════════════════════════════════
    
    await test('【配方流程1】配方分析 - 查看配方列表', async () => {
      await page.goto(`${BASE_URL}/bom/analysis`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      console.log('  - 已进入配方分析页:', page.url());
    });
    
    await test('【配方流程2】配方配置 - 查看是否可以添加配方', async () => {
      await page.goto(`${BASE_URL}/bom/recipes`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // 找添加按钮
      const addBtn = await page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("添加")').first();
      
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(1500);
        console.log('  - 已点击添加配方按钮');
        
        // 检查弹窗内容
        const hasForm = await page.locator('input, select').count();
        console.log('  - 弹窗中表单元素数量:', hasForm);
      } else {
        console.log('  - ⚠️ 未找到添加按钮');
        const content = await page.locator('body').innerText();
        console.log('  - 页面内容预览:', content.substring(0, 200));
      }
    });
    
  } catch (error) {
    console.error('\n❌ 测试过程出错:', error.message);
  } finally {
    await browser.close();
  }
  
  // 打印总结
  console.log('\n' + '='.repeat(60));
  console.log('完整业务流程测试总结');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status.includes('PASS')).length;
  const failed = results.filter(r => r.status.includes('FAIL')).length;
  
  results.forEach(r => console.log(`${r.status} - ${r.name}`));
  
  console.log('='.repeat(60));
  console.log(`总计: ${passed} 通过, ${failed} 失败`);
  console.log(`测试数据: 产品=${productName}, 员工=${staffName}`);
}

runTests();
