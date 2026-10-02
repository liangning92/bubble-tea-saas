/**
 * Add missing i18n keys to admin i18n file - v2
 * Properly parses structure and inserts keys before the closing brace of each section
 */

const fs = require('fs');

const content = fs.readFileSync('client-admin/src/i18n/index.ts', 'utf8');

// Strategy: find all language sections, then for each, find target sections
// Insert keys before the closing } of each target section

function parseI18n(content) {
  const lines = content.split('\n');
  const result = { en: {}, id: {}, zh: {} };
  let currentLang = null;
  let braceCount = 0;
  let sectionStart = -1;
  let sectionName = '';
  
  // State machine to parse
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Language switch
    const langMatch = trimmed.match(/^(id|en|zh):\s*\{$/);
    if (langMatch) {
      currentLang = langMatch[1];
      braceCount = 0;
      continue;
    }
    
    // Close language block
    if (currentLang && trimmed === '},' && braceCount === 0) {
      currentLang = null;
      continue;
    }
    
    if (!currentLang) continue;
    
    // Section start: "      sectionName: {"
    const sectionMatch = trimmed.match(/^([a-zA-Z0-9_]+):\s*\{$/);
    if (sectionMatch && braceCount === 0) {
      sectionName = sectionMatch[1];
      sectionStart = i;
      braceCount = 1;
      continue;
    }
    
    if (sectionStart >= 0) {
      braceCount += (trimmed.match(/{/g) || []).length;
      braceCount -= (trimmed.match(/}/g) || []).length;
      
      if (braceCount === 0) {
        // Section ended
        if (!result[currentLang][sectionName]) {
          result[currentLang][sectionName] = { start: sectionStart, end: i, keys: {} };
        }
        sectionStart = -1;
        sectionName = '';
      }
    }
  }
  
  return result;
}

const parsed = parseI18n(content);

// Find last key line in each section to insert after
function findLastKeyLine(lang, sectionName, start, end) {
  const lines = content.split('\n');
  let lastKeyLine = -1;
  // Keys are at indent >= 6 spaces
  for (let i = start; i <= end; i++) {
    const line = lines[i];
    // Key line: indent + keyName: 'value' or indent + keyName: `value`
    const m = line.match(/^ {6,}([a-zA-Z0-9_]+):\s*['"`]/);
    if (m) lastKeyLine = i;
  }
  return lastKeyLine;
}

// Collect existing keys in each section
function getExistingKeys(lang, sectionName) {
  const section = parsed[lang][sectionName];
  if (!section) return new Set();
  const lines = content.split('\n');
  const keys = new Set();
  for (let i = section.start; i <= section.end; i++) {
    const m = lines[i].match(/^ {6,}([a-zA-Z0-9_]+):\s*['"`]/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

// Keys to add
const keysToAdd = {
  en: {
    marketing: ['addon', 'couponCodePlaceholder', 'referralCodePlaceholder', 'usageLimitPlaceholder', 'discount_percent', 'discount_fixed', 'free_product', 'free_delivery', 'gift', 'product', 'voucher', 'stackingRuleTypes_stackable', 'stackingRuleTypes_exclusive', 'stackingRuleTypes_replace'],
    material: ['day', 'expiresIn', 'expiryAlerts', 'noRecipes', 'outputUnit', 'processHistory', 'recipe', 'recipeName', 'suggestQty', 'enterMultiplier'],
    orders: ['approveRefund', 'rejectRefund', 'noRefunds', 'requestedBy'],
    posSettings: ['blockDelete', 'blockDisabled', 'blockDuplicate', 'channels', 'display', 'dualScreenWelcome', 'hardware', 'layout', 'payment', 'quickAmounts', 'receipt', 'shift', 'sound', 'tax', 'toolbar'],
    purchases: ['approved', 'pending', 'cancelled', 'received', 'contactPersonPlaceholder', 'supplierNamePlaceholder'],
    reimbursement: ['markedPaid', 'noRequests'],
    staff: ['addFirstShift', 'attendanceRules', 'depositRule', 'editShift', 'noShifts', 'passwordRequired', 'shiftConfig', 'shiftKey', 'shiftName', 'shiftNameId', 'shiftNameZh'],
    members: ['noName'],
  },
  id: {
    marketing: ['addon', 'couponCodePlaceholder', 'referralCodePlaceholder', 'usageLimitPlaceholder', 'discount_percent', 'discount_fixed', 'free_product', 'free_delivery', 'gift', 'product', 'voucher', 'stackingRuleTypes_stackable', 'stackingRuleTypes_exclusive', 'stackingRuleTypes_replace'],
    material: ['day', 'expiresIn', 'expiryAlerts', 'noRecipes', 'outputUnit', 'processHistory', 'recipe', 'recipeName', 'suggestQty', 'enterMultiplier'],
    orders: ['approveRefund', 'rejectRefund', 'noRefunds', 'requestedBy'],
    posSettings: ['blockDelete', 'blockDisabled', 'blockDuplicate', 'channels', 'display', 'dualScreenWelcome', 'hardware', 'layout', 'payment', 'quickAmounts', 'receipt', 'shift', 'sound', 'tax', 'toolbar'],
    purchases: ['approved', 'pending', 'cancelled', 'received', 'contactPersonPlaceholder', 'supplierNamePlaceholder'],
    reimbursement: ['markedPaid', 'noRequests'],
    staff: ['addFirstShift', 'attendanceRules', 'depositRule', 'editShift', 'noShifts', 'passwordRequired', 'shiftConfig', 'shiftKey', 'shiftName', 'shiftNameId', 'shiftNameZh'],
    members: ['noName'],
  },
  zh: {
    marketing: ['addon', 'couponCodePlaceholder', 'referralCodePlaceholder', 'usageLimitPlaceholder', 'discount_percent', 'discount_fixed', 'free_product', 'free_delivery', 'gift', 'product', 'voucher', 'stackingRuleTypes_stackable', 'stackingRuleTypes_exclusive', 'stackingRuleTypes_replace'],
    material: ['day', 'expiresIn', 'expiryAlerts', 'noRecipes', 'outputUnit', 'processHistory', 'recipe', 'recipeName', 'suggestQty', 'enterMultiplier'],
    orders: ['approveRefund', 'rejectRefund', 'noRefunds', 'requestedBy'],
    posSettings: ['blockDelete', 'blockDisabled', 'blockDuplicate', 'channels', 'display', 'dualScreenWelcome', 'hardware', 'layout', 'payment', 'quickAmounts', 'receipt', 'shift', 'sound', 'tax', 'toolbar'],
    purchases: ['approved', 'pending', 'cancelled', 'received', 'contactPersonPlaceholder', 'supplierNamePlaceholder'],
    reimbursement: ['markedPaid', 'noRequests'],
    staff: ['addFirstShift', 'attendanceRules', 'depositRule', 'editShift', 'noShifts', 'passwordRequired', 'shiftConfig', 'shiftKey', 'shiftName', 'shiftNameId', 'shiftNameZh'],
    members: ['noName'],
  },
};

// Translation values
const translations = {
  en: {
    marketing: {
      addon: 'Add-on', couponCodePlaceholder: 'Enter coupon code', referralCodePlaceholder: 'Enter referral code',
      usageLimitPlaceholder: 'Usage limit', discount_percent: 'Percent Off', discount_fixed: 'Fixed Amount',
      free_product: 'Free Product', free_delivery: 'Free Delivery', gift: 'Gift', product: 'Product', voucher: 'Voucher',
      stackingRuleTypes_stackable: 'Stackable', stackingRuleTypes_exclusive: 'Exclusive', stackingRuleTypes_replace: 'Replace',
    },
    material: {
      day: 'day', expiresIn: 'Expires In', expiryAlerts: 'Expiry Alerts', noRecipes: 'No processing recipes',
      outputUnit: 'Output Unit', processHistory: 'Process History', recipe: 'Recipe', recipeName: 'Recipe Name',
      suggestQty: 'Suggested Restock', enterMultiplier: 'Enter multiplier',
    },
    orders: { approveRefund: 'Approve Refund', rejectRefund: 'Reject Refund', noRefunds: 'No refund requests', requestedBy: 'Requested By' },
    posSettings: {
      blockDelete: 'Delete Block', blockDisabled: 'Disabled', blockDuplicate: 'Duplicate', channels: 'Channels',
      display: 'Display', dualScreenWelcome: 'Dual Screen Welcome', hardware: 'Hardware', layout: 'Layout', payment: 'Payment',
      quickAmounts: 'Quick Amounts', receipt: 'Receipt', shift: 'Shift', sound: 'Sound', tax: 'Tax', toolbar: 'Toolbar',
    },
    purchases: {
      approved: 'Approved', pending: 'Pending', cancelled: 'Cancelled', received: 'Received',
      contactPersonPlaceholder: 'Contact person', supplierNamePlaceholder: 'Supplier name',
    },
    reimbursement: { markedPaid: 'Marked as Paid', noRequests: 'No reimbursement requests' },
    staff: {
      addFirstShift: 'Add first shift', attendanceRules: 'Attendance Rules', depositRule: 'Deposit Rule',
      editShift: 'Edit Shift', noShifts: 'No shifts configured', passwordRequired: 'Password is required',
      shiftConfig: 'Shift Configuration', shiftKey: 'Shift Key', shiftName: 'Shift Name (EN)',
      shiftNameId: 'Shift Name (ID)', shiftNameZh: 'Shift Name (ZH)',
    },
    members: { noName: 'No Name' },
  },
  id: {
    marketing: {
      addon: 'Tambahan', couponCodePlaceholder: 'Masukkan kode kupon', referralCodePlaceholder: 'Masukkan kode referral',
      usageLimitPlaceholder: 'Batas penggunaan', discount_percent: 'Potongan Persen', discount_fixed: 'Jumlah Tetap',
      free_product: 'Produk Gratis', free_delivery: 'Gratis Ongkir', gift: 'Hadiah', product: 'Produk', voucher: 'Voucher',
      stackingRuleTypes_stackable: 'Bertumpuk', stackingRuleTypes_exclusive: 'Eksklusif', stackingRuleTypes_replace: 'Ganti',
    },
    material: {
      day: 'hari', expiresIn: 'Kadaluarsa Dalam', expiryAlerts: 'Peringatan Kadaluarsa', noRecipes: 'Belum ada resep olah',
      outputUnit: 'Satuan Output', processHistory: 'Riwayat Proses', recipe: 'Resep', recipeName: 'Nama Resep',
      suggestQty: 'Saran Stok Ulang', enterMultiplier: 'Masukkan pengali',
    },
    orders: { approveRefund: 'Setujui Refund', rejectRefund: 'Tolak Refund', noRefunds: 'Tidak ada permintaan refund', requestedBy: 'Diminta Oleh' },
    posSettings: {
      blockDelete: 'Hapus Blok', blockDisabled: 'Dinonaktifkan', blockDuplicate: 'Duplikat', channels: 'Saluran',
      display: 'Tampilan', dualScreenWelcome: 'Sambutan Layar Ganda', hardware: 'Perangkat Keras', layout: 'Tampilan', payment: 'Pembayaran',
      quickAmounts: 'Jumlah Cepat', receipt: 'Struk', shift: 'Shift', sound: 'Suara', tax: 'Pajak', toolbar: 'Toolbar',
    },
    purchases: {
      approved: 'Disetujui', pending: 'Menunggu', cancelled: 'Dibatalkan', received: 'Diterima',
      contactPersonPlaceholder: 'Nama kontak', supplierNamePlaceholder: 'Nama pemasok',
    },
    reimbursement: { markedPaid: 'Ditandai Lunas', noRequests: 'Tidak ada permintaan reimburs' },
    staff: {
      addFirstShift: 'Tambah shift pertama', attendanceRules: 'Aturan Kehadiran', depositRule: 'Aturan Deposit',
      editShift: 'Edit Shift', noShifts: 'Belum ada shift dikonfigurasi', passwordRequired: 'Kata sandi wajib diisi',
      shiftConfig: 'Konfigurasi Shift', shiftKey: 'Kunci Shift', shiftName: 'Nama Shift (EN)',
      shiftNameId: 'Nama Shift (ID)', shiftNameZh: 'Nama Shift (ZH)',
    },
    members: { noName: 'Tanpa Nama' },
  },
  zh: {
    marketing: {
      addon: '加料', couponCodePlaceholder: '输入优惠券码', referralCodePlaceholder: '输入推荐码',
      usageLimitPlaceholder: '使用限制', discount_percent: '百分比折扣', discount_fixed: '固定金额',
      free_product: '免费产品', free_delivery: '免费配送', gift: '礼品', product: '产品', voucher: '代金券',
      stackingRuleTypes_stackable: '可叠加', stackingRuleTypes_exclusive: '排他', stackingRuleTypes_replace: '替换',
    },
    material: {
      day: '天', expiresIn: '剩余过期', expiryAlerts: '过期提醒', noRecipes: '暂无加工配方',
      outputUnit: '产出单位', processHistory: '加工记录', recipe: '配方', recipeName: '配方名称',
      suggestQty: '建议补货量', enterMultiplier: '输入倍数',
    },
    orders: { approveRefund: '批准退款', rejectRefund: '拒绝退款', noRefunds: '暂无退款请求', requestedBy: '申请人' },
    posSettings: {
      blockDelete: '删除区块', blockDisabled: '已禁用', blockDuplicate: '复制', channels: '渠道',
      display: '显示', dualScreenWelcome: '双屏欢迎语', hardware: '硬件', layout: '布局', payment: '支付',
      quickAmounts: '快捷金额', receipt: '小票', shift: '班次', sound: '声音', tax: '税费', toolbar: '工具栏',
    },
    purchases: {
      approved: '已批准', pending: '待处理', cancelled: '已取消', received: '已收货',
      contactPersonPlaceholder: '联系人姓名', supplierNamePlaceholder: '供应商名称',
    },
    reimbursement: { markedPaid: '已标记为已付', noRequests: '暂无报销申请' },
    staff: {
      addFirstShift: '添加第一个班次', attendanceRules: '考勤规则', depositRule: '押金规则',
      editShift: '编辑班次', noShifts: '暂无班次配置', passwordRequired: '密码为必填项',
      shiftConfig: '班次配置', shiftKey: '班次键', shiftName: '班次名称（英文）',
      shiftNameId: '班次名称（印尼）', shiftNameZh: '班次名称（中文）',
    },
    members: { noName: '无名' },
  },
};

// Build insertions list (section, lang, line number, keys to add)
const insertions = [];

for (const [lang, sections] of Object.entries(keysToAdd)) {
  for (const [section, keyNames] of Object.entries(sections)) {
    const sectionInfo = parsed[lang][section];
    if (!sectionInfo) {
      console.log(`Section ${section} (${lang}) NOT FOUND`);
      continue;
    }
    
    const existingKeys = getExistingKeys(lang, section);
    const missingKeys = keyNames.filter(k => !existingKeys.has(k));
    
    if (missingKeys.length === 0) {
      console.log(`All keys for ${section} (${lang}) already exist`);
      continue;
    }
    
    const lastKeyLine = findLastKeyLine(lang, section, sectionInfo.start, sectionInfo.end);
    if (lastKeyLine < 0) {
      console.log(`Could not find last key in ${section} (${lang})`);
      continue;
    }
    
    insertions.push({ lang, section, insertLine: lastKeyLine, missingKeys });
    console.log(`${section} (${lang}): ${missingKeys.length} keys to add at line ${lastKeyLine + 1}`);
  }
}

// Sort by line number descending
insertions.sort((a, b) => b.insertLine - a.insertLine);

const lines = content.split('\n');
let offset = 0; // Track line offset from insertions

for (const { lang, section, insertLine, missingKeys } of insertions) {
  const trans = translations[lang][section];
  
  // Generate new key lines (indent 8 spaces)
  const newLines = missingKeys.map(k => {
    const value = trans[k].replace(/'/g, "\\'");
    return `        ${k}: '${value}',`;
  });
  
  // Check if last key line has a comma, add if missing
  const lastLine = lines[insertLine];
  const needsComma = !lastLine.trim().endsWith(',');
  
  // Build insertion text
  // If last key has no comma, add it first
  if (needsComma) {
    lines[insertLine] = lines[insertLine].trimEnd() + ',';
  }
  const insertText = newLines.join('\n') + '\n';
  
  lines.splice(insertLine + 1, 0, insertText);
  console.log(`Inserted ${missingKeys.length} keys to ${section} (${lang})`);
}

fs.writeFileSync('client-admin/src/i18n/index.ts', lines.join('\n'));
console.log('\nDone!');
