/**
 * Fix missing i18n keys found by scanner
 */

const fs = require('fs');

// POS i18n missing keys - add pos.paymentXXX, toolbar.XXX with pos. prefix
const posMissingEn = {
  pos: {
    paymentCash: 'Cash',
    paymentQris: 'QRIS',
    paymentGoPay: 'GoPay',
    paymentOvo: 'OVO',
    paymentDana: 'DANA',
    paymentShopeePay: 'ShopeePay',
    paymentDebit: 'Debit Card',
    paymentCard: 'Credit Card',
    detectPrinter: 'Detect Printer',
  },
  toolbar: {
    expense: 'Expense',
  },
  lang: {
    en: 'English',
    enName: 'English',
    id: 'Indonesian',
    idName: 'Indonesian',
    zh: 'Chinese',
    zhName: 'Chinese',
  },
};

const posMissingId = {
  pos: {
    paymentCash: 'Tunai',
    paymentQris: 'QRIS',
    paymentGoPay: 'GoPay',
    paymentOvo: 'OVO',
    paymentDana: 'DANA',
    paymentShopeePay: 'ShopeePay',
    paymentDebit: 'Kartu Debit',
    paymentCard: 'Kartu Kredit',
    detectPrinter: 'Deteksi Printer',
  },
  toolbar: {
    expense: 'Biaya',
  },
  lang: {
    en: 'English',
    enName: 'English',
    id: 'Bahasa Indonesia',
    idName: 'Bahasa Indonesia',
    zh: '中文',
    zhName: '中文',
  },
};

const posMissingZh = {
  pos: {
    paymentCash: '现金',
    paymentQris: 'QRIS',
    paymentGoPay: 'GoPay',
    paymentOvo: 'OVO',
    paymentDana: 'DANA',
    paymentShopeePay: 'ShopeePay',
    paymentDebit: '借记卡',
    paymentCard: '信用卡',
    detectPrinter: '检测打印机',
  },
  toolbar: {
    expense: '费用',
  },
  lang: {
    en: 'English',
    enName: 'English',
    id: 'Bahasa Indonesia',
    idName: 'Bahasa Indonesia',
    zh: '中文',
    zhName: '中文',
  },
};

