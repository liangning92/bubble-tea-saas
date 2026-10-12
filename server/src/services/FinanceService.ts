import { requireVerifiedReceiptIncome } from './ReceiptFinancialEvidenceService'
import { netReceivedAmount } from '../utils/refundAllocation'
import prisma from '../config/database'
import { formatDate, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from '../utils/dateUtils'
import * as FixedAssetService from './FixedAssetService'

// ==================== HELPERS ====================

async function getPpnRate(storeId: string): Promise<number> {
  try {
    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'finance.ppnRate' } }
    })
    if (config) {
      const parsed = JSON.parse(config.value)
      return typeof parsed === 'number' ? parsed : 0.11
    }
  } catch {}
  return 0.11 // Default fallback
}

async function getTaxExemptCategories(storeId: string): Promise<string[]> {
  try {
    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'finance.taxExemptCategories' } }
    })
    if (config) {
      return JSON.parse(config.value)
    }
  } catch {}
  return []
}

async function getTaxableRatio(storeId: string): Promise<number> {
  // Taxable ratio: percentage of actual revenue used for tax reporting
  // Default 100% means full revenue is taxable
  // User can set lower ratio (e.g., 80%) to adjust tax base
  try {
    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'finance.taxableRatio' } }
    })
    if (config) {
      const parsed = JSON.parse(config.value)
      return typeof parsed === 'number' ? Math.min(100, Math.max(0, parsed)) : 100
    }
  } catch {}
  return 100 // Default 100%
}

// ==================== REVENUE ANALYSIS ====================

export interface RevenueSummary {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  ppnCollected: number | null
  ppnPaid: number | null
  ppnRefunded: number | null  // PPN refunded due to partial/total refunds
  netRevenue: number
  totalRefunded: number
  missingTaxOrders: number
}

export async function getRevenueSummary(storeId: string, startDate: Date, endDate: Date): Promise<RevenueSummary> {
  const [orders, ppnRate, refunds] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['completed', 'paid','refunded'] }
      },
      include: { items: true, refundRequests: { where: { status: {in:['approved','paid']} } } }
    }),
    getPpnRate(storeId),
    // Get approved refunds for this period
    prisma.refundRequest.findMany({
      where: {
        status: 'approved',
        order: { storeId },
        approvedAt: { gte: startDate, lte: endDate }
      }
    })
  ])

  // Calculate total refunded amount
  const totalRefunded = refunds.reduce((sum, r) => sum + (r.amount || 0), 0)

  await requireVerifiedReceiptIncome(orders)
  const totalRevenue = orders.reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const totalOrders = orders.filter(o=>o.status!=='refunded').length
  const avgOrderValue = totalOrders ? Math.round(totalRevenue/totalOrders) : 0
  // Prepared goods remain consumed after a customer dissatisfaction refund.
  const totalCost = orders.reduce((sum,o)=>sum+(o.refundRequests.some(r=>r.reasonCode==='paid_unprepared')?0:o.items.reduce((n,i)=>n+i.bomCost*i.quantity,0)),0)
  const missingTaxOrders = orders.filter(o=>o.checkoutTaxAmount===null).length
  const ppnCollected = missingTaxOrders ? null : orders.reduce((sum,o)=>sum+Math.round((o.checkoutTaxAmount || 0)*netReceivedAmount(o)/Math.max(1,o.finalAmount)),0)
  const ppnRefunded = missingTaxOrders ? null : orders.reduce((sum,o)=>sum+(o.checkoutTaxAmount || 0)-Math.round((o.checkoutTaxAmount || 0)*netReceivedAmount(o)/Math.max(1,o.finalAmount)),0)
  // Purchase cost is not evidence of deductible input VAT.
  const ppnPaid = null
  const netRevenue = totalRevenue
  const grossProfit = totalRevenue-totalCost
  const grossMargin = totalRevenue ? Math.round(grossProfit/totalRevenue*100) : 0

  return {
    totalRevenue,
    totalOrders,
    avgOrderValue,
    totalCost,
    grossProfit,
    grossMargin,
    ppnCollected,
    ppnPaid,
    ppnRefunded,
    netRevenue,
    totalRefunded,
    missingTaxOrders
  }
}

