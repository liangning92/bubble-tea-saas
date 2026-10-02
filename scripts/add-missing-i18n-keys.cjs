/**
 * Add missing i18n keys to admin i18n file
 */

const fs = require('fs');

const content = fs.readFileSync('client-admin/src/i18n/index.ts', 'utf8');
const lines = content.split('\n');

function findSectionRanges(sectionName) {
  const ranges = [];
  let braceCount = 0;
  let sectionStart = -1;
  let sectionIndent = '';
  let currentLang = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect language context
    if (line.match(/^\s{2,}(id|en|zh):\s*\{/)) {
      currentLang = line.match(/^\s{2,}(id|en|zh)/)[1];
      braceCount = 0;
    }
    
    const sectionMatch = line.match(new RegExp(`^\\s{6}${sectionName}:\\s*\\{`));
    if (sectionMatch && currentLang) {
      sectionStart = i;
      sectionIndent = sectionMatch[0].match(/^\s*/)[0];
      braceCount = 1;
      continue;
    }
    
    if (sectionStart >= 0) {
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      if (braceCount === 0) {
        ranges.push({ lang: currentLang, start: sectionStart, end: i, indent: sectionIndent });
        sectionStart = -1;
      }
    }
  }
  return ranges;
}

const keysToAdd = {
  hygiene: {
    en: [
      'daily: \'Daily\'',
      'weekly: \'Weekly\'',
      'monthly: \'Monthly\'',
      'specificDays: \'Specific Days\'',
      'foodSafety: \'Food Safety\'',
      'dailyCleaning: \'Daily Cleaning\'',
      'equipmentMaintenance: \'Equipment Maintenance\'',
      'periodicMaintenance: \'Periodic Maintenance\'',
      'openingChecklist: \'Opening Checklist\'',
      'closingChecklist: \'Closing Checklist\'',
      'morning: \'Morning\'',
      'afternoon: \'Afternoon\'',
      'evening: \'Evening\'',
      'mon: \'Mon\'',
      'tue: \'Tue\'',
      'wed: \'Wed\'',
      'thu: \'Thu\'',
      'fri: \'Fri\'',
      'sat: \'Sat\'',
      'sun: \'Sun\'',
      'priorityCritical: \'Critical\'',
      'priorityHigh: \'High\'',
      'priorityNormal: \'Normal\'',
      'priorityLow: \'Low\'',
      'evidencePhoto: \'Photo\'',
      'evidenceSignature: \'Signature\'',
      'evidenceBoth: \'Photo & Signature\'',
    ],
    id: [
      'daily: \'Harian\'',
      'weekly: \'Mingguan\'',
      'monthly: \'Bulanan\'',
      'specificDays: \'Hari Tertentu\'',
      'foodSafety: \'Keamanan Pangan\'',
      'dailyCleaning: \'Pembersihan Harian\'',
      'equipmentMaintenance: \'Perawatan Peralatan\'',
      'periodicMaintenance: \'Perawatan Berkala\'',
      'openingChecklist: \'Daftar Pembukaan\'',
      'closingChecklist: \'Daftar Penutupan\'',
      'morning: \'Pagi\'',
      'afternoon: \'Siang\'',
      'evening: \'Malam\'',
      'mon: \'Sen\'',
      'tue: \'Sel\'',
      'wed: \'Rab\'',
      'thu: \'Kam\'',
      'fri: \'Jum\'',
      'sat: \'Sab\'',
      'sun: \'Min\'',
      'priorityCritical: \'Kritis\'',
      'priorityHigh: \'Tinggi\'',
      'priorityNormal: \'Normal\'',
      'priorityLow: \'Rendah\'',
      'evidencePhoto: \'Foto\'',
      'evidenceSignature: \'Tanda Tangan\'',
      'evidenceBoth: \'Foto & Tanda Tangan\'',
    ],
    zh: [
      'daily: \'每日\'',
      'weekly: \'每周\'',
      'monthly: \'每月\'',
      'specificDays: \'特定日期\'',
      'foodSafety: \'食品安全\'',
      'dailyCleaning: \'日常清洁\'',
      'equipmentMaintenance: \'设备维护\'',
      'periodicMaintenance: \'定期维护\'',
      'openingChecklist: \'开店检查\'',
      'closingChecklist: \'闭店检查\'',
      'morning: \'上午\'',
      'afternoon: \'下午\'',
      'evening: \'晚间\'',
      'mon: \'周一\'',
      'tue: \'周二\'',
      'wed: \'周三\'',
      'thu: \'周四\'',
      'fri: \'周五\'',
      'sat: \'周六\'',
      'sun: \'周日\'',
      'priorityCritical: \'紧急\'',
      'priorityHigh: \'高\'',
      'priorityNormal: \'普通\'',
      'priorityLow: \'低\'',
      'evidencePhoto: \'照片\'',
      'evidenceSignature: \'签名\'',
      'evidenceBoth: \'照片和签名\'',
    ],
  },
  marketing: {
    en: [
      'addon: \'Add-on\'',
      'couponCodePlaceholder: \'Enter coupon code\'',
      'referralCodePlaceholder: \'Enter referral code\'',
      'usageLimitPlaceholder: \'Usage limit\'',
      'discount_percent: \'Percent Off\'',
      'discount_fixed: \'Fixed Amount\'',
      'free_product: \'Free Product\'',
      'free_delivery: \'Free Delivery\'',
      'gift: \'Gift\'',
      'product: \'Product\'',
      'voucher: \'Voucher\'',
      'stackingRuleTypes_stackable: \'Stackable\'',
      'stackingRuleTypes_exclusive: \'Exclusive\'',
      'stackingRuleTypes_replace: \'Replace\'',
    ],
    id: [
      'addon: \'Tambahan\'',
      'couponCodePlaceholder: \'Masukkan kode kupon\'',
      'referralCodePlaceholder: \'Masukkan kode referral\'',
      'usageLimitPlaceholder: \'Batas penggunaan\'',
      'discount_percent: \'Potongan Persen\'',
      'discount_fixed: \'Jumlah Tetap\'',
      'free_product: \'Produk Gratis\'',
      'free_delivery: \'Gratis Ongkir\'',
      'gift: \'Hadiah\'',
      'product: \'Produk\'',
      'voucher: \'Voucher\'',
      'stackingRuleTypes_stackable: \'Bertumpuk\'',
      'stackingRuleTypes_exclusive: \'Eksklusif\'',
      'stackingRuleTypes_replace: \'Ganti\'',
    ],
    zh: [
      'addon: \'加料\'',
      'couponCodePlaceholder: \'输入优惠券码\'',
      'referralCodePlaceholder: \'输入推荐码\'',
      'usageLimitPlaceholder: \'使用限制\'',
      'discount_percent: \'百分比折扣\'',
      'discount_fixed: \'固定金额\'',
      'free_product: \'免费产品\'',
      'free_delivery: \'免费配送\'',
      'gift: \'礼品\'',
      'product: \'产品\'',
      'voucher: \'代金券\'',
      'stackingRuleTypes_stackable: \'可叠加\'',
      'stackingRuleTypes_exclusive: \'排他\'',
      'stackingRuleTypes_replace: \'替换\'',
    ],
  },
  material: {
    en: [
      'day: \'day\'',
      'expiresIn: \'Expires In\'',
      'expiryAlerts: \'Expiry Alerts\'',
      'noRecipes: \'No processing recipes\'',
      'outputUnit: \'Output Unit\'',
      'processHistory: \'Process History\'',
      'recipe: \'Recipe\'',
      'recipeName: \'Recipe Name\'',
      'suggestQty: \'Suggested Restock\'',
      'enterMultiplier: \'Enter multiplier\'',
    ],
    id: [
      'day: \'hari\'',
      'expiresIn: \'Kadaluarsa Dalam\'',
      'expiryAlerts: \'Peringatan Kadaluarsa\'',
      'noRecipes: \'Belum ada resep olah\'',
      'outputUnit: \'Satuan Output\'',
      'processHistory: \'Riwayat Proses\'',
      'recipe: \'Resep\'',
      'recipeName: \'Nama Resep\'',
      'suggestQty: \'Saran Stok Ulang\'',
      'enterMultiplier: \'Masukkan pengali\'',
    ],
    zh: [
      'day: \'天\'',
      'expiresIn: \'剩余过期\'',
      'expiryAlerts: \'过期提醒\'',
      'noRecipes: \'暂无加工配方\'',
      'outputUnit: \'产出单位\'',
      'processHistory: \'加工记录\'',
      'recipe: \'配方\'',
      'recipeName: \'配方名称\'',
      'suggestQty: \'建议补货量\'',
      'enterMultiplier: \'输入倍数\'',
    ],
  },
  orders: {
    en: [
      'approveRefund: \'Approve Refund\'',
      'rejectRefund: \'Reject Refund\'',
      'noRefunds: \'No refund requests\'',
      'requestedBy: \'Requested By\'',
    ],
    id: [
      'approveRefund: \'Setujui Refund\'',
      'rejectRefund: \'Tolak Refund\'',
      'noRefunds: \'Tidak ada permintaan refund\'',
      'requestedBy: \'Diminta Oleh\'',
    ],
    zh: [
      'approveRefund: \'批准退款\'',
      'rejectRefund: \'拒绝退款\'',
      'noRefunds: \'暂无退款请求\'',
      'requestedBy: \'申请人\'',
    ],
  },
  posSettings: {
    en: [
      'blockDelete: \'Delete Block\'',
      'blockDisabled: \'Disabled\'',
      'blockDuplicate: \'Duplicate\'',
      'channels: \'Channels\'',
      'display: \'Display\'',
      'dualScreenWelcome: \'Dual Screen Welcome\'',
      'hardware: \'Hardware\'',
      'layout: \'Layout\'',
      'payment: \'Payment\'',
      'quickAmounts: \'Quick Amounts\'',
      'receipt: \'Receipt\'',
      'shift: \'Shift\'',
      'sound: \'Sound\'',
      'tax: \'Tax\'',
      'toolbar: \'Toolbar\'',
    ],
    id: [
      'blockDelete: \'Hapus Blok\'',
      'blockDisabled: \'Dinonaktifkan\'',
      'blockDuplicate: \'Duplikat\'',
      'channels: \'Saluran\'',
      'display: \'Tampilan\'',
      'dualScreenWelcome: \'Sambutan Layar Ganda\'',
      'hardware: \'Perangkat Keras\'',
      'layout: \'Tampilan\'',
      'payment: \'Pembayaran\'',
      'quickAmounts: \'Jumlah Cepat\'',
      'receipt: \'Struk\'',
      'shift: \'Shift\'',
      'sound: \'Suara\'',
      'tax: \'Pajak\'',
      'toolbar: \'Toolbar\'',
    ],
    zh: [
      'blockDelete: \'删除区块\'',
      'blockDisabled: \'已禁用\'',
      'blockDuplicate: \'复制\'',
      'channels: \'渠道\'',
      'display: \'显示\'',
      'dualScreenWelcome: \'双屏欢迎语\'',
      'hardware: \'硬件\'',
      'layout: \'布局\'',
      'payment: \'支付\'',
      'quickAmounts: \'快捷金额\'',
      'receipt: \'小票\'',
      'shift: \'班次\'',
      'sound: \'声音\'',
      'tax: \'税费\'',
      'toolbar: \'工具栏\'',
    ],
  },
  purchases: {
    en: [
      'approved: \'Approved\'',
      'pending: \'Pending\'',
      'cancelled: \'Cancelled\'',
      'received: \'Received\'',
      'contactPersonPlaceholder: \'Contact person\'',
      'supplierNamePlaceholder: \'Supplier name\'',
    ],
    id: [
      'approved: \'Disetujui\'',
      'pending: \'Menunggu\'',
      'cancelled: \'Dibatalkan\'',
      'received: \'Diterima\'',
      'contactPersonPlaceholder: \'Nama kontak\'',
      'supplierNamePlaceholder: \'Nama pemasok\'',
    ],
    zh: [
      'approved: \'已批准\'',
      'pending: \'待处理\'',
      'cancelled: \'已取消\'',
      'received: \'已收货\'',
      'contactPersonPlaceholder: \'联系人姓名\'',
      'supplierNamePlaceholder: \'供应商名称\'',
    ],
  },
  reimbursement: {
    en: [
      'markedPaid: \'Marked as Paid\'',
      'noRequests: \'No reimbursement requests\'',
    ],
    id: [
      'markedPaid: \'Ditandai Lunas\'',
      'noRequests: \'Tidak ada permintaan reimburs\'',
    ],
    zh: [
      'markedPaid: \'已标记为已付\'',
      'noRequests: \'暂无报销申请\'',
    ],
  },
  staff: {
    en: [
      'addFirstShift: \'Add first shift\'',
      'attendanceRules: \'Attendance Rules\'',
      'depositRule: \'Deposit Rule\'',
      'editShift: \'Edit Shift\'',
      'noShifts: \'No shifts configured\'',
      'passwordRequired: \'Password is required\'',
      'shiftConfig: \'Shift Configuration\'',
      'shiftKey: \'Shift Key\'',
      'shiftName: \'Shift Name (EN)\'',
      'shiftNameId: \'Shift Name (ID)\'',
      'shiftNameZh: \'Shift Name (ZH)\'',
    ],
    id: [
      'addFirstShift: \'Tambah shift pertama\'',
      'attendanceRules: \'Aturan Kehadiran\'',
      'depositRule: \'Aturan Deposit\'',
      'editShift: \'Edit Shift\'',
      'noShifts: \'Belum ada shift dikonfigurasi\'',
      'passwordRequired: \'Kata sandi wajib diisi\'',
      'shiftConfig: \'Konfigurasi Shift\'',
      'shiftKey: \'Kunci Shift\'',
      'shiftName: \'Nama Shift (EN)\'',
      'shiftNameId: \'Nama Shift (ID)\'',
      'shiftNameZh: \'Nama Shift (ZH)\'',
    ],
    zh: [
      'addFirstShift: \'添加第一个班次\'',
      'attendanceRules: \'考勤规则\'',
      'depositRule: \'押金规则\'',
      'editShift: \'编辑班次\'',
      'noShifts: \'暂无班次配置\'',
      'passwordRequired: \'密码为必填项\'',
      'shiftConfig: \'班次配置\'',
      'shiftKey: \'班次键\'',
      'shiftName: \'班次名称（英文）\'',
      'shiftNameId: \'班次名称（印尼）\'',
      'shiftNameZh: \'班次名称（中文）\'',
    ],
  },
  members: {
    en: ['noName: \'No Name\''],
    id: ['noName: \'Tanpa Nama\''],
    zh: ['noName: \'无名\''],
  },
  toolbar: {
    en: ['expense: \'Expense\''],
    id: ['expense: \'Biaya\''],
    zh: ['expense: \'费用\''],
  },
};

