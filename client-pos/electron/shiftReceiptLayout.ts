/** Shift reports use the order receipt's typography, row grid and CPU raster renderer. */
export function shiftReceiptLayout(data: Record<string, any>) {
  const lang = String(data.language || 'id').toLowerCase()
  const label = (zh: string, en: string, id: string) => lang === 'zh' ? zh : lang === 'en' ? en : id
  const unknown = label('待核对', 'Unverified', 'Perlu diperiksa')
  const visible = (key: string) => typeof data.receiptItems?.[key] === 'boolean' ? data.receiptItems[key] : data.summaryItems?.[key] !== false
  const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  const money = (value: unknown) => number(value) ? 'Rp ' + value.toLocaleString('id-ID') : unknown
  const time = (value: unknown) => {
    const date = value instanceof Date ? value : typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value) : null
    if (!date || !Number.isFinite(date.getTime())) return unknown
    const local = new Date(date.getTime() + 7 * 3600000).toISOString()
    return `${local.slice(8,10)}/${local.slice(5,7)}/${local.slice(0,4)} ${local.slice(11,19)}`
  }
  type Row = { name: string; value: string; emphasis?: boolean; note?: string }
  const blocks: any[] = []
  const text = (value: string, bold = false, fontSize = 'normal', align = 'center') => blocks.push({type:'customText',config:{text:value},style:{bold,fontSize,align}})
  const group = (rows: Row[], title?: string, metadata = false) => {
    if (!rows.length) return
    blocks.push({type:'divider',config:{dividerStyle:'dashed'}})
    if (title) text(title, true, 'small', 'left')
    blocks.push({type:'summaryRows',config:{rows,metadata},style:{fontSize:'normal'}})
  }
  const row = (rows: Row[], key: string, name: string, value: string, emphasis = false) => {
    if (visible(key)) rows.push({name,value,emphasis})
  }
  if (visible('storeName')) text(data.storeName || 'YOUME', true, 'large')
  text(label('交接班记录', 'SHIFT HANDOVER', 'SERAH TERIMA SHIFT'), true)
  if (data.offlineStatus === 'pending') text(label('本机离线记录 · 待同步','LOCAL OFFLINE · PENDING SYNC','CATATAN OFFLINE · BELUM SINKRON'),false,'small')
  if (data.offlineStatus === 'synced') text(label('服务器已同步核对','SERVER SYNC CONFIRMED','SINKRONISASI SERVER DIKONFIRMASI'),false,'small')
  if (visible('sessionId') && data.sessionId) text(label('班次凭据', 'Session reference', 'Referensi shift')+'\n'+String(data.sessionId),false,'small')

  const metadata: Row[] = []
  const names = data.shiftNames || {}
  const fallback: Record<string,string> = {morning:label('早班','Morning','Pagi'),afternoon:label('午班','Afternoon','Siang'),evening:label('晚班','Evening','Sore'),night:label('夜班','Night','Malam')}
  row(metadata,'cashierName',label('交班员工','Cashier','Kasir'),data.cashierName || unknown)
  row(metadata,'shiftType',label('班次','Shift','Shift'),(lang === 'zh' ? names.nameZh : lang === 'id' ? names.nameId : names.name) || names.name || fallback[data.shiftType] || data.shiftType || unknown)
  row(metadata,'openedAt',label('开班时间','Opened','Mulai'),time(data.openedAt))
  row(metadata,'closedAt',label('交班时间','Closed','Selesai'),time(data.closedAt))
  row(metadata,'printedAt',label('打印时间','Printed','Dicetak'),time(data.printedAt || new Date()))
  group(metadata,undefined,true)

  const financials = data.handoverFinancials || {}, amounts: Row[] = []
  row(amounts,'revenue',label('营收','Revenue','Pendapatan'),money(financials.totalRevenue))
  row(amounts,'cashReceived',label('现金','Cash','Tunai'),money(financials.actualCashReceived))
  row(amounts,'expenseAmount',label('钱箱费用','Drawer expenses','Biaya laci'),money(financials.expenses))
  row(amounts,'openFloat',label('备用金','Opening float','Kas awal'),money(data.openFloat))
  row(amounts,'closeCash',label('现金总数','Drawer total','Total laci'),money(data.actualCash),true)
  group(amounts,label('本班交接汇总','SHIFT SUMMARY','RINGKASAN SHIFT'))

  const receipts = data.manualReceipts || {}, payments: Row[] = []
  if (data.manualReceiptsCashBasis !== 'drawer_total') row(payments,'cashReceipts',label('现金收款','Cash receipts','Penerimaan tunai'),money(receipts.cash))
  row(payments,'qrisReceipts',label('QRIS收款','QRIS receipts','Penerimaan QRIS'),money(receipts.qris))
  row(payments,'shopeefoodReceipts',label('ShopeeFood收款','ShopeeFood receipts','Penerimaan ShopeeFood'),money(receipts.shopeefood))
  row(payments,'gofoodReceipts',label('GoFood收款','GoFood receipts','Penerimaan GoFood'),money(receipts.gofood))
  group(payments,label('各渠道收款','PAYMENT RECEIPTS','PENERIMAAN'))

  const evidence = data.summaryEvidence || {}, counts: Row[] = []
  row(counts,'orderCount',label('完成订单记录','Completed orders','Pesanan selesai'),number(evidence.orderCount) ? String(evidence.orderCount) : unknown)
  row(counts,'cupCount',label('商品杯数记录','Item quantity','Jumlah minuman'),number(evidence.cupCount) ? String(evidence.cupCount) : unknown)
  group(counts)
  if (visible('expenses')) {
    const purchases = data.purchaseExpenses, expenses: Row[] = []
    if (purchases && number(purchases.total) && Array.isArray(purchases.items)) {
      for (const item of purchases.items) expenses.push({name:`${item.category} ×${item.quantity ?? '-'}`,value:money(item.amount),note:item.description ? String(item.description) : undefined})
      expenses.push({name:label('钱箱费用合计','Drawer expense total','Total biaya laci'),value:money(purchases.total),emphasis:true})
    } else expenses.push({name:label('费用明细','Expense details','Rincian biaya'),value:unknown})
    group(expenses,label('本班钱箱费用','SHIFT DRAWER EXPENSES','BIAYA LACI SHIFT'))
    text(label('已从本班钱箱支付，已扣交班现金','Paid from this drawer; deducted from handover cash','Dibayar dari laci shift; sudah mengurangi kas serah terima'),false,'small','left')
  }
  const signatures: string[] = []
  if (visible('cashierSignature')) signatures.push(label('收银员签字','Cashier sign','Ttd Kasir'))
  if (visible('supervisorSignature')) signatures.push(label('主管签字','Supervisor sign','Ttd Supervisor'))
  if (signatures.length) blocks.push({type:'signatures',config:{labels:signatures},style:{fontSize:'small'}})
  blocks.forEach((block,index) => {block.order=index;block.enabled=true})
  return {...data,paperSize:data.paperSize === '80mm' ? '80mm' : '58mm',blocks}
}