// Daily revenue trend
export async function getDailyRevenueTrend(storeId: string, days: number = 30) {
  const startDate = subDays(new Date(), days)
  const endDate = new Date()

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['completed', 'paid'] }
    },
    include: { items: true,refundRequests:{where:{status:{in:['approved','paid']}}} }
  })

  // Group by day
  const dailyMap: Record<string, { revenue: number; cost: number; orders: number }> = {}

  for (let i = 0; i <= days; i++) {
    const d = subDays(new Date(), days - i)
    const key = formatDate(d)
    dailyMap[key] = { revenue: 0, cost: 0, orders: 0 }
  }

  for (const order of orders) {
    const key = formatDate(order.createdAt)
    if (dailyMap[key]) {
      dailyMap[key].revenue += netReceivedAmount(order)
      dailyMap[key].cost += order.items.reduce((s, i) => s + (i.bomCost || 0) * i.quantity, 0)
      dailyMap[key].orders++
    }
  }

  return Object.entries(dailyMap)
    .map(([date, data]) => ({
      date,
      ...data,
      grossProfit: data.revenue - data.cost,
      grossMargin: data.revenue > 0 ? Math.round((data.revenue - data.cost) / data.revenue * 100) : 0
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Hourly revenue distribution
export async function getHourlyRevenueDistribution(storeId: string, date: Date) {
  const start = startOfDay(date)
  const end = endOfDay(date)

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: start, lte: end },
      status: { in: ['completed', 'paid'] }
    }
  })

  const hourlyMap = new Array(24).fill(0).map(() => ({ orders: 0, revenue: 0 }))

  for (const order of orders) {
    const hour = new Date(order.createdAt.getTime()+7*3600000).getUTCHours()
    hourlyMap[hour].orders++
    hourlyMap[hour].revenue += netReceivedAmount(order)
  }

  return hourlyMap.map((data, hour) => ({
    hour,
    hourLabel: `${hour.toString().padStart(2, '0')}:00`,
    ...data
  }))
}

// ==================== PROFIT ANALYSIS ====================

export async function getProfitAnalysis(storeId: string, startDate: Date, endDate: Date) {
  const [orders, expenses, payroll] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['completed', 'paid', 'refunded'] }
      },
      include: { items: true,refundRequests:{where:{status:{in:['approved','paid']}}} }
    }),
    prisma.expense.findMany({ where: { storeId, date: { gte: startDate, lte: endDate } }, select: { amount: true, category: true, type: true, referenceType: true } }),
    prisma.salary.findMany({
      where: { staff: { storeId }, month: { gte: formatDate(startDate).slice(0, 7), lte: formatDate(endDate).slice(0, 7) } },
      select: { month: true, finalAmount: true, status:true }
    })
  ])

  const revenue = orders.reduce((sum, o) => sum + netReceivedAmount(o), 0)
  const cogs = orders.reduce((sum, o) =>
    sum + (o.refundRequests.some(r => r.reasonCode === 'paid_unprepared') ? 0 : o.items.reduce((s, i) => s + (i.bomCost || 0) * i.quantity, 0)), 0)

  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? Math.round(grossProfit / revenue * 100) : 0

  // Expense ledger amounts are hundredths, while order and salary amounts are
  // whole rupiah. Linked salary payments are cash events, not a second P&L cost.
  const postedExpenses = expenses.filter(e => e.referenceType !== 'salary')
  const isManualSalary = (e: typeof postedExpenses[number]) => e.type === 'salary' || ['salary', 'gaji', '工资'].includes(e.category.toLowerCase())
  const manualSalary = postedExpenses.filter(isManualSalary).reduce((sum, e) => sum + e.amount / 100, 0)
  const otherExpenses = postedExpenses.filter(e => !isManualSalary(e)).reduce((sum, e) => sum + e.amount / 100, 0)
  // Allocate a monthly payroll record across the Jakarta calendar days that
  // the selected date range actually covers. A full-month statement still
  // includes the full salary; a seven-day analysis does not charge a month.
  const accrueSalary = (salary: typeof payroll[number]) => {
    const [year, month] = salary.month.split('-').map(Number)
    const monthStart = Date.UTC(year, month - 1, 1) - 7 * 3600000
    const firstDay = Math.max(startOfDay(startDate).getTime(), monthStart)
    const lastDay = Math.min(startOfDay(endDate).getTime(), Date.UTC(year, month, 1) - 7 * 3600000 - 86400000)
    const coveredDays = Math.max(0, Math.floor((lastDay - firstDay) / 86400000) + 1)
    const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return Math.round(salary.finalAmount * coveredDays / monthDays)
  }
  const salaryAccrual = payroll.reduce((sum,salary)=>sum+accrueSalary(salary),0)
  const pendingSalary = payroll.filter(s=>s.status==='pending').reduce((sum,salary)=>sum+accrueSalary(salary),0)
  const totalOperatingCosts = otherExpenses + manualSalary + salaryAccrual
  const operatingCosts = { actual: totalOperatingCosts, salary: salaryAccrual + manualSalary, pendingSalary, other: otherExpenses, isEstimate: false }
  const netProfit = grossProfit - totalOperatingCosts
  const netMargin = revenue > 0 ? Math.round(netProfit / revenue * 100) : 0

  return {
    revenue,
    cogs,
    grossProfit,
    grossMargin,
    operatingCosts,
    totalOperatingCosts,
    netProfit,
    netMargin,
    ordersCount: orders.filter(o => o.status !== 'refunded').length,
    isEstimate: false
  }
}