// Collect all insertions (section, lang, keys to add, line number)
const insertions = [];

for (const [section, langKeys] of Object.entries(keysToAdd)) {
  const ranges = findSectionRanges(section);
  for (const range of ranges) {
    const { lang, start, end } = range;
    const keys = langKeys[lang];
    if (!keys) continue;
    
    // Find which keys already exist
    const existingKeys = new Set();
    for (let i = start; i <= end; i++) {
      const m = lines[i].match(/^\s{8}([a-zA-Z0-9_\.]+):/);
      if (m) existingKeys.add(m[1]);
    }
    
    const missing = keys.filter(k => {
      const keyName = k.split(':')[0];
      return !existingKeys.has(keyName);
    });
    
    if (missing.length > 0) {
      insertions.push({ section, lang, keys: missing, line: end });
    }
  }
}

// Sort by line number descending so we insert from bottom to top
insertions.sort((a, b) => b.line - a.line);

console.log('Insertions to make:', insertions.length);

for (const { section, lang, keys, line } of insertions) {
  const indent = '      ';
  const newLines = keys.map(k => `${indent}${k},`);
  lines.splice(line, 0, newLines.join('\n'));
  console.log(`Added ${keys.length} keys to ${section} (${lang}) at line ${line}`);
}

fs.writeFileSync('client-admin/src/i18n/index.ts', lines.join('\n'));
console.log('\nDone!');
