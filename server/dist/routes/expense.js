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
exports.expenseRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const ExpenseService = __importStar(require("../services/ExpenseService"));
const FinanceAuditService = __importStar(require("../services/FinanceAuditService"));
const XLSX = __importStar(require("xlsx"));
const router = (0, express_1.Router)();
exports.expenseRouter = router;
// GET /api/expenses
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { type, category, startDate, endDate } = req.query;
        const expenses = await ExpenseService.getExpenses(storeId, {
            type: type,
            category: category,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({ code: 200, data: { list: expenses } });
    }
    catch (error) {
        console.error('Get expenses error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get expenses' });
    }
});
// GET /api/expenses/summary
router.get('/summary', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const endDate = new Date();
        const summary = await ExpenseService.getExpenseSummary(storeId, startDate, endDate);
        res.json({ code: 200, data: summary });
    }
    catch (error) {
        console.error('Get expense summary error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get expense summary' });
    }
});
// POST /api/expenses
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const expense = await ExpenseService.createExpense({ ...req.body, storeId: req.user.storeId });
        await FinanceAuditService.createAuditLog({
            storeId: req.user.storeId,
            userId: req.user.id,
            action: 'create',
            entityType: 'expense',
            entityId: expense.id,
            description: `Created expense: ${req.body.category} - ${req.body.amount}`,
            newValue: req.body
        });
        res.status(201).json({ code: 201, data: expense });
    }
    catch (error) {
        console.error('Create expense error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create expense' });
    }
});
// PUT /api/expenses/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const oldExpense = await ExpenseService.getExpenseById(req.params.id);
        const expense = await ExpenseService.updateExpense(req.params.id, req.body);
        await FinanceAuditService.createAuditLog({
            storeId: req.user.storeId,
            userId: req.user.id,
            action: 'update',
            entityType: 'expense',
            entityId: req.params.id,
            description: `Updated expense: ${req.body.category || oldExpense?.category}`,
            oldValue: oldExpense || undefined,
            newValue: req.body
        });
        res.json({ code: 200, data: expense });
    }
    catch (error) {
        console.error('Update expense error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update expense' });
    }
});
// POST /api/expenses/bulk - Bulk import from CSV/Excel
router.post('/bulk', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { expenses } = req.body;
        if (!expenses || !Array.isArray(expenses)) {
            res.status(400).json({ code: 400, message: 'Invalid expenses data' });
            return;
        }
        const data = expenses.map(e => ({
            storeId,
            type: e.type || 'operational',
            category: e.category,
            amount: e.amount,
            description: e.description || '',
            date: new Date(e.date)
        }));
        const result = await ExpenseService.createExpensesBulk(data);
        res.status(201).json({ code: 201, data: { count: result.count } });
    }
    catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to import expenses' });
    }
});
// GET /api/expenses/export - Export expenses to Excel
router.get('/export', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate, category } = req.query;
        const options = {};
        if (startDate)
            options.startDate = new Date(startDate);
        if (endDate)
            options.endDate = new Date(endDate);
        if (category)
            options.category = category;
        const expenses = await ExpenseService.getExpenses(storeId, options);
        // Create workbook
        const wb = XLSX.utils.book_new();
        const data = expenses.map((e) => ({
            Date: new Date(e.date).toLocaleDateString('id-ID'),
            Category: e.category,
            Type: e.type,
            Amount: e.amount / 100,
            Description: e.description || ''
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=expenses.xlsx');
        res.send(buffer);
    }
    catch (error) {
        console.error('Export expenses error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to export expenses' });
    }
});
// DELETE /api/expenses/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const expense = await ExpenseService.getExpenseById(req.params.id);
        await ExpenseService.deleteExpense(req.params.id);
        if (expense) {
            await FinanceAuditService.createAuditLog({
                storeId: req.user.storeId,
                userId: req.user.id,
                action: 'delete',
                entityType: 'expense',
                entityId: req.params.id,
                description: `Deleted expense: ${expense.category} - ${expense.amount}`,
                oldValue: expense
            });
        }
        res.json({ code: 200, message: 'Expense deleted' });
    }
    catch (error) {
        console.error('Delete expense error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete expense' });
    }
});
// ==================== EXPENSE CATEGORIES (Customizable) ====================
// GET /api/expenses/categories
router.get('/categories', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const categories = await ExpenseService.getExpenseCategories(storeId);
        res.json({ code: 200, data: { list: categories } });
    }
    catch (error) {
        console.error('Get expense categories error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get expense categories' });
    }
});
// PUT /api/expenses/categories
router.put('/categories', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { categories } = req.body;
        await ExpenseService.saveExpenseCategories(storeId, categories);
        res.json({ code: 200, message: 'Expense categories updated' });
    }
    catch (error) {
        console.error('Save expense categories error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to save expense categories' });
    }
});
//# sourceMappingURL=expense.js.map