// ==================== FINANCIAL STATEMENTS ====================

export async function getIncomeStatement(storeId: string, month: number, year: number, includeDepreciation: boolean = false) {
  const monthAnchor=new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00+07:00`)
  const startDate = startOfMonth(monthAnchor)
  const endDate = endOfMonth(monthAnchor)

  const summary = await getRevenueSummary(storeId, startDate, endDate)
  const profit = await getProfitAnalysis(storeId, startDate, endDate)

  // Get fixed asset depreciation if requested
  let depreciationExpense = 0
  if (includeDepreciation) {
    const schedule = await FixedAssetService.getDepreciationSchedule(storeId)
    depreciationExpense = schedule.reduce((sum, asset) => sum + asset.monthlyDepreciation / 100, 0)
  }

  const operatingExpenses: Record<string, any> = { ...profit.operatingCosts }
  if (includeDepreciation && depreciationExpense > 0) {
    operatingExpenses.depreciation = depreciationExpense
    operatingExpenses.totalOperatingCosts = (operatingExpenses.totalOperatingCosts || profit.totalOperatingCosts || 0) + depreciationExpense
  }

  return {
    period: `${year}-${month.toString().padStart(2, '0')}`,
    revenue: {
      totalSales: summary.totalRevenue,
      ppnCollected: summary.ppnCollected,
      netSales: summary.totalRevenue // Sales before tax
    },
    costOfGoods: {
      total: summary.totalCost,
      details: 'Cost of goods sold (BOM cost)'
    },
    grossProfit: {
      amount: summary.grossProfit,
      margin: summary.grossMargin
    },
	    operatingExpenses,
	    depreciationIncluded: includeDepreciation,
	    depreciationExpense: includeDepreciation ? depreciationExpense : 0,
	    operatingProfit: summary.grossProfit - ((operatingExpenses.actual || operatingExpenses.totalOperatingCosts || profit.totalOperatingCosts || 0) + (includeDepreciation ? depreciationExpense : 0)),
	    incomeTaxExpense: 0,
	    netIncome: summary.grossProfit - ((operatingExpenses.actual || operatingExpenses.totalOperatingCosts || profit.totalOperatingCosts || 0) + (includeDepreciation ? depreciationExpense : 0)),
	    netProfit: {
	      amount: profit.netProfit - (includeDepreciation ? depreciationExpense : 0),
      margin: summary.totalRevenue ? Math.round((profit.netProfit - (includeDepreciation ? depreciationExpense : 0)) / summary.totalRevenue * 100) : 0
	    }
	  }}

// ==================== CASH FLOW ====================

export async function getBalanceSheet(storeId: string, month: number, year: number) {
  const monthAnchor=new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00+07:00`)
  const startDate = startOfMonth(monthAnchor)
  const endDate = endOfMonth(monthAnchor)
  const [orders, expenses, payroll, fixedAssets, bankAccounts, inventories, pendingPOs] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, createdAt: { gte: startDate, lte: endDate }, status: { in: ['completed', 'paid', 'refunded'] } },
      include: { items: true,refundRequests:{where:{status:{in:['approved','paid']}}} }
    }),
    prisma.expense.findMany({ where: { storeId, date: { gte: startDate, lte: endDate } } }),
    prisma.salary.findMany({ where: { staff: { storeId }, month: `${year}-${String(month).padStart(2, '0')}` }, select: { finalAmount: true, status: true } }),
    FixedAssetService.getDepreciationSchedule(storeId),
    prisma.bankAccount.findMany({ where: { storeId } }),
    prisma.inventory.findMany({ where: { storeId } }),
    prisma.purchaseOrder.aggregate({ where: { storeId, status: { in: ['pending', 'approved'] } }, _sum: { totalAmount: true } })
  ])

  const revenue = orders.reduce((sum, order) => sum + netReceivedAmount(order), 0)
  const cost = orders.reduce((sum, order) => sum + (order.refundRequests.some(r => r.reasonCode === 'paid_unprepared') ? 0 : order.items.reduce((subtotal, item) => subtotal + (item.bomCost || 0) * item.quantity, 0)), 0)
  const expensesTotal = expenses.filter(expense => expense.referenceType !== 'salary').reduce((sum, expense) => sum + expense.amount / 100, 0) + payroll.reduce((sum, salary) => sum + salary.finalAmount, 0)
  const cash = bankAccounts.reduce((sum, account) => sum + account.balance / 100, 0)
  const inventoryValue = inventories.reduce((sum, item) => sum + Math.max(0, item.currentStock * Number(item.avgCost || 0) / 100), 0)
  const fixedAssetValue = fixedAssets.reduce((sum, asset) => sum + asset.currentValue / 100, 0)
  const totalAssets = cash + inventoryValue + fixedAssetValue
  const taxPayable = Math.max(0, Math.round((revenue - cost) * 0.11))
  const accountsPayable = (pendingPOs._sum.totalAmount || 0) / 100
  const payrollPayable = payroll.filter(salary => salary.status === 'pending').reduce((sum, salary) => sum + salary.finalAmount, 0)
  const totalLiabilities = taxPayable + accountsPayable + payrollPayable
  const grossProfit = revenue - cost

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    revenue: { totalSales: revenue },
    grossProfit: { amount: grossProfit },
    netProfit: { amount: grossProfit - expensesTotal },
    totalAssets,
    totalLiabilities,
    equity: totalAssets - totalLiabilities,
    assets: { cash, inventory: inventoryValue, fixedAssets: fixedAssetValue },
    liabilities: { taxPayable, accountsPayable, payrollPayable }
  }
}

