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
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeAccountRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const FinanceAccountService = __importStar(require("../services/FinanceAccountService"));
const router = (0, express_1.Router)();
exports.financeAccountRouter = router;
// GET /api/finance/accounts
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { type } = req.query;
        const accounts = await FinanceAccountService.getAccounts(storeId, type);
        res.json({ code: 200, data: { list: accounts } });
    }
    catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get accounts' });
    }
});
// POST /api/finance/accounts/seed
router.post('/seed', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const result = await FinanceAccountService.seedDefaultAccounts(storeId);
        res.json({ code: 200, data: result });
    }
    catch (error) {
        console.error('Seed accounts error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to seed accounts' });
    }
});
// GET /api/finance/accounts/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const account = await FinanceAccountService.getAccount(req.params.id);
        if (!account) {
            res.status(404).json({ code: 404, message: 'Account not found' });
            return;
        }
        res.json({ code: 200, data: account });
    }
    catch (error) {
        console.error('Get account error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get account' });
    }
});
// POST /api/finance/accounts
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const account = await FinanceAccountService.createAccount({
            ...req.body,
            storeId: req.user.storeId
        });
        res.status(201).json({ code: 201, data: account });
    }
    catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create account' });
    }
});
// PUT /api/finance/accounts/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const account = await FinanceAccountService.updateAccount(req.params.id, req.body);
        res.json({ code: 200, data: account });
    }
    catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update account' });
    }
});
// DELETE /api/finance/accounts/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await FinanceAccountService.deleteAccount(req.params.id);
        res.json({ code: 200, message: 'Account deleted' });
    }
    catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete account' });
    }
});
// POST /api/finance/accounts/transfer - Transfer between accounts
router.post('/transfer', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const transfer = await FinanceAccountService.transfer({
            storeId: req.user.storeId,
            fromAccountId: req.body.fromAccountId,
            toAccountId: req.body.toAccountId,
            amount: req.body.amount,
            note: req.body.note,
            date: new Date(req.body.date)
        });
        res.status(201).json({ code: 201, data: transfer });
    }
    catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to transfer' });
    }
});
// GET /api/finance/accounts/transfers - Get transfer history
router.get('/transfers/list', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { fromAccountId, toAccountId, startDate, endDate } = req.query;
        const transfers = await FinanceAccountService.getTransfers(storeId, {
            fromAccountId: fromAccountId,
            toAccountId: toAccountId,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({ code: 200, data: { list: transfers } });
    }
    catch (error) {
        console.error('Get transfers error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get transfers' });
    }
});
// ==================== ACCOUNT TYPES (Customizable) ====================
// Default account types
const DEFAULT_ACCOUNT_TYPES = [
    { key: 'cash', label: 'Tunai', labelZh: '现金', labelEn: 'Cash', icon: 'Wallet', color: 'text-green-600', bgColor: 'bg-green-100' },
    { key: 'bank', label: 'Bank', labelZh: '银行', labelEn: 'Bank', icon: 'Building2', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { key: 'receivable', label: 'Piutang', labelZh: '应收账款', labelEn: 'Receivable', icon: 'CreditCard', color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { key: 'payable', label: 'Hutang', labelZh: '应付账款', labelEn: 'Payable', icon: 'FileText', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    { key: 'revenue', label: 'Pendapatan', labelZh: '收入', labelEn: 'Revenue', icon: 'TrendingUp', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
    { key: 'cogs', label: 'HPP', labelZh: '销售成本', labelEn: 'COGS', icon: 'Package', color: 'text-red-600', bgColor: 'bg-red-100' },
    { key: 'expense', label: 'Beban', labelZh: '费用', labelEn: 'Expense', icon: 'TrendingDown', color: 'text-pink-600', bgColor: 'bg-pink-100' }
];
// GET /api/finance/accounts/types - Get account types (customizable)
router.get('/types', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const accountTypes = await FinanceAccountService.getAccountTypes(storeId);
        res.json({ code: 200, data: { list: accountTypes } });
    }
    catch (error) {
        console.error('Get account types error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get account types' });
    }
});
// PUT /api/finance/accounts/types - Update account types (customizable)
router.put('/types', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { types } = req.body;
        await FinanceAccountService.saveAccountTypes(storeId, types);
        res.json({ code: 200, message: 'Account types updated' });
    }
    catch (error) {
        console.error('Save account types error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to save account types' });
    }
});
//# sourceMappingURL=financeAccount.js.map