// Admin i18n missing keys
const adminMissingEn = {
  hygiene: {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    specificDays: 'Specific Days',
    foodSafety: 'Food Safety',
    dailyCleaning: 'Daily Cleaning',
    equipmentMaintenance: 'Equipment Maintenance',
    periodicMaintenance: 'Periodic Maintenance',
    openingChecklist: 'Opening Checklist',
    closingChecklist: 'Closing Checklist',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
    priorityCritical: 'Critical',
    priorityHigh: 'High',
    priorityNormal: 'Normal',
    priorityLow: 'Low',
    evidencePhoto: 'Photo',
    evidenceSignature: 'Signature',
    evidenceBoth: 'Photo & Signature',
  },
  lang: {
    en: 'English',
    enName: 'English',
    id: 'Indonesian',
    idName: 'Indonesian',
    zh: 'Chinese',
    zhName: 'Chinese',
  },
  marketing: {
    addon: 'Add-on',
    couponCodePlaceholder: 'Enter coupon code',
    referralCodePlaceholder: 'Enter referral code',
    usageLimitPlaceholder: 'Usage limit',
    discount_percent: 'Percent Off',
    discount_fixed: 'Fixed Amount',
    free_product: 'Free Product',
    free_delivery: 'Free Delivery',
    gift: 'Gift',
    product: 'Product',
    voucher: 'Voucher',
    stackingRuleTypes_stackable: 'Stackable',
    stackingRuleTypes_exclusive: 'Exclusive',
    stackingRuleTypes_replace: 'Replace',
  },
  material: {
    day: 'day',
    expiresIn: 'Expires In',
    expiryAlerts: 'Expiry Alerts',
    noRecipes: 'No processing recipes',
    outputUnit: 'Output Unit',
    processHistory: 'Process History',
    recipe: 'Recipe',
    recipeName: 'Recipe Name',
    suggestQty: 'Suggested Restock',
    enterMultiplier: 'Enter multiplier',
  },
  members: {
    noName: 'No Name',
  },
  orders: {
    approveRefund: 'Approve Refund',
    rejectRefund: 'Reject Refund',
    noRefunds: 'No refund requests',
    requestedBy: 'Requested By',
  },
  posSettings: {
    blockDelete: 'Delete Block',
    blockDisabled: 'Disabled',
    blockDuplicate: 'Duplicate',
    channels: 'Channels',
    display: 'Display',
    dualScreenWelcome: 'Dual Screen Welcome',
    hardware: 'Hardware',
    layout: 'Layout',
    payment: 'Payment',
    quickAmounts: 'Quick Amounts',
    receipt: 'Receipt',
    shift: 'Shift',
    sound: 'Sound',
    tax: 'Tax',
    toolbar: 'Toolbar',
  },
  purchases: {
    approved: 'Approved',
    pending: 'Pending',
    cancelled: 'Cancelled',
    received: 'Received',
    contactPersonPlaceholder: 'Contact person',
    supplierNamePlaceholder: 'Supplier name',
  },
  reimbursement: {
    markedPaid: 'Marked as Paid',
    noRequests: 'No reimbursement requests',
  },
  staff: {
    addFirstShift: 'Add first shift',
    attendanceRules: 'Attendance Rules',
    depositRule: 'Deposit Rule',
    editShift: 'Edit Shift',
    noShifts: 'No shifts configured',
    passwordRequired: 'Password is required',
    shiftConfig: 'Shift Configuration',
    shiftKey: 'Shift Key',
    shiftName: 'Shift Name (EN)',
    shiftNameId: 'Shift Name (ID)',
    shiftNameZh: 'Shift Name (ZH)',
  },
  toolbar: {
    expense: 'Expense',
  },
};