export async function getCashFlow(storeId: string, startDate: Date, endDate: Date) {
  // Cash inflows (orders) - filtered by storeId
  const cashOrders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['completed', 'paid'] },
      paymentMethod: 'cash'
    },
    include: { refundRequests: true }
  })
  await requireVerifiedReceiptIncome(cashOrders)
  const cashSales = cashOrders.reduce((sum, order) => sum + netReceivedAmount(order), 0)

  // Cash outflows (inventory purchases) - join through Inventory to filter by storeId
  const inventoryPurchases = await prisma.stockInLog.aggregate({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      inventory: { storeId }
    },
    _sum: { totalAmount: true }
  })

  // Salary cash outflow is the linked payment expense. Draft payroll is an
  // accrual, not cash paid, and recording it by Salary.createdAt was wrong.
  const expenseOutflows = await prisma.expense.findMany({where:{storeId,date:{gte:startDate,lte:endDate}},select:{amount:true,category:true,type:true,referenceType:true}})
  const isSalaryPayment = (e: typeof expenseOutflows[number]) => e.referenceType === 'salary' || e.type === 'salary' || ['salary','gaji','工资'].includes(e.category.toLowerCase())
  const staffSalaries = expenseOutflows.filter(isSalaryPayment).reduce((sum,e) => sum + e.amount / 100, 0)
  const otherExpenses = expenseOutflows.filter(e => !isSalaryPayment(e)).reduce((sum,e) => sum + e.amount / 100, 0)
  const inventoryPurchaseAmount = (inventoryPurchases._sum.totalAmount || 0) / 100
  const totalOutflows = inventoryPurchaseAmount + staffSalaries + otherExpenses

  return {
    period: {
      start: formatDate(startDate),
      end: formatDate(endDate)
    },
    inflows: {
      cashSales: cashSales,
      otherSales: 0
    },
    outflows: {
      inventoryPurchases: inventoryPurchaseAmount,
      staffSalaries,
      otherExpenses
    },
    totalOutflows,
    netCashFlow: (cashSales) - totalOutflows
  }
}

// ==================== TAX REPORTING ====================

