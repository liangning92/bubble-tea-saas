#!/usr/bin/env python3
"""Add missing i18n keys. Finds section by brace-counting from section header."""

with open('client-admin/src/i18n/index.ts') as f:
    lines = f.readlines()

def find_section_end(start_line, section_name, lines):
    """Find closing brace line of section at start_line (0-indexed)."""
    brace = 0
    for i in range(start_line, len(lines)):
        t = lines[i].strip()
        brace += t.count('{') - t.count('}')
        if i > start_line and brace == 0:
            return i
    return -1

def last_key_line(start, end, lines):
    """Find last line that is a key at indent 8."""
    for i in range(end-1, start-1, -1):
        t = lines[i]
        if len(t) >= 10 and t[8:9] != ' ' and t[8:].startswith(t.split(':')[0].strip() + ':'):
            if "'" in t or '"' in t or '`' in t:
                return i
    return end-1

def add_keys(search_after, keys, lines):
    """Find search_after, add comma to its line if needed, insert keys before section close."""
    # Find the line
    idx = -1
    for i in range(len(lines)):
        if search_after in lines[i]:
            idx = i
            break
    if idx < 0:
        print("  NOT FOUND:", search_after[:50])
        return False
    
    # Add comma if needed
    if not lines[idx].rstrip().endswith(','):
        lines[idx] = lines[idx].rstrip() + ',\n'
    
    # Find section close by brace-counting from this line's parent section
    # We need to find the section this belongs to
    # Walk back to find section header
    indent = len(lines[idx]) - len(lines[idx].lstrip())
    # Walk back to find section open
    section_start = -1
    brace_count = 0
    for i in range(idx, -1, -1):
        t = lines[i].strip()
        if t == '},' and brace_count == 0:
            brace_count = 1
            section_start = i - 1
            break
        if '{' in t:
            section_start = i
            break
        brace_count = 0
    
    if section_start < 0:
        print("  Could not find section start")
        return False
    
    # Find section end
    section_end = find_section_end(section_start, '', lines)
    if section_end < 0:
        print("  Could not find section end")
        return False
    
    # Last key line
    last_key = last_key_line(section_start, section_end, lines)
    
    # Build insert
    insert_lines = []
    for k, v in keys.items():
        insert_lines.append('        ' + k + ": '" + v + "',\n")
    
    # Insert before section end
    lines[section_end:section_end] = insert_lines
    print("  Added", len(keys), "keys before line", section_end+1)
    return True

# EN
add_keys("viewStats: 'View Stats'", {
    'couponCodePlaceholder': 'Enter coupon code',
    'referralCodePlaceholder': 'Enter referral code',
    'usageLimitPlaceholder': 'Usage limit',
    'stackingRuleTypes_stackable': 'Stackable',
    'stackingRuleTypes_exclusive': 'Exclusive',
    'stackingRuleTypes_replace': 'Replace',
}, lines)

add_keys("materialNamePlaceholder: 'e.g. Black Tea Leaves'", {
    'day': 'day',
    'expiresIn': 'Expires In',
    'expiryAlerts': 'Expiry Alerts',
    'noRecipes': 'No processing recipes',
    'outputUnit': 'Output Unit',
    'processHistory': 'Process History',
    'recipe': 'Recipe',
    'recipeName': 'Recipe Name',
    'suggestQty': 'Suggested Restock',
    'enterMultiplier': 'Enter multiplier',
}, lines)

add_keys("rejected: 'Rejected'", {
    'approveRefund': 'Approve Refund',
    'rejectRefund': 'Reject Refund',
    'noRefunds': 'No refund requests',
    'requestedBy': 'Requested By',
}, lines)

add_keys("currencySymbol: 'Rp'", {
    'blockDelete': 'Delete Block',
    'blockDisabled': 'Disabled',
    'blockDuplicate': 'Duplicate',
    'dualScreenWelcome': 'Dual Screen Welcome',
}, lines)

add_keys("noData: 'No purchase orders'", {
    'contactPersonPlaceholder': 'Contact person',
    'supplierNamePlaceholder': 'Supplier name',
}, lines)

add_keys("levelDiamond: 'Diamond'", {
    'addFirstShift': 'Add first shift',
    'attendanceRules': 'Attendance Rules',
    'depositRule': 'Deposit Rule',
    'editShift': 'Edit Shift',
    'noShifts': 'No shifts configured',
    'passwordRequired': 'Password is required',
    'shiftConfig': 'Shift Configuration',
    'shiftKey': 'Shift Key',
    'shiftName': 'Shift Name (EN)',
    'shiftNameId': 'Shift Name (ID)',
    'shiftNameZh': 'Shift Name (ZH)',
}, lines)

