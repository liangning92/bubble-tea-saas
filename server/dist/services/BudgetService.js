"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBudgets = getBudgets;
exports.createBudget = createBudget;
exports.updateBudget = updateBudget;
exports.deleteBudget = deleteBudget;
exports.getBudgetSummary = getBudgetSummary;
exports.getBudgetCategories = getBudgetCategories;
exports.saveBudgetCategories = saveBudgetCategories;
const database_1 = __importDefault(require("../config/database"));
async function getBudgets(storeId, options) {
    const where = { storeId };
    if (options?.category)
        where.category = options.category;
    if (options?.period)
        where.period = options.period;
    if (options?.year)
        where.year = options.year;
    if (options?.month)
        where.month = options.month;
    return database_1.default.budget.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });
}
async function createBudget(data) {
    return database_1.default.budget.create({
        data: {
            storeId: data.storeId,
            category: data.category,
            period: data.period,
            amount: data.amount,
            year: data.year,
            month: data.month
        }
    });
}
async function updateBudget(budgetId, data) {
    return database_1.default.budget.update({
        where: { id: budgetId },
        data: {
            ...(data.category && { category: data.category }),
            ...(data.period && { period: data.period }),
            ...(data.amount !== undefined && { amount: data.amount }),
            ...(data.year && { year: data.year }),
            ...(data.month !== undefined && { month: data.month })
        }
    });
}
async function deleteBudget(budgetId) {
    return database_1.default.budget.delete({ where: { id: budgetId } });
}
async function getBudgetSummary(storeId, year, month) {
    // Note: quarterly/yearly budgets only show correctly when month is not specified
    // When month is specified, only monthly budgets are included (limitation)
    const budgets = await database_1.default.budget.findMany({
        where: { storeId, year, ...(month && { month }) }
    });
    // Get actual expenses for comparison
    const startDate = month
        ? new Date(year, month - 1, 1)
        : new Date(year, 0, 1);
    const endDate = month
        ? new Date(year, month, 0)
        : new Date(year, 11, 31);
    const expenses = await database_1.default.expense.findMany({
        where: {
            storeId,
            date: { gte: startDate, lte: endDate }
        }
    });
    // Group actuals by category
    const actuals = {};
    for (const exp of expenses) {
        actuals[exp.category] = (actuals[exp.category] || 0) + exp.amount;
    }
    // Compare budget vs actual
    const summary = budgets.map(b => ({
        category: b.category,
        budget: b.amount,
        actual: actuals[b.category] || 0,
        variance: (actuals[b.category] || 0) - b.amount,
        variancePercent: b.amount > 0 ? ((actuals[b.category] || 0) - b.amount) / b.amount * 100 : 0
    }));
    return {
        year,
        month,
        summary,
        totalBudget: budgets.reduce((sum, b) => sum + b.amount, 0),
        totalActual: Object.values(actuals).reduce((sum, v) => sum + v, 0)
    };
}
// Default budget categories
const DEFAULT_BUDGET_CATEGORIES = [
    { key: 'rent', label: 'Sewa', labelZh: '租金', labelEn: 'Rent', color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { key: 'utilities', label: 'Utilitas', labelZh: '水电费', labelEn: 'Utilities', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { key: 'staff', label: 'Gaji Staff', labelZh: '员工工资', labelEn: 'Staff Salary', color: 'text-green-600', bgColor: 'bg-green-100' },
    { key: 'marketing', label: 'Pemasaran', labelZh: '营销', labelEn: 'Marketing', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    { key: 'supplies', label: 'Perlengkapan', labelZh: '用品', labelEn: 'Supplies', color: 'text-pink-600', bgColor: 'bg-pink-100' },
    { key: 'other', label: 'Lainnya', labelZh: '其他', labelEn: 'Other', color: 'text-gray-600', bgColor: 'bg-gray-100' }
];
// Get budget categories (from Config or defaults)
async function getBudgetCategories(storeId) {
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: 'finance.budgetCategories' } }
        });
        if (config && config.value) {
            return JSON.parse(config.value);
        }
    }
    catch { }
    return DEFAULT_BUDGET_CATEGORIES;
}
// Save budget categories to Config
async function saveBudgetCategories(storeId, categories) {
    await database_1.default.config.upsert({
        where: { storeId_key: { storeId, key: 'finance.budgetCategories' } },
        update: { value: JSON.stringify(categories) },
        create: {
            storeId,
            key: 'finance.budgetCategories',
            value: JSON.stringify(categories),
            category: 'finance'
        }
    });
    return categories;
}
//# sourceMappingURL=BudgetService.js.map