export async function getTaxReport(storeId: string, month: number, year: number) {
  const monthAnchor=new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00+07:00`)
  const startDate = startOfMonth(monthAnchor)
  const endDate = endOfMonth(monthAnchor)

  const [orders, ppnRate, taxableRatio, refunds] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['completed', 'paid','refunded'] }
      }
    }),
    getPpnRate(storeId),
    getTaxableRatio(storeId),
    // Get approved refunds for this period to calculate PPN refund
    prisma.refundRequest.findMany({
      where: {
        status: {in:['approved','paid']},
        order: { storeId },
        approvedAt: { gte: startDate, lte: endDate }
      }
    })
  ])

  const discountAmount = orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0)

  await requireVerifiedReceiptIncome(orders)
  const missingTaxOrders = orders.filter(o=>o.checkoutTaxAmount===null).length
  const taxExemptRevenue = orders.filter(o=>o.checkoutTaxAmount===0).reduce((sum,o)=>sum+o.finalAmount,0)
  const rawTaxableBase = orders.filter(o=>(o.checkoutTaxAmount || 0)>0).reduce((sum,o)=>sum+o.finalAmount-(o.checkoutTaxAmount || 0),0)
  const taxableBase = rawTaxableBase
  const ppnCollected = missingTaxOrders ? null : orders.reduce((sum,o)=>sum+(o.checkoutTaxAmount || 0),0)
  // Refund tax requires the original receipt; current tax settings never rewrite it.
  const refundOrders = await prisma.order.findMany({where:{id:{in:[...new Set(refunds.map(r=>r.orderId))]}},select:{id:true,finalAmount:true,checkoutTaxAmount:true}})
  const ppnRefunded = refundOrders.some(o=>o.checkoutTaxAmount===null) ? null : refunds.reduce((sum,r)=>{const o=refundOrders.find(o=>o.id===r.orderId);return sum+(o ? Math.round((o.checkoutTaxAmount || 0)*r.amount/Math.max(1,o.finalAmount)) : 0)},0)
  const totalRefunded = refunds.reduce((sum,r)=>sum+r.amount,0)
  // Group by payment method for PPH reporting
  const byPaymentMethod: Record<string, number> = {}
  for (const order of orders) {
    if (!byPaymentMethod[order.paymentMethod]) {
      byPaymentMethod[order.paymentMethod] = 0
    }
    byPaymentMethod[order.paymentMethod] += order.finalAmount
  }

  // PPH (Pajak Penghasilan) calculation structure
  // PPH rates (Indonesian tax law):
  // - PPH 21 (employee income tax): 5% (income up to 60M), 15% (60M-250M), 25% (250M-500M), 30% (>500M)
  // - PPH 23 (contractor/service provider): 2% on gross income
  // - PPH 25 (monthly installment): Based on annual tax estimate / 12
  //
  // DATA REQUIREMENTS:
  // - PPH 21: Requires Salary model with employeeId, grossSalary, pph21Withheld per period
  // - PPH 23: Requires SupplierPayment model with amount, pph23Withheld per payment
  // - PPH 25: Requires monthly salary payments integrated with pph21 calculation
  //
  // Current implementation returns structure with data requirements documented.
  // Full implementation requires:
  // 1. Salary table with pph21 field (already exists via Salary model)
  // 2. Supplier payment records linked to finance
  // 3. Monthly tax installment calculation
  const pphData = {
    status: 'requires_integration',
    note: 'PPH calculation requires Salary and SupplierPayment data integration',
    // PPH 21 - Employee income tax (withheld from salary)
    pph21: {
      amount: 0,
      note: 'Sum of PPH 21 withheld from employee salaries in period',
      dataRequired: ['Salary.pph21Withheld', 'Staff data']
    },
    // PPH 23 - Service provider tax (2% on contractor payments)
    pph23: {
      amount: 0,
      rate: 0.02,
      note: '2% of gross payments to service providers/contractors',
      dataRequired: ['SupplierPayment.pph23Withheld', 'Contractor invoices']
    },
    // PPH 25 - Monthly income tax installment
    pph25: {
      amount: 0,
      note: 'Monthly tax installment based on annual estimate',
      dataRequired: ['Annual tax estimate / 12']
    }
  }

  return {
    period: `${year}-${month.toString().padStart(2, '0')}`,
    taxId: '01', // Simplified tax ID
    totalRevenue: orders.reduce((sum, o) => sum + o.finalAmount, 0),
    taxExemptRevenue,
    taxableRevenue: Math.max(0, taxableBase),
    rawTaxableBase,  // Before ratio adjustment
    taxableRatio,     // User-configured ratio (0-100%)
    ppnCollected,
    ppnRefunded,      // PPN refunded due to partial/total refunds
    ppnRate,
    missingTaxOrders,
    totalRefunded,    // Total refund amount for the period
    revenueByPaymentMethod: byPaymentMethod,
    orderCount: orders.length,
    pph: pphData
  }
}

// ==================== GOAL TRACKING ====================

export async function getGoalTracking(storeId: string, month: number, year: number, targetRevenue: number) {
  const monthAnchor=new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00+07:00`)
  const startDate = startOfMonth(monthAnchor)
  const endDate = endOfMonth(monthAnchor)

  const summary = await getRevenueSummary(storeId, startDate, endDate)

  return {
    period: `${year}-${month.toString().padStart(2, '0')}`,
    target: targetRevenue,
    actual: summary.totalRevenue,
    achievement: targetRevenue > 0 ? Math.round(summary.totalRevenue / targetRevenue * 100) : 0,
    variance: summary.totalRevenue - targetRevenue,
    orderCount: summary.totalOrders,
    avgOrderValue: summary.avgOrderValue
  }
}