const adminMissingId = {
  hygiene: {
    daily: 'Harian',
    weekly: 'Mingguan',
    monthly: 'Bulanan',
    specificDays: 'Hari Tertentu',
    foodSafety: 'Keamanan Pangan',
    dailyCleaning: 'Pembersihan Harian',
    equipmentMaintenance: 'Perawatan Peralatan',
    periodicMaintenance: 'Perawatan Berkala',
    openingChecklist: 'Daftar Pembukaan',
    closingChecklist: 'Daftar Penutupan',
    morning: 'Pagi',
    afternoon: 'Siang',
    evening: 'Malam',
    mon: 'Sen', tue: 'Sel', wed: 'Rab', thu: 'Kam', fri: 'Jum', sat: 'Sab', sun: 'Min',
    priorityCritical: 'Kritis',
    priorityHigh: 'Tinggi',
    priorityNormal: 'Normal',
    priorityLow: 'Rendah',
    evidencePhoto: 'Foto',
    evidenceSignature: 'Tanda Tangan',
    evidenceBoth: 'Foto & Tanda Tangan',
  },
  lang: {
    en: 'English',
    enName: 'English',
    id: 'Bahasa Indonesia',
    idName: 'Bahasa Indonesia',
    zh: '中文',
    zhName: '中文',
  },
  marketing: {
    addon: 'Tambahan',
    couponCodePlaceholder: 'Masukkan kode kupon',
    referralCodePlaceholder: 'Masukkan kode referral',
    usageLimitPlaceholder: 'Batas penggunaan',
    discount_percent: 'Potongan Persen',
    discount_fixed: 'Jumlah Tetap',
    free_product: 'Produk Gratis',
    free_delivery: 'Gratis Ongkir',
    gift: 'Hadiah',
    product: 'Produk',
    voucher: 'Voucher',
    stackingRuleTypes_stackable: 'Bertumpuk',
    stackingRuleTypes_exclusive: 'Eksklusif',
    stackingRuleTypes_replace: 'Ganti',
  },
  material: {
    day: 'hari',
    expiresIn: 'Kadaluarsa Dalam',
    expiryAlerts: 'Peringatan Kadaluarsa',
    noRecipes: 'Belum ada resep olah',
    outputUnit: 'Satuan Output',
    processHistory: 'Riwayat Proses',
    recipe: 'Resep',
    recipeName: 'Nama Resep',
    suggestQty: 'Saran Stok Ulang',
    enterMultiplier: 'Masukkan pengali',
  },
  members: {
    noName: 'Tanpa Nama',
  },
  orders: {
    approveRefund: 'Setujui Refund',
    rejectRefund: 'Tolak Refund',
    noRefunds: 'Tidak ada permintaan refund',
    requestedBy: 'Diminta Oleh',
  },
  posSettings: {
    blockDelete: 'Hapus Blok',
    blockDisabled: 'Dinonaktifkan',
    blockDuplicate: 'Duplikat',
    channels: 'Saluran',
    display: 'Tampilan',
    dualScreenWelcome: 'Sambutan Layar Ganda',
    hardware: 'Perangkat Keras',
    layout: 'Tampilan',
    payment: 'Pembayaran',
    quickAmounts: 'Jumlah Cepat',
    receipt: 'Struk',
    shift: 'Shift',
    sound: 'Suara',
    tax: 'Pajak',
    toolbar: 'Toolbar',
  },
  purchases: {
    approved: 'Disetujui',
    pending: 'Menunggu',
    cancelled: 'Dibatalkan',
    received: 'Diterima',
    contactPersonPlaceholder: 'Nama kontak',
    supplierNamePlaceholder: 'Nama pemasok',
  },
  reimbursement: {
    markedPaid: 'Ditandai Lunas',
    noRequests: 'Tidak ada permintaan reimburs',
  },
  staff: {
    addFirstShift: 'Tambah shift pertama',
    attendanceRules: 'Aturan Kehadiran',
    depositRule: 'Aturan Deposit',
    editShift: 'Edit Shift',
    noShifts: 'Belum ada shift dikonfigurasi',
    passwordRequired: 'Kata sandi wajib diisi',
    shiftConfig: 'Konfigurasi Shift',
    shiftKey: 'Kunci Shift',
    shiftName: 'Nama Shift (EN)',
    shiftNameId: 'Nama Shift (ID)',
    shiftNameZh: 'Nama Shift (ZH)',
  },
  toolbar: {
    expense: 'Biaya',
  },
};

