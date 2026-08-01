"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountTypes = getAccountTypes;
exports.saveAccountTypes = saveAccountTypes;
exports.getAccounts = getAccounts;
exports.getAccount = getAccount;
exports.createAccount = createAccount;
exports.updateAccount = updateAccount;
exports.deleteAccount = deleteAccount;
exports.transfer = transfer;
exports.getTransfers = getTransfers;
exports.seedDefaultAccounts = seedDefaultAccounts;
const database_1 = __importDefault(require("../config/database"));
// Default account types (used when no custom types are defined)
const DEFAULT_ACCOUNT_TYPES = [
    { key: 'cash', label: 'Tunai', labelZh: '现金', labelEn: 'Cash', icon: 'Wallet', color: 'text-green-600', bgColor: 'bg-green-100' },
    { key: 'bank', label: 'Bank', labelZh: '银行', labelEn: 'Bank', icon: 'Building2', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { key: 'receivable', label: 'Piutang', labelZh: '应收账款', labelEn: 'Receivable', icon: 'CreditCard', color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { key: 'payable', label: 'Hutang', labelZh: '应付账款', labelEn: 'Payable', icon: 'FileText', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    { key: 'revenue', label: 'Pendapatan', labelZh: '收入', labelEn: 'Revenue', icon: 'TrendingUp', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
    { key: 'cogs', label: 'HPP', labelZh: '销售成本', labelEn: 'COGS', icon: 'Package', color: 'text-red-600', bgColor: 'bg-red-100' },
    { key: 'expense', label: 'Beban', labelZh: '费用', labelEn: 'Expense', icon: 'TrendingDown', color: 'text-pink-600', bgColor: 'bg-pink-100' }
];
// Get account types (from Config or defaults)
async function getAccountTypes(storeId) {
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: 'finance.accountTypes' } }
        });
        if (config && config.value) {
            return JSON.parse(config.value);
        }
    }
    catch { }
    // Return defaults if no custom config
    return DEFAULT_ACCOUNT_TYPES;
}
// Save account types to Config
async function saveAccountTypes(storeId, types) {
    // Upsert config
    await database_1.default.config.upsert({
        where: { storeId_key: { storeId, key: 'finance.accountTypes' } },
        update: { value: JSON.stringify(types) },
        create: {
            storeId,
            key: 'finance.accountTypes',
            value: JSON.stringify(types),
            category: 'finance'
        }
    });
    return types;
}
async function getAccounts(storeId, type) {
    const where = { storeId };
    if (type)
        where.type = type;
    return database_1.default.financeAccount.findMany({
        where,
        orderBy: { sortOrder: 'asc' }
    });
}
async function getAccount(id) {
    return database_1.default.financeAccount.findUnique({ where: { id } });
}
async function createAccount(data) {
    return database_1.default.financeAccount.create({
        data: {
            storeId: data.storeId,
            code: data.code,
            name: data.name,
            type: data.type,
            parentCode: data.parentCode,
            sortOrder: data.sortOrder || 0
        }
    });
}
async function updateAccount(id, data) {
    return database_1.default.financeAccount.update({
        where: { id },
        data: {
            ...(data.code && { code: data.code }),
            ...(data.name && { name: data.name }),
            ...(data.type && { type: data.type }),
            ...(data.parentCode !== undefined && { parentCode: data.parentCode }),
            ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder })
        }
    });
}
async function deleteAccount(id) {
    return database_1.default.financeAccount.delete({ where: { id } });
}
// Transfer between accounts
async function transfer(data) {
    if (data.amount <= 0) {
        throw new Error('Amount must be positive');
    }
    // Get both accounts
    const fromAccount = await database_1.default.financeAccount.findUnique({ where: { id: data.fromAccountId } });
    const toAccount = await database_1.default.financeAccount.findUnique({ where: { id: data.toAccountId } });
    if (!fromAccount || !toAccount) {
        throw new Error('Account not found');
    }
    // Create transfer record and update balances in a transaction
    return database_1.default.$transaction(async (tx) => {
        // Create transfer record
        const transfer = await tx.financeTransfer.create({
            data: {
                storeId: data.storeId,
                fromAccountId: data.fromAccountId,
                toAccountId: data.toAccountId,
                amount: data.amount,
                note: data.note,
                date: data.date
            }
        });
        // Update from account balance (decrease)
        await tx.financeAccount.update({
            where: { id: data.fromAccountId },
            data: { balance: { decrement: data.amount } }
        });
        // Update to account balance (increase)
        await tx.financeAccount.update({
            where: { id: data.toAccountId },
            data: { balance: { increment: data.amount } }
        });
        return transfer;
    });
}
// Get transfers
async function getTransfers(storeId, options) {
    const where = { storeId };
    if (options?.fromAccountId)
        where.fromAccountId = options.fromAccountId;
    if (options?.toAccountId)
        where.toAccountId = options.toAccountId;
    if (options?.startDate || options?.endDate) {
        where.date = {};
        if (options.startDate)
            where.date.gte = options.startDate;
        if (options.endDate)
            where.date.lte = options.endDate;
    }
    return database_1.default.financeTransfer.findMany({
        where,
        include: {
            fromAccount: true,
            toAccount: true
        },
        orderBy: { date: 'desc' }
    });
}
// Seed default accounts for a store
async function seedDefaultAccounts(storeId) {
    const defaults = [
        // Asset accounts (type: asset has sub-types: cash, bank, receivable)
        { code: '1001', name: 'Cash', type: 'cash', sortOrder: 1 },
        { code: '1002', name: 'Bank BCA', type: 'bank', sortOrder: 2 },
        { code: '1003', name: 'Bank Mandiri', type: 'bank', sortOrder: 3 },
        { code: '1004', name: 'Accounts Receivable', type: 'receivable', sortOrder: 4 },
        // Liability accounts (type: liability = payable)
        { code: '2001', name: 'Accounts Payable', type: 'payable', sortOrder: 10 },
        // Revenue
        { code: '4001', name: 'Sales Revenue', type: 'revenue', sortOrder: 20 },
        // Cost of Goods Sold
        { code: '5001', name: 'Cost of Goods Sold', type: 'cogs', sortOrder: 30 },
        // Expenses
        { code: '6001', name: 'Rent Expense', type: 'expense', sortOrder: 40 },
        { code: '6002', name: 'Utilities Expense', type: 'expense', sortOrder: 41 },
        { code: '6003', name: 'Salaries Expense', type: 'expense', sortOrder: 42 },
    ];
    // Check if already seeded
    const existing = await database_1.default.financeAccount.findMany({
        where: { storeId }
    });
    if (existing.length > 0) {
        return { count: 0, message: 'Already seeded' };
    }
    // Create all accounts with initial balance of 0
    await database_1.default.financeAccount.createMany({
        data: defaults.map(d => ({ ...d, storeId, balance: 0 }))
    });
    return { count: defaults.length };
}
//# sourceMappingURL=FinanceAccountService.js.map