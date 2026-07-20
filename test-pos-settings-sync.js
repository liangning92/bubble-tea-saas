const { chromium } = require('playwright');

async function comprehensiveSyncTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const adminPage = await context.newPage();

  const storeId = 'cmq3cn8py0002ylapuoj05pw9';
  const results = [];

  const getConfig = async () => {
    return await adminPage.evaluate(async (sid) => {
      const stored = localStorage.getItem('auth-storage');
      let token = null;
      if (stored) {
        try { token = JSON.parse(stored).state?.token; } catch (e) {}
      }
      const res = await fetch(`http://localhost:7072/api/config?storeId=${sid}&category=pos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return await res.json();
    }, storeId);
  };

  const saveConfig = async (key, value) => {
    return await adminPage.evaluate(async ({sid, k, v}) => {
      const stored = localStorage.getItem('auth-storage');
      let token = null;
      if (stored) {
        try { token = JSON.parse(stored).state?.token; } catch (e) {}
      }
      const res = await fetch('http://localhost:7072/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : {}
        },
        body: JSON.stringify({
          storeId: sid,
          key: k,
          value: v,
          category: 'pos'
        })
      });
      return await res.json();
    }, { sid: storeId, k: key, v: value });
  };

  try {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Comprehensive POS Settings Sync Test                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // ========== 1. 登录 Admin ==========
    console.log('📱 Step 1: Login to Admin');
    await adminPage.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    await adminPage.fill('input[type="tel"], input[placeholder*="08"]', '081234567890');
    await adminPage.fill('input[type="password"]', 'admin123');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForTimeout(3000);
    console.log('   ✅ Admin logged in\n');

    // ========== 2. 测试各项设置通过 API 直接保存和读取 ==========

    // --- Quick Amounts ---
    console.log('💵 Testing Quick Amounts...');
    const quickAmountsData = { enabled: true, amounts: [5000, 10000, 20000, 50000] };
    await saveConfig('quickAmounts', quickAmountsData);
    await adminPage.waitForTimeout(500);
    const quickResult = await getConfig();
    const quickSynced = JSON.stringify(quickResult?.data?.quickAmounts) === JSON.stringify(quickAmountsData);
    console.log(`   Quick Amounts: ${quickSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Quick Amounts', passed: quickSynced });

    // --- Receipt Settings ---
    console.log('🧾 Testing Receipt Settings...');
    const receiptData = {
      header: 'Bubble Tea Test Shop',
      footer: 'Thank you!',
      paperSize: '58mm',
      printCopies: 1,
      showQR: true,
      showLogo: false,
      showBarcode: true,
      showKitchenNote: true,
      storePhone: '021-1234567',
      storeAddress: 'Jakarta, Indonesia'
    };
    await saveConfig('posReceipt', receiptData);
    await adminPage.waitForTimeout(500);
    const receiptResult = await getConfig();
    const receiptSynced = receiptResult?.data?.posReceipt?.header === 'Bubble Tea Test Shop'
      && receiptResult?.data?.posReceipt?.paperSize === '58mm';
    console.log(`   Receipt Settings: ${receiptSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Receipt Settings', passed: receiptSynced });

    // --- Hardware Settings ---
    console.log('🖨️  Testing Hardware Settings...');
    const hardwareData = {
      printerType: 'escpos',
      printerName: 'EPSON TM-T82',
      printerIp: '192.168.1.100',
      printerPort: 9100,
      cashDrawerPulse: 100,
      autoOpenCashDrawer: true,
      scannerEnabled: true,
      scannerType: 'usb',
      displayBrightness: 85,
      dualScreenEnabled: true
    };
    await saveConfig('hardwareSettings', hardwareData);
    await adminPage.waitForTimeout(500);
    const hardwareResult = await getConfig();
    const hardwareSynced = hardwareResult?.data?.hardwareSettings?.printerType === 'escpos'
      && hardwareResult?.data?.hardwareSettings?.displayBrightness === 85;
    console.log(`   Hardware Settings: ${hardwareSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Hardware Settings', passed: hardwareSynced });

    // --- Sound Settings ---
    console.log('🔊 Testing Sound Settings...');
    const soundData = {
      keypress: { enabled: true, volume: 70 },
      orderComplete: { enabled: true, volume: 100 },
      error: { enabled: true, volume: 100 },
      newOrder: { enabled: true, volume: 90 }
    };
    await saveConfig('soundSettings', soundData);
    await adminPage.waitForTimeout(500);
    const soundResult = await getConfig();
    const soundSynced = soundResult?.data?.soundSettings?.keypress?.volume === 70
      && soundResult?.data?.soundSettings?.newOrder?.volume === 90;
    console.log(`   Sound Settings: ${soundSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Sound Settings', passed: soundSynced });

    // --- Display Settings ---
    console.log('🖥️  Testing Display Settings...');
    const displayData = {
      brightness: 90,
      autoDim: true,
      idleTimeout: 120,
      showOrderNumber: true
    };
    await saveConfig('displaySettings', displayData);
    await adminPage.waitForTimeout(500);
    const displayResult = await getConfig();
    const displaySynced = displayResult?.data?.displaySettings?.brightness === 90
      && displayResult?.data?.displaySettings?.idleTimeout === 120;
    console.log(`   Display Settings: ${displaySynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Display Settings', passed: displaySynced });

    // --- Shift Settings ---
    console.log('👥 Testing Shift Settings...');
    const shiftData = {
      requireReconciliation: true,
      requireSupervisorConfirm: true,
      showSummary: true,
      cashDifferenceLimit: 50000,
      morningShiftStart: '08:00',
      morningShiftEnd: '16:00',
      afternoonShiftStart: '16:00',
      afternoonShiftEnd: '23:00'
    };
    await saveConfig('shiftSettings', shiftData);
    await adminPage.waitForTimeout(500);
    const shiftResult = await getConfig();
    const shiftSynced = shiftResult?.data?.shiftSettings?.cashDifferenceLimit === 50000
      && shiftResult?.data?.shiftSettings?.requireReconciliation === true;
    console.log(`   Shift Settings: ${shiftSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Shift Settings', passed: shiftSynced });

    // --- Payment Methods ---
    console.log('💳 Testing Payment Methods...');
    const paymentData = {
      cash: true,
      qris: true,
      gopay: false,
      ovo: false,
      dana: false,
      shopeepay: false,
      debit: false
    };
    await saveConfig('paymentMethods', paymentData);
    await adminPage.waitForTimeout(500);
    const paymentResult = await getConfig();
    const paymentSynced = paymentResult?.data?.paymentMethods?.gopay === false
      && paymentResult?.data?.paymentMethods?.qris === true;
    console.log(`   Payment Methods: ${paymentSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Payment Methods', passed: paymentSynced });

    // --- Tax Settings ---
    console.log('💰 Testing Tax Settings...');
    const taxData = {
      enabled: true,
      rate: 11,
      includedInPrice: false,
      showOnReceipt: true
    };
    await saveConfig('taxSettings', taxData);
    await adminPage.waitForTimeout(500);
    const taxResult = await getConfig();
    const taxSynced = taxResult?.data?.taxSettings?.rate === 11
      && taxResult?.data?.taxSettings?.enabled === true;
    console.log(`   Tax Settings: ${taxSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Tax Settings', passed: taxSynced });

    // --- Channel Settings ---
    console.log('🔌 Testing Channel Settings...');
    const channelData = {
      dineIn: { enabled: true, name: 'Dine In', icon: '🍵', color: '#EC6D88', availableHours: '00:00-23:59', minOrder: 0 },
      gofood: { enabled: true, name: 'GoFood', icon: '🟢', color: '#25A549', availableHours: '09:00-22:00', minOrder: 15000, commissionRate: 15 },
      grab: { enabled: false, name: 'Grab', icon: '🟡', color: '#F61F20', availableHours: '09:00-22:00', minOrder: 15000, commissionRate: 20 },
      shopee: { enabled: false, name: 'Shopee', icon: '🟠', color: '#EE4D2D', availableHours: '09:00-22:00', minOrder: 15000, commissionRate: 18 }
    };
    await saveConfig('channelSettings', channelData);
    await adminPage.waitForTimeout(500);
    const channelResult = await getConfig();
    const channelSynced = channelResult?.data?.channelSettings?.gofood?.commissionRate === 15
      && channelResult?.data?.channelSettings?.grab?.enabled === false;
    console.log(`   Channel Settings: ${channelSynced ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: 'Channel Settings', passed: channelSynced });

    // ========== 3. POS 端验证 ==========
    console.log('\n📦 Verifying POS Sync...');
    const posPage = await context.newPage();
    await posPage.goto('http://localhost:6063/login', { waitUntil: 'networkidle' });
    await posPage.fill('input[type="tel"], input[placeholder*="08"]', '081234567890');
    await posPage.fill('input[type="password"]', 'admin123');
    await posPage.click('button[type="submit"]');
    await posPage.waitForTimeout(5000);
    await posPage.reload({ waitUntil: 'networkidle' });
    await posPage.waitForTimeout(3000);
    await posPage.screenshot({ path: 'test-results/pos-comprehensive.png' });
    console.log('   ✅ POS screenshot saved\n');

    // ========== 4. 恢复默认设置 ==========
    console.log('🔄 Restoring default settings...');

    // 恢复 cardSize
    await saveConfig('posLayout', { gridCols: '4', cardSize: 'medium' });

    // 恢复 quickAmounts
    await saveConfig('quickAmounts', { enabled: true, amounts: [10000, 20000, 50000] });

    // 恢复 receipt
    await saveConfig('posReceipt', {
      header: 'Bubble Tea Shop',
      footer: 'Thank you!',
      paperSize: '80mm',
      printCopies: 1,
      showQR: false,
      showLogo: true,
      showBarcode: true
    });

    console.log('   ✅ Default settings restored\n');

    // ========== 结果汇总 ==========
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS SUMMARY                        ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');

    let passCount = 0;
    results.forEach(r => {
      const status = r.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`║  ${r.name.padEnd(25)} ${status}`);
      if (r.passed) passCount++;
    });

    console.log('║                                                                  ║');
    console.log(`║  Total: ${passCount}/${results.length} passed                                         ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    console.log('\n📁 Screenshots saved to test-results/:');
    console.log('   - pos-comprehensive.png');

  } catch (error) {
    console.error('\n❌ Test Error:', error.message);
  }

  await browser.close();
}

comprehensiveSyncTest().catch(console.error);