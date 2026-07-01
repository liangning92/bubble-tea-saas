/**
 * 检查添加产品弹窗问题
 */

const { chromium } = require('playwright');

async function debugProductModal() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 登录
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="tel"]').fill('081234567890');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  // 打开产品页面
  await page.goto('http://localhost:5173/products', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // 列出所有按钮
  console.log('所有按钮:');
  const buttons = await page.locator('button').all();
  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].textContent();
    const className = await buttons[i].getAttribute('class');
    console.log(`  ${i}: "${text.trim()}" class: ${className}`);
  }

  // 尝试点击"添加产品"按钮
  console.log('\n尝试点击添加按钮...');

  // 方法1: 按文本内容点击
  const tambahBtn = page.locator('button:has-text("Tambah")');
  if (await tambahBtn.count() > 0) {
    console.log('找到 Tambah 按钮, 点击...');
    await tambahBtn.click();
  } else {
    console.log('没找到 Tambah 按钮');
  }

  await page.waitForTimeout(3000);

  // 检查页面变化
  const url = page.url();
  console.log('点击后URL:', url);

  // 检查是否有新内容
  const pageContent = await page.textContent('body');
  console.log('页面包含 Modal/Dialog:', pageContent.includes('Modal') || pageContent.includes('Dialog') || pageContent.includes('modal'));

  // 列出所有可能弹窗的元素
  const modals = await page.locator('[role="dialog"], .ant-modal, .modal, [class*="drawer"]').count();
  console.log('弹窗/抽屉元素数量:', modals);

  if (modals > 0) {
    const modalContent = await page.locator('[role="dialog"], .ant-modal').textContent().catch(() => '无内容');
    console.log('弹窗内容预览:', modalContent?.substring(0, 200));
  }

  // 尝试按点击按钮后的结果
  console.log('\n尝试点击第一个按钮...');
  await buttons[1].click(); // 通常index 0可能是logo或语言选择
  await page.waitForTimeout(3000);

  const afterClickUrl = page.url();
  console.log('点击后URL:', afterClickUrl);

  const afterContent = await page.textContent('body');
  console.log('页面长度变化:', pageContent.length, '->', afterContent.length);

  await browser.close();
}

debugProductModal().catch(console.error);
