"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBankAccounts = getBankAccounts;
exports.getBankAccount = getBankAccount;
exports.createBankAccount = createBankAccount;
exports.updateBankAccount = updateBankAccount;
exports.deleteBankAccount = deleteBankAccount;
exports.getBankTransactions = getBankTransactions;
exports.createBankTransaction = createBankTransaction;
exports.deleteBankTransaction = deleteBankTransaction;
const database_1 = __importDefault(require("../config/database"));
// Bank Accounts
async function getBankAccounts(storeId) {
    return database_1.default.bankAccount.findMany({
        where: { storeId },
        include: {
            transactions: {
                orderBy: { date: 'desc' },
                take: 10
            }
        },
        orderBy: { createdAt: 'desc' }
    });
}
async function getBankAccount(id) {
    return database_1.default.bankAccount.findUnique({
        where: { id },
        include: {
            transactions: {
                orderBy: { date: 'desc' }
            }
        }
    });
}
async function createBankAccount(data) {
    return database_1.default.bankAccount.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            bank: data.bank,
            accountNo: data.accountNo,
            balance: data.balance || 0
        }
    });
}
async function updateBankAccount(id, data) {
    return database_1.default.bankAccount.update({
        where: { id },
        data: {
            ...(data.name && { name: data.name }),
            ...(data.bank && { bank: data.bank }),
            ...(data.accountNo && { accountNo: data.accountNo }),
            ...(data.balance !== undefined && { balance: data.balance })
        }
    });
}
async function deleteBankAccount(id) {
    return database_1.default.bankAccount.delete({ where: { id } });
}
// Bank Transactions
async function getBankTransactions(storeId, options) {
    const where = { storeId };
    if (options?.bankAccountId)
        where.bankAccountId = options.bankAccountId;
    if (options?.type)
        where.type = options.type;
    if (options?.startDate || options?.endDate) {
        where.date = {};
        if (options.startDate)
            where.date.gte = options.startDate;
        if (options.endDate)
            where.date.lte = options.endDate;
    }
    return database_1.default.bankTransaction.findMany({
        where,
        include: { bankAccount: true },
        orderBy: { date: 'desc' }
    });
}
async function createBankTransaction(data) {
    // Validate counterparty - must be meaningful name (min 2 chars, not just numbers/symbols)
    if (!data.counterparty || data.counterparty.trim().length < 2) {
        throw new Error('Counterparty name must be at least 2 characters');
    }
    // Check for valid counterparty format (should contain at least one letter)
    if (!/[a-zA-Z]/.test(data.counterparty)) {
        throw new Error('Counterparty name must contain at least one letter');
    }
    // Validate amount is positive
    if (data.amount <= 0) {
        throw new Error('Transaction amount must be greater than 0');
    }
    // Create transaction
    const transaction = await database_1.default.bankTransaction.create({
        data: {
            storeId: data.storeId,
            bankAccountId: data.bankAccountId,
            type: data.type,
            amount: data.amount,
            counterparty: data.counterparty,
            note: data.note,
            date: data.date
        }
    });
    // Update account balance
    const account = await database_1.default.bankAccount.findUnique({
        where: { id: data.bankAccountId }
    });
    if (account) {
        const balanceChange = data.type === 'transfer_in' ? data.amount : -data.amount;
        await database_1.default.bankAccount.update({
            where: { id: data.bankAccountId },
            data: { balance: account.balance + balanceChange }
        });
    }
    return transaction;
}
async function deleteBankTransaction(id) {
    const transaction = await database_1.default.bankTransaction.findUnique({ where: { id } });
    if (transaction) {
        // Reverse the balance change
        const account = await database_1.default.bankAccount.findUnique({
            where: { id: transaction.bankAccountId }
        });
        if (account) {
            const balanceChange = transaction.type === 'transfer_in'
                ? -transaction.amount
                : transaction.amount;
            await database_1.default.bankAccount.update({
                where: { id: transaction.bankAccountId },
                data: { balance: account.balance + balanceChange }
            });
        }
    }
    return database_1.default.bankTransaction.delete({ where: { id } });
}
//# sourceMappingURL=BankService.js.map