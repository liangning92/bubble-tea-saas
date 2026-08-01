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
exports.bankRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const BankService = __importStar(require("../services/BankService"));
const router = (0, express_1.Router)();
exports.bankRouter = router;
// GET /api/bank/accounts
router.get('/accounts', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const accounts = await BankService.getBankAccounts(storeId);
        res.json({ code: 200, data: { list: accounts } });
    }
    catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get accounts' });
    }
});
// GET /api/bank/accounts/:id
router.get('/accounts/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const account = await BankService.getBankAccount(req.params.id);
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
// POST /api/bank/accounts
router.post('/accounts', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const account = await BankService.createBankAccount(req.body);
        res.status(201).json({ code: 201, data: account });
    }
    catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create account' });
    }
});
// PUT /api/bank/accounts/:id
router.put('/accounts/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const account = await BankService.updateBankAccount(req.params.id, req.body);
        res.json({ code: 200, data: account });
    }
    catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update account' });
    }
});
// DELETE /api/bank/accounts/:id
router.delete('/accounts/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await BankService.deleteBankAccount(req.params.id);
        res.json({ code: 200, message: 'Account deleted' });
    }
    catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete account' });
    }
});
// GET /api/bank/transactions
router.get('/transactions', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { bankAccountId, type, startDate, endDate } = req.query;
        const transactions = await BankService.getBankTransactions(storeId, {
            bankAccountId: bankAccountId,
            type: type,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({ code: 200, data: { list: transactions } });
    }
    catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get transactions' });
    }
});
// POST /api/bank/transactions
router.post('/transactions', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const transaction = await BankService.createBankTransaction(req.body);
        res.status(201).json({ code: 201, data: transaction });
    }
    catch (error) {
        console.error('Create transaction error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create transaction' });
    }
});
// DELETE /api/bank/transactions/:id
router.delete('/transactions/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await BankService.deleteBankTransaction(req.params.id);
        res.json({ code: 200, message: 'Transaction deleted' });
    }
    catch (error) {
        console.error('Delete transaction error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete transaction' });
    }
});
//# sourceMappingURL=bank.js.map