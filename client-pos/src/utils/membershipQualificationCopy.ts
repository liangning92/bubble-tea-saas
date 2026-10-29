export function membershipQualificationCopy(language: string) {
  if (language.startsWith('zh'))
    return {
      pending: '待入会',
      registered: '资料已登记，尚未成为会员',
      rule: '完成一笔实付满 Rp30,000 的消费后入会，本单按普通价结算；后续享会员特价，无需每单再次满额。',
      offline: '待入会顾客需联网结算并核实资格。',
    }
  if (language.startsWith('id'))
    return {
      pending: 'Belum aktif sebagai member',
      registered: 'Data tersimpan; member belum aktif',
      rule: 'Member aktif setelah satu transaksi selesai dibayar minimal Rp30.000. Transaksi ini memakai harga biasa. Pembelian berikutnya mendapat harga member tanpa minimum belanja berulang.',
      offline: 'Hubungkan internet untuk transaksi dan verifikasi calon member.',
    }
  return {
    pending: 'Membership pending',
    registered: 'Details saved; membership not active yet',
    rule: 'Membership activates after one completed paid order of Rp30,000. This order uses regular prices. Later orders receive member specials without a repeated minimum.',
    offline: 'Connect online to check out and verify pending membership.',
  }
}
