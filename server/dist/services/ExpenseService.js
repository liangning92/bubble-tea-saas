"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpenses = getExpenses;
exports.getExpenseSummary = getExpenseSummary;
exports.createExpense = createExpense;
exports.deleteExpense = deleteExpense;
exports.updateExpense = updateExpense;
exports.getExpenseById = getExpenseById;
exports.createExpensesBulk = createExpensesBulk;
exports.getExpenseCategories = getExpenseCategories;
exports.saveExpenseCategories = saveExpenseCategories;
const database_1 = __importDefault(require("../config/database"));
// Get expenses with filtering
async function getExpenses(storeId, options) {
    const where = { storeId };
    if (options?.type)
        where.type = options.type;
    if (options?.category)
        where.category = options.category;
    if (options?.startDate || options?.endDate) {
        where.date = {};
        if (options.startDate)
            where.date.gte = options.startDate;
        if (options.endDate)
            where.date.lte = options.endDate;
    }
    return database_1.default.expense.findMany({
        where,
        orderBy: { date: 'desc' }
    });
}
// Get expense summary by category
async function getExpenseSummary(storeId, startDate, endDate) {
    const expenses = await database_1.default.expense.findMany({
        where: {
            storeId,
            date: { gte: startDate, lte: endDate }
        }
    });
    // Group by category
    const summary = {};
    for (const exp of expenses) {
        summary[exp.category] = (summary[exp.category] || 0) + exp.amount;
    }
    const total = Object.values(summary).reduce((sum, v) => sum + v, 0);
    return {
        total,
        byCategory: Object.entries(summary).map(([category, amount]) => ({ category, amount })),
        count: expenses.length
    };
}
// Create expense
async function createExpense(data) {
    // Validate amount > 0
    if (!data.amount || data.amount <= 0) {
        throw new Error('Expense amount must be greater than 0');
    }
    return database_1.default.expense.create({
        data: {
            storeId: data.storeId,
            type: data.type,
            category: data.category,
            amount: data.amount,
            description: data.description,
            date: data.date,
            referenceId: data.referenceId,
            referenceType: data.referenceType
        }
    });
}
// Delete expense
async function deleteExpense(expenseId) {
    return database_1.default.expense.delete({ where: { id: expenseId } });
}
// Update expense
async function updateExpense(expenseId, data) {
    // Validate amount > 0 if provided
    if (data.amount !== undefined && data.amount <= 0) {
        throw new Error('Expense amount must be greater than 0');
    }
    return database_1.default.expense.update({
        where: { id: expenseId },
        data: {
            ...(data.type && { type: data.type }),
            ...(data.category && { category: data.category }),
            ...(data.amount !== undefined && { amount: data.amount }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.date && { date: data.date })
        }
    });
}
// Get expense by ID (for audit)
async function getExpenseById(expenseId) {
    return database_1.default.expense.findUnique({ where: { id: expenseId } });
}
// Bulk create expenses (for import)
async function createExpensesBulk(data) {
    // Filter out invalid amounts
    const valid = data.filter(d => d.amount && d.amount > 0);
    if (valid.length === 0) {
        throw new Error('No valid expenses to import');
    }
    return database_1.default.expense.createMany({
        data: valid.map(d => ({
            storeId: d.storeId,
            type: d.type,
            category: d.category,
            amount: d.amount,
            description: d.description,
            date: d.date
        }))
    });
}
// Default expense categories
const DEFAULT_EXPENSE_CATEGORIES = [
    { key: 'rent', label: 'Sewa', labelZh: '租金', labelEn: 'Rent', color: 'text-purple-600', bgColor: 'bg-purple-100', isDefault: true },
    { key: 'utilities', label: 'Utilitas', labelZh: '水电费', labelEn: 'Utilities', color: 'text-blue-600', bgColor: 'bg-blue-100', isDefault: true },
    { key: 'supplies', label: 'Perlengkapan', labelZh: '用品', labelEn: 'Supplies', color: 'text-green-600', bgColor: 'bg-green-100', isDefault: true },
    { key: 'salary', label: 'Gaji', labelZh: '工资', labelEn: 'Salary', color: 'text-orange-600', bgColor: 'bg-orange-100', isDefault: true },
    { key: 'reimbursement', label: 'Ganti Rugi', labelZh: '报销', labelEn: 'Reimbursement', color: 'text-pink-600', bgColor: 'bg-pink-100', isDefault: true },
    { key: 'other', label: 'Lainnya', labelZh: '其他', labelEn: 'Other', color: 'text-gray-600', bgColor: 'bg-gray-100', isDefault: true }
];
// Get expense categories from Config or defaults
async function getExpenseCategories(storeId) {
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: 'expense.categories' } }
        });
        if (config && config.value) {
            return JSON.parse(config.value);
        }
    }
    catch { }
    return DEFAULT_EXPENSE_CATEGORIES;
}
// Save expense categories to Config
async function saveExpenseCategories(storeId, categories) {
    await database_1.default.config.upsert({
        where: { storeId_key: { storeId, key: 'expense.categories' } },
        update: { value: JSON.stringify(categories) },
        create: {
            storeId,
            key: 'expense.categories',
            value: JSON.stringify(categories),
            category: 'expense'
        }
    });
    return categories;
}
//# sourceMappingURL=ExpenseService.js.map