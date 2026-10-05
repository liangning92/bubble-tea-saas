"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRevenueSummary = getRevenueSummary;
exports.getDailyRevenueTrend = getDailyRevenueTrend;
exports.getHourlyRevenueDistribution = getHourlyRevenueDistribution;
exports.getProfitAnalysis = getProfitAnalysis;
exports.getIncomeStatement = getIncomeStatement;
exports.getBalanceSheet = getBalanceSheet;
exports.getCashFlow = getCashFlow;
exports.getTaxReport = getTaxReport;
exports.getGoalTracking = getGoalTracking;
const database_1 = __importDefault(require("../config/database"));
const dateUtils_1 = require("../utils/dateUtils");
const FixedAssetService = __importStar(require("./FixedAssetService"));
// ==================== HELPERS ====================
async function getPpnRate(storeId) {
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: 'finance.ppnRate' } }
        });
        if (config) {
            const parsed = JSON.parse(config.value);
            return typeof parsed === 'number' ? parsed : 0.11;
        }
    }
    catch { }
    return 0.11; // Default fallback
}
async function getTaxExemptCategories(storeId) {
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: 'finance.taxExemptCategories' } }
        });
        if (config) {
            return JSON.parse(config.value);
        }
    }
    catch { }
    return [];
}
async function getTaxableRatio(storeId) {
    // Taxable ratio: percentage of actual revenue used for tax reporting
    // Default 100% means full revenue is taxable
    // User can set lower ratio (e.g., 80%) to adjust tax base
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: 'finance.taxableRatio' } }
        });
        if (config) {
            const parsed = JSON.parse(config.value);
            return typeof parsed === 'number' ? Math.min(100, Math.max(0, parsed)) : 100;
        }
    }
    catch { }
    return 100; // Default 100%
}
async function getRevenueSummary(storeId, startDate, endDate) {
    const [orders, ppnRate, refunds] = await Promise.all([
        database_1.default.order.findMany({
            where: {
                storeId,
                createdAt: { gte: startDate, lte: endDate },
                status: { in: ['completed', 'paid'] }
            },
            include: { items: true, refundRequests: { where: { status: 'approved' } } }
        }),
        getPpnRate(storeId),
        // Get approved refunds for this period
        database_1.default.refundRequest.findMany({
            where: {
                status: 'approved',
                order: { storeId },
                approvedAt: { gte: startDate, lte: endDate }
            }
        })
    ]);
    // Calculate total refunded amount
    const totalRefunded = refunds.reduce((sum, r) => sum + (r.amount || 0), 0);
    // Calculate revenue after deducting refunds
    const totalRevenue = orders.reduce((sum, o) => {
        const refundedAmount = o.refundRequests.reduce((s, r) => s + (r.amount || 0), 0);
        return sum + Math.max(0, o.totalAmount - refundedAmount);
    }, 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    // Calculate cost from order items (proportional to non-refunded portion)
    const totalCost = orders.reduce((sum, o) => {
        const refundedAmount = o.refundRequests.reduce((s, r) => s + (r.amount || 0), 0);
        const refundRatio = refundedAmount > 0 && o.totalAmount > 0
            ? Math.max(0, (o.totalAmount - refundedAmount) / o.totalAmount) : 1;
        return sum + o.items.reduce((s, i) => s + (i.bomCost || 0) * i.quantity * refundRatio, 0);
    }, 0);
    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? Math.round(grossProfit / totalRevenue * 100) : 0;
    // PPN based on configured rate
    const ppnCollected = Math.round(totalRevenue * ppnRate);
    const ppnPaid = Math.round(totalCost * ppnRate);
    // Calculate PPN refund proportionally - when orders are refunded, PPN should also be refunded
    // PPN is part of the order total, so refund ratio applies
    const ppnRefunded = Math.round(totalRefunded * ppnRate);
    const netRevenue = totalRevenue + ppnCollected - ppnPaid - ppnRefunded;
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
        totalRefunded
    };
}
// Daily revenue trend
async function getDailyRevenueTrend(storeId, days = 30) {
    const startDate = (0, dateUtils_1.subDays)(new Date(), days);
    const endDate = new Date();
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            createdAt: { gte: startDate, lte: endDate },
            status: { in: ['completed', 'paid'] }
        },
        include: { items: true }
    });
    // Group by day
    const dailyMap = {};
    for (let i = 0; i <= days; i++) {
        const d = (0, dateUtils_1.subDays)(new Date(), days - i);
        const key = d.toISOString().slice(0, 10);
        dailyMap[key] = { revenue: 0, cost: 0, orders: 0 };
    }
    for (const order of orders) {
        const key = new Date(order.createdAt).toISOString().slice(0, 10);
        if (dailyMap[key]) {
            dailyMap[key].revenue += order.totalAmount;
            dailyMap[key].cost += order.items.reduce((s, i) => s + (i.bomCost || 0) * i.quantity, 0);
            dailyMap[key].orders++;
        }
    }
    return Object.entries(dailyMap)
        .map(([date, data]) => ({
        date,
        ...data,
        grossProfit: data.revenue - data.cost,
        grossMargin: data.revenue > 0 ? Math.round((data.revenue - data.cost) / data.revenue * 100) : 0
    }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
// Hourly revenue distribution
async function getHourlyRevenueDistribution(storeId, date) {
    const start = (0, dateUtils_1.startOfDay)(date);
    const end = (0, dateUtils_1.endOfDay)(date);
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            createdAt: { gte: start, lte: end },
            status: { in: ['completed', 'paid'] }
        }
    });
    const hourlyMap = new Array(24).fill(0).map(() => ({ orders: 0, revenue: 0 }));
    for (const order of orders) {
        const hour = new Date(order.createdAt).getHours();
        hourlyMap[hour].orders++;
        hourlyMap[hour].revenue += order.totalAmount;
    }
    return hourlyMap.map((data, hour) => ({
        hour,
        hourLabel: `${hour.toString().padStart(2, '0')}:00`,
        ...data
    }));
}
// ==================== PROFIT ANALYSIS ====================
async function getProfitAnalysis(storeId, startDate, endDate) {
    const [orders, inventoryCosts, expenses] = await Promise.all([
        database_1.default.order.findMany({
            where: {
                storeId,
                createdAt: { gte: startDate, lte: endDate },
                status: { in: ['completed', 'paid'] }
            },
            include: { items: true }
        }),
        // Get all inventory cost changes in period (filtered by storeId via relation)
        database_1.default.stockInLog.aggregate({
            where: {
                createdAt: { gte: startDate, lte: endDate },
                inventory: { storeId }
            },
            _sum: { totalAmount: true }
        }),
        // Get actual expenses from Expense table
        database_1.default.expense.aggregate({
            where: {
                storeId,
                date: { gte: startDate, lte: endDate }
            },
            _sum: { amount: true }
        })
    ]);
    const revenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const cogs = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + (i.bomCost || 0) * i.quantity, 0), 0);
    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? Math.round(grossProfit / revenue * 100) : 0;
    // Operating costs from actual expense data
    const actualExpenses = expenses._sum.amount || 0;
    // Fallback to estimates only if no actual expense data
    const operatingCosts = actualExpenses > 0
        ? { actual: actualExpenses, isEstimate: false }
        : {
            staff: Math.round(revenue * 0.25),
            rent: Math.round(revenue * 0.10),
            utilities: Math.round(revenue * 0.03),
            marketing: Math.round(revenue * 0.02),
            other: Math.round(revenue * 0.05),
            isEstimate: true
        };
    const totalOperatingCosts = typeof operatingCosts === 'object' && 'actual' in operatingCosts
        ? operatingCosts.actual
        : Object.values(operatingCosts).reduce((a, b) => a + b, 0);
    const netProfit = grossProfit - totalOperatingCosts;
    const netMargin = revenue > 0 ? Math.round(netProfit / revenue * 100) : 0;
    return {
        revenue,
        cogs,
        grossProfit,
        grossMargin,
        operatingCosts,
        totalOperatingCosts,
        netProfit,
        netMargin,
        ordersCount: orders.length,
        isEstimate: typeof operatingCosts === 'object' && 'isEstimate' in operatingCosts ? operatingCosts.isEstimate : false
    };
}
// ==================== FINANCIAL STATEMENTS ====================
async function getIncomeStatement(storeId, month, year, includeDepreciation = false) {
    const startDate = (0, dateUtils_1.startOfMonth)(new Date(year, month - 1));
    const endDate = (0, dateUtils_1.endOfMonth)(new Date(year, month - 1));
    const summary = await getRevenueSummary(storeId, startDate, endDate);
    const profit = await getProfitAnalysis(storeId, startDate, endDate);
    // Get fixed asset depreciation if requested
    let depreciationExpense = 0;
    if (includeDepreciation) {
        const schedule = await FixedAssetService.getDepreciationSchedule(storeId);
        depreciationExpense = schedule.reduce((sum, asset) => sum + asset.monthlyDepreciation, 0);
    }
    const operatingExpenses = { ...profit.operatingCosts };
    if (includeDepreciation && depreciationExpense > 0) {
        operatingExpenses.depreciation = depreciationExpense;
        operatingExpenses.totalOperatingCosts = (operatingExpenses.totalOperatingCosts || profit.totalOperatingCosts || 0) + depreciationExpense;
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
            margin: profit.netMargin
        }
    };
}
// ==================== CASH FLOW ====================
async function getBalanceSheet(storeId, month, year) {
    const startDate = (0, dateUtils_1.startOfMonth)(new Date(year, month - 1));
    const endDate = (0, dateUtils_1.endOfMonth)(new Date(year, month - 1));
    const [orders, expenses, fixedAssets, bankAccounts, inventories, pendingPOs] = await Promise.all([
        database_1.default.order.findMany({
            where: { storeId, createdAt: { gte: startDate, lte: endDate }, status: { in: ['completed', 'paid'] } },
            include: { items: true }
        }),
        database_1.default.expense.findMany({ where: { storeId, date: { gte: startDate, lte: endDate } } }),
        FixedAssetService.getDepreciationSchedule(storeId),
        database_1.default.bankAccount.findMany({ where: { storeId } }),
        database_1.default.inventory.findMany({ where: { storeId } }),
        database_1.default.purchaseOrder.aggregate({ where: { storeId, status: { in: ['pending', 'approved'] } }, _sum: { totalAmount: true } })
    ]);
    const revenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const cost = orders.reduce((sum, order) => sum + order.items.reduce((subtotal, item) => subtotal + (item.bomCost || 0) * item.quantity, 0), 0);
    const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const cash = bankAccounts.reduce((sum, account) => sum + account.balance, 0);
    const inventoryValue = inventories.reduce((sum, item) => sum + Math.max(0, item.currentStock * Number(item.avgCost || 0)), 0);
    const fixedAssetValue = fixedAssets.reduce((sum, asset) => sum + asset.currentValue, 0);
    const totalAssets = cash + inventoryValue + fixedAssetValue;
    const taxPayable = Math.max(0, Math.round((revenue - cost) * 0.11));
    const accountsPayable = pendingPOs._sum.totalAmount || 0;
    const totalLiabilities = taxPayable + accountsPayable;
    const grossProfit = revenue - cost;
    return {
        period: `${year}-${String(month).padStart(2, '0')}`,
        revenue: { totalSales: revenue },
        grossProfit: { amount: grossProfit },
        netProfit: { amount: grossProfit - expensesTotal },
        totalAssets,
        totalLiabilities,
        equity: totalAssets - totalLiabilities,
        assets: { cash, inventory: inventoryValue, fixedAssets: fixedAssetValue },
        liabilities: { taxPayable, accountsPayable }
    };
}
async function getCashFlow(storeId, startDate, endDate) {
    // Cash inflows (orders) - filtered by storeId
    const cashSales = await database_1.default.order.aggregate({
        where: {
            storeId,
            createdAt: { gte: startDate, lte: endDate },
            status: { in: ['completed', 'paid'] },
            paymentMethod: 'cash'
        },
        _sum: { finalAmount: true }
    });
    // Cash outflows (inventory purchases) - join through Inventory to filter by storeId
    const inventoryPurchases = await database_1.default.stockInLog.aggregate({
        where: {
            createdAt: { gt