const adminMissingZh = {
  hygiene: {
    daily: '每日',
    weekly: '每周',
    monthly: '每月',
    specificDays: '特定日期',
    foodSafety: '食品安全',
    dailyCleaning: '日常清洁',
    equipmentMaintenance: '设备维护',
    periodicMaintenance: '定期维护',
    openingChecklist: '开店检查',
    closingChecklist: '闭店检查',
    morning: '上午',
    afternoon: '下午',
    evening: '晚间',
    mon: '周一', tue: '周二', wed: '周三', thu: '周四', fri: '周五', sat: '周六', sun: '周日',
    priorityCritical: '紧急',
    priorityHigh: '高',
    priorityNormal: '普通',
    priorityLow: '低',
    evidencePhoto: '照片',
    evidenceSignature: '签名',
    evidenceBoth: '照片和签名',
  },
  lang: {
    en: 'English',
    enName: 'English',
    id: 'Bahasa Indonesia',
    idName: 'Bahasa Indonesia',
    zh: '中文',
    zhName: '中文',
  },
  marketing: {
    addon: '加料',
    couponCodePlaceholder: '输入优惠券码',
    referralCodePlaceholder: '输入推荐码',
    usageLimitPlaceholder: '使用限制',
    discount_percent: '百分比折扣',
    discount_fixed: '固定金额',
    free_product: '免费产品',
    free_delivery: '免费配送',
    gift: '礼品',
    product: '产品',
    voucher: '代金券',
    stackingRuleTypes_stackable: '可叠加',
    stackingRuleTypes_exclusive: '排他',
    stackingRuleTypes_replace: '替换',
  },
  material: {
    day: '天',
    expiresIn: '剩余过期',
    expiryAlerts: '过期提醒',
    noRecipes: '暂无加工配方',
    outputUnit: '产出单位',
    processHistory: '加工记录',
    recipe: '配方',
    recipeName: '配方名称',
    suggestQty: '建议补货量',
    enterMultiplier: '输入倍数',
  },
  members: {
    noName: '无名',
  },
  orders: {
    approveRefund: '批准退款',
    rejectRefund: '拒绝退款',
    noRefunds: '暂无退款请求',
    requestedBy: '申请人',
  },
  posSettings: {
    blockDelete: '删除区块',
    blockDisabled: '已禁用',
    blockDuplicate: '复制',
    channels: '渠道',
    display: '显示',
    dualScreenWelcome: '双屏欢迎语',
    hardware: '硬件',
    layout: '布局',
    payment: '支付',
    quickAmounts: '快捷金额',
    receipt: '小票',
    shift: '班次',
    sound: '声音',
    tax: '税费',
    toolbar: '工具栏',
  },
  purchases: {
    approved: '已批准',
    pending: '待处理',
    cancelled: '已取消',
    received: '已收货',
    contactPersonPlaceholder: '联系人姓名',
    supplierNamePlaceholder: '供应商名称',
  },
  reimbursement: {
    markedPaid: '已标记为已付',
    noRequests: '暂无报销申请',
  },
  staff: {
    addFirstShift: '添加第一个班次',
    attendanceRules: '考勤规则',
    depositRule: '押金规则',
    editShift: '编辑班次',
    noShifts: '暂无班次配置',
    passwordRequired: '密码为必填项',
    shiftConfig: '班次配置',
    shiftKey: '班次键',
    shiftName: '班次名称（英文）',
    shiftNameId: '班次名称（印尼）',
    shiftNameZh: '班次名称（中文）',
  },
  toolbar: {
    expense: '费用',
  },
};