add_keys("pointsToRedeem: 'Enter points to redeem'", {
    'noName': 'No Name',
}, lines)

# ID
add_keys("viewStats: 'Lihat Statistik'", {
    'couponCodePlaceholder': 'Masukkan kode kupon',
    'referralCodePlaceholder': 'Masukkan kode referral',
    'usageLimitPlaceholder': 'Batas penggunaan',
    'stackingRuleTypes_stackable': 'Bertumpuk',
    'stackingRuleTypes_exclusive': 'Eksklusif',
    'stackingRuleTypes_replace': 'Ganti',
}, lines)

add_keys("materialNamePlaceholder: 'cth. Daun Teh Hitam'", {
    'day': 'hari',
    'expiresIn': 'Kadaluarsa Dalam',
    'expiryAlerts': 'Peringatan Kadaluarsa',
    'noRecipes': 'Belum ada resep olah',
    'outputUnit': 'Satuan Output',
    'processHistory': 'Riwayat Proses',
    'recipe': 'Resep',
    'recipeName': 'Nama Resep',
    'suggestQty': 'Saran Stok Ulang',
    'enterMultiplier': 'Masukkan pengali',
}, lines)

add_keys("rejected: 'Ditolak'", {
    'approveRefund': 'Setujui Refund',
    'rejectRefund': 'Tolak Refund',
    'noRefunds': 'Tidak ada permintaan refund',
    'requestedBy': 'Diminta Oleh',
}, lines)

add_keys("supplier: 'Supplier'", {
    'approved': 'Disetujui',
    'pending': 'Menunggu',
    'cancelled': 'Dibatalkan',
    'received': 'Diterima',
    'contactPersonPlaceholder': 'Nama kontak',
    'supplierNamePlaceholder': 'Nama pemasok',
}, lines)

add_keys("levelDiamond: 'Berlian'", {
    'addFirstShift': 'Tambah shift pertama',
    'attendanceRules': 'Aturan Kehadiran',
    'depositRule': 'Aturan Deposit',
    'editShift': 'Edit Shift',
    'noShifts': 'Belum ada shift dikonfigurasi',
    'passwordRequired': 'Kata sandi wajib diisi',
    'shiftConfig': 'Konfigurasi Shift',
    'shiftKey': 'Kunci Shift',
    'shiftName': 'Nama Shift (EN)',
    'shiftNameId': 'Nama Shift (ID)',
    'shiftNameZh': 'Nama Shift (ZH)',
}, lines)

add_keys("pointsToRedeem: 'Masukkan poin untuk ditukar'", {
    'noName': 'Tanpa Nama',
}, lines)

# ZH
add_keys("viewStats: '查看统计'", {
    'couponCodePlaceholder': '输入优惠券码',
    'referralCodePlaceholder': '输入推荐码',
    'usageLimitPlaceholder': '使用限制',
    'discount_percent': '百分比折扣',
    'discount_fixed': '固定金额',
    'free_product': '免费产品',
    'free_delivery': '免费配送',
    'stackingRuleTypes_stackable': '可叠加',
    'stackingRuleTypes_exclusive': '排他',
    'stackingRuleTypes_replace': '替换',
}, lines)

add_keys("materialNamePlaceholder: '例如：红茶茶叶'", {
    'day': '天',
    'expiresIn': '剩余过期',
    'expiryAlerts': '过期提醒',
    'noRecipes': '暂无加工配方',
    'outputUnit': '产出单位',
    'processHistory': '加工记录',
    'recipe': '配方',
    'recipeName': '配方名称',
    'suggestQty': '建议补货量',
    'enterMultiplier': '输入倍数',
}, lines)

add_keys("rejected: '已拒绝'", {
    'approveRefund': '批准退款',
    'rejectRefund': '拒绝退款',
    'noRefunds': '暂无退款请求',
    'requestedBy': '申请人',
}, lines)

add_keys("noData: '暂无采购单'", {
    'contactPersonPlaceholder': '联系人姓名',
    'supplierNamePlaceholder': '供应商名称',
}, lines)

add_keys("levelDiamond: '钻石'", {
    'addFirstShift': '添加第一个班次',
    'attendanceRules': '考勤规则',
    'depositRule': '押金规则',
    'editShift': '编辑班次',
    'noShifts': '暂无班次配置',
    'passwordRequired': '密码为必填项',
    'shiftConfig': '班次配置',
    'shiftKey': '班次键',
    'shiftName': '班次名称（英文）',
    'shiftNameId': '班次名称（印尼）',
    'shiftNameZh': '班次名称（中文）',
}, lines)

add_keys("memberSince: '注册时间'", {
    'noName': '无名',
}, lines)

with open('client-admin/src/i18n/index.ts', 'w') as f:
    f.writelines(lines)

print("\nDone!")
