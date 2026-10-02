const fs = require('fs');
const content = fs.readFileSync('client-admin/src/i18n/index.ts', 'utf8');
const lines = content.split('\n');

function findClosingBrace(startLine) {
  let brace = 0;
  for (let i = startLine; i < lines.length; i++) {
    brace += (lines[i].match(/{/g) || []).length;
    brace -= (lines[i].match(/}/g) || []).length;
    if (brace === 0 && i > startLine) return i;
  }
  return -1;
}

const t = {
  en: {
    marketing: {addon:'Add-on',couponCodePlaceholder:'Enter coupon code',referralCodePlaceholder:'Enter referral code',usageLimitPlaceholder:'Usage limit',discount_percent:'Percent Off',discount_fixed:'Fixed Amount',free_product:'Free Product',free_delivery:'Free Delivery',gift:'Gift',product:'Product',voucher:'Voucher',stackingRuleTypes_stackable:'Stackable',stackingRuleTypes_exclusive:'Exclusive',stackingRuleTypes_replace:'Replace'},
    material: {day:'day',expiresIn:'Expires In',expiryAlerts:'Expiry Alerts',noRecipes:'No processing recipes',outputUnit:'Output Unit',processHistory:'Process History',recipe:'Recipe',recipeName:'Recipe Name',suggestQty:'Suggested Restock',enterMultiplier:'Enter multiplier'},
    orders: {approveRefund:'Approve Refund',rejectRefund:'Reject Refund',noRefunds:'No refund requests',requestedBy:'Requested By'},
    posSettings: {blockDelete:'Delete Block',blockDisabled:'Disabled',blockDuplicate:'Duplicate',channels:'Channels',display:'Display',dualScreenWelcome:'Dual Screen Welcome',hardware:'Hardware',layout:'Layout',payment:'Payment',quickAmounts:'Quick Amounts',receipt:'Receipt',shift:'Shift',sound:'Sound',tax:'Tax',toolbar:'Toolbar'},
    purchases: {approved:'Approved',pending:'Pending',cancelled:'Cancelled',received:'Received',contactPersonPlaceholder:'Contact person',supplierNamePlaceholder:'Supplier name'},
    reimbursement: {markedPaid:'Marked as Paid',noRequests:'No reimbursement requests'},
    staff: {addFirstShift:'Add first shift',attendanceRules:'Attendance Rules',depositRule:'Deposit Rule',editShift:'Edit Shift',noShifts:'No shifts configured',passwordRequired:'Password is required',shiftConfig:'Shift Configuration',shiftKey:'Shift Key',shiftName:'Shift Name (EN)',shiftNameId:'Shift Name (ID)',shiftNameZh:'Shift Name (ZH)'},
    members: {noName:'No Name'},
  },
  id: {
    marketing: {addon:'Tambahan',couponCodePlaceholder:'Masukkan kode kupon',referralCodePlaceholder:'Masukkan kode referral',usageLimitPlaceholder:'Batas penggunaan',discount_percent:'Potongan Persen',discount_fixed:'Jumlah Tetap',free_product:'Produk Gratis',free_delivery:'Gratis Ongkir',gift:'Hadiah',product:'Produk',voucher:'Voucher',stackingRuleTypes_stackable:'Bertumpuk',stackingRuleTypes_exclusive:'Eksklusif',stackingRuleTypes_replace:'Ganti'},
    material: {day:'hari',expiresIn:'Kadaluarsa Dalam',expiryAlerts:'Peringatan Kadaluarsa',noRecipes:'Belum ada resep olah',outputUnit:'Satuan Output',processHistory:'Riwayat Proses',recipe:'Resep',recipeName:'Nama Resep',suggestQty:'Saran Stok Ulang',enterMultiplier:'Masukkan pengali'},
    orders: {approveRefund:'Setujui Refund',rejectRefund:'Tolak Refund',noRefunds:'Tidak ada permintaan refund',requestedBy:'Diminta Oleh'},
    posSettings: {blockDelete:'Hapus Blok',blockDisabled:'Dinonaktifkan',blockDuplicate:'Duplikat',channels:'Saluran',display:'Tampilan',dualScreenWelcome:'Sambutan Layar Ganda',hardware:'Perangkat Keras',layout:'Tampilan',payment:'Pembayaran',quickAmounts:'Jumlah Cepat',receipt:'Struk',shift:'Shift',sound:'Suara',tax:'Pajak',toolbar:'Toolbar'},
    purchases: {approved:'Disetujui',pending:'Menunggu',cancelled:'Dibatalkan',received:'Diterima',contactPersonPlaceholder:'Nama kontak',supplierNamePlaceholder:'Nama pemasok'},
    reimbursement: {markedPaid:'Ditandai Lunas',noRequests:'Tidak ada permintaan reimburs'},
    staff: {addFirstShift:'Tambah shift pertama',attendanceRules:'Aturan Kehadiran',depositRule:'Aturan Deposit',editShift:'Edit Shift',noShifts:'Belum ada shift dikonfigurasi',passwordRequired:'Kata sandi wajib diisi',shiftConfig:'Konfigurasi Shift',shiftKey:'Kunci Shift',shiftName:'Nama Shift (EN)',shiftNameId:'Nama Shift (ID)',shiftNameZh:'Nama Shift (ZH)'},
    members: {noName:'Tanpa Nama'},
  },
  zh: {
    marketing: {addon:'加料',couponCodePlaceholder:'输入优惠券码',referralCodePlaceholder:'输入推荐码',usageLimitPlaceholder:'使用限制',discount_percent:'百分比折扣',discount_fixed:'固定金额',free_product:'免费产品',free_delivery:'免费配送',gift:'礼品',product:'产品',voucher:'代金券',stackingRuleTypes_stackable:'可叠加',stackingRuleTypes_exclusive:'排他',stackingRuleTypes_replace:'替换'},
    material: {day:'天',expiresIn:'剩余过期',expiryAlerts:'过期提醒',noRecipes:'暂无加工配方',outputUnit:'产出单位',processHistory:'加工记录',recipe:'配方',recipeName:'配方名称',suggestQty:'建议补货量',enterMultiplier:'输入倍数'},
    orders: {approveRefund:'批准退款',rejectRefund:'拒绝退款',noRefunds:'暂无退款请求',requestedBy:'申请人'},
    posSettings: {blockDelete:'删除区块',blockDisabled:'已禁用',blockDuplicate:'复制',channels:'渠道',display:'显示',dualScreenWelcome:'双屏欢迎语',hardware:'硬件',layout:'布局',payment:'支付',quickAmounts:'快捷金额',receipt:'小票',shift:'班次',sound:'声音',tax:'税费',toolbar:'工具栏'},
    purchases: {approved:'已批准',pending:'待处理',cancelled:'已取消',received:'已收货',contactPersonPlaceholder:'联系人姓名',supplierNamePlaceholder:'供应商名称'},
    reimbursement: {markedPaid:'已标记为已付',noRequests:'暂无报销申请'},
    staff: {addFirstShift:'添加第一个班次',attendanceRules:'考勤规则',depositRule:'押金规则',editShift:'编辑班次',noShifts:'暂无班次配置',passwordRequired:'密码为必填项',shiftConfig:'班次配置',shiftKey:'班次键',shiftName:'班次名称（英文）',shiftNameId:'班次名称（印尼）',shiftNameZh:'班次名称（中文）'},
    members: {noName:'无名'},
  },
};