function addKeysToSection(content, sectionName, newKeys) {
  // Find the section start
  const sectionRe = new RegExp(`^\\s*${sectionName}:\\s*\\{`, 'm');
  const match = sectionRe.exec(content);
  if (!match) {
    console.log(`Section ${sectionName} not found`);
    return content;
  }
  
  // Collect existing top-level keys in the file to avoid duplicates
  const existingKeyRe = /^\s{2,}([a-zA-Z0-9_\.]+):\s*['""]/gm;
  const existingKeys = new Set();
  let m;
  while ((m = existingKeyRe.exec(content)) !== null) {
    existingKeys.add(m[1]);
  }
  
  // Find section boundaries
  const sectionStart = match.index;
  const sectionHeaderIndent = match[0].match(/^\s*/)[0];
  const sectionContentIndent = sectionHeaderIndent + '  ';
  
  // Find closing brace
  let braceCount = 0;
  let foundOpen = false;
  let sectionEnd = -1;
  for (let i = 0; i < content.substring(sectionStart).length; i++) {
    const ch = content[sectionStart + i];
    if (ch === '{') { braceCount++; foundOpen = true; }
    if (ch === '}') {
      braceCount--;
      if (foundOpen && braceCount === 0) {
        sectionEnd = sectionStart + i;
        break;
      }
    }
  }
  
  if (sectionEnd === -1) {
    console.log(`Could not find end of section ${sectionName}`);
    return content;
  }
  
  // Filter to only keys that don't already exist
  const keysToAdd = Object.entries(newKeys).filter(([k, v]) => !existingKeys.has(k));
  
  if (keysToAdd.length === 0) {
    console.log(`All keys for ${sectionName} already exist`);
    return content;
  }
  
  console.log(`Adding ${keysToAdd.length} keys to ${sectionName}: ${keysToAdd.map(([k]) => k).join(', ')}`);
  
  const newLinesStr = keysToAdd.map(([k, v]) => `${sectionContentIndent}${k}: '${v}',`).join('\n');
  
  const before = content.substring(0, sectionEnd);
  const after = content.substring(sectionEnd);
  
  return before + '\n' + newLinesStr + '\n' + after;
}

function fixPosI18n() {
  let content = fs.readFileSync('client-pos/src/i18n/index.ts', 'utf8');
  
  // Fix EN section (line 657)
  for (const [section, keys] of Object.entries(posMissingEn)) {
    content = addKeysToSection(content, section, keys);
  }
  // Fix ID section
  for (const [section, keys] of Object.entries(posMissingId)) {
    content = addKeysToSection(content, section, keys);
  }
  // Fix ZH section
  for (const [section, keys] of Object.entries(posMissingZh)) {
    content = addKeysToSection(content, section, keys);
  }
  
  fs.writeFileSync('client-pos/src/i18n/index.ts', content);
  console.log('POS i18n updated');
}

function fixAdminI18n() {
  let content = fs.readFileSync('client-admin/src/i18n/index.ts', 'utf8');
  
  // We need to find the correct line ranges for each section
  // EN section starts around line 2951, ID around 930, ZH around 6063
  // Let's find by content inspection
  
  const lines = content.split('\n');
  
  // Find section boundaries by looking for section headers
  function findSectionRange(sectionName) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`^\\s*${sectionName}:\\s*\\{`))) {
        // Find end
        let braceCount = 0;
        let foundOpen = false;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes('{')) { braceCount++; foundOpen = true; }
          if (lines[j].includes('}')) { braceCount--; }
          if (foundOpen && braceCount === 0) {
            return { start: i, end: j };
          }
        }
      }
    }
    return null;
  }
  
  // For admin, we'll insert directly before closing braces
  // Process each translation section (EN, ID, ZH)
  
  const sectionRanges = {
    hygiene: findSectionRange('hygiene'),
    lang: findSectionRange('lang'),
    marketing: findSectionRange('marketing'),
    material: findSectionRange('material'),
    members: findSectionRange('members'),
    orders: findSectionRange('orders'),
    posSettings: findSectionRange('posSettings'),
    purchases: findSectionRange('purchases'),
    reimbursement: findSectionRange('reimbursement'),
    staff: findSectionRange('staff'),
    toolbar: findSectionRange('toolbar'),
  };
  
  // Helper: inject keys into a specific line range
  function injectIntoRange(startLine, endLine, keysToAdd) {
    const existingKeys = new Set();
    for (let i = startLine; i <= endLine; i++) {
      const m = lines[i].match(/^\s{4}([a-zA-Z0-9_\.]+):\s*'/);
      if (m) existingKeys.add(m[1]);
    }
    
    const keys = Object.entries(keysToAdd).filter(([k]) => !existingKeys.has(k));
    if (keys.length === 0) return;
    
    console.log(`Adding ${keys.length} keys to lines ${startLine}-${endLine}: ${keys.map(([k]) => k).join(', ')}`);
    
    const indent = '      ';
    const newLines = keys.map(([k, v]) => `${indent}${k}: '${v}',`);
    lines.splice(endLine, 0, ...newLines);
  }
  
  // Process admin - need to handle all sections
  // Since the file has multiple translations, we'll use string-based insertion
  for (const [section, range] of Object.entries(sectionRanges)) {
    if (!range) { console.log(`Section ${section} not found`); continue; }
    
    if (adminMissingEn[section]) {
      injectIntoRange(range.start, range.end, adminMissingEn[section]);
    }
  }
  
  // For ZH section, need to re-find ranges after modifications
  // Actually, let's use the content-based approach instead
  content = lines.join('\n');
  
  // Now fix the ZH section by finding hygiene: after line 5762+
  for (const [section, keys] of Object.entries(adminMissingZh)) {
    content = addKeysToSection(content, section, keys);
  }
  for (const [section, keys] of Object.entries(adminMissingId)) {
    content = addKeysToSection(content, section, keys);
  }
  for (const [section, keys] of Object.entries(adminMissingEn)) {
    content = addKeysToSection(content, section, keys);
  }
  
  fs.writeFileSync('client-admin/src/i18n/index.ts', content);
  console.log('Admin i18n updated');
}

fixPosI18n();
fixAdminI18n();