// Find closing lines for all insertions
const insertions = [];

for (const [lang, sections] of Object.entries(t)) {
  for (const [section, trans] of Object.entries(sections)) {
    // Find section line (line that exactly matches "sectionName: {")
    let sectionLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === section + ': {') {
        sectionLine = i;
        break;
      }
    }
    if (sectionLine < 0) {
      console.log('NOT FOUND: ' + section + ' (' + lang + ')');
      continue;
    }
    const closingLine = findClosingBrace(sectionLine);
    if (closingLine < 0) {
      console.log('NO CLOSING: ' + section + ' (' + lang + ')');
      continue;
    }
    insertions.push({ lang, section, keys: Object.keys(trans), closingLine });
  }
}

// Sort descending by closing line so insertions don't shift line numbers
insertions.sort((a, b) => b.closingLine - a.closingLine);

let offset = 0;
for (const ins of insertions) {
  const actualLine = ins.closingLine + offset;
  const trans = t[ins.lang][ins.section];
  
  // Check if last key has comma
  const lastKeyLine = actualLine - 1;
  const lastLine = lines[lastKeyLine];
  if (!lastLine.trim().endsWith(',')) {
    lines[lastKeyLine] = lastLine.replace(/\s+$/, '') + ',';
  }
  
  // Generate new key lines (8-space indent)
  const newLines = ins.keys.map(k => {
    const v = trans[k].replace(/'/g, "\\'");
    return '        ' + k + ": '" + v + "',";
  });
  
  lines.splice(actualLine, 0, newLines.join('\n'));
  offset += newLines.length;
  console.log('Added ' + ins.keys.length + ' keys to ' + ins.section + ' (' + ins.lang + ')');
}

fs.writeFileSync('client-admin/src/i18n/index.ts', lines.join('\n'));
console.log('\nDone!');
