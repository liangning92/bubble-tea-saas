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
exports.financeBudgetRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const BudgetService = __importStar(require("../services/BudgetService"));
const router = (0, express_1.Router)();
exports.financeBudgetRouter = router;
// GET /api/finance/budgets
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { category, period, year, month } = req.query;
        const budgets = await BudgetService.getBudgets(storeId, {
            category: category,
            period: period,
            year: year ? parseInt(year) : undefined,
            month: month ? parseInt(month) : undefined
        });
        res.json({ code: 200, data: { list: budgets } });
    }
    catch (error) {
        console.error('Get budgets error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get budgets' });
    }
});
// GET /api/finance/budgets/summary
router.get('/summary', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = req.query.month ? parseInt(req.query.month) : undefined;
        const summary = await BudgetService.getBudgetSummary(storeId, year, month);
        res.json({ code: 200, data: summary });
    }
    catch (error) {
        console.error('Get budget summary error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get budget summary' });
    }
});
// POST /api/finance/budgets
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const budget = await BudgetService.createBudget({
            ...req.body,
            storeId: req.user.storeId
        });
        res.status(201).json({ code: 201, data: budget });
    }
    catch (error) {
        console.error('Create budget error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create budget' });
    }
});
// PUT /api/finance/budgets/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const budget = await BudgetService.updateBudget(req.params.id, req.body);
        res.json({ code: 200, data: budget });
    }
    catch (error) {
        console.error('Update budget error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update budget' });
    }
});
// DELETE /api/finance/budgets/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await BudgetService.deleteBudget(req.params.id);
        res.json({ code: 200, message: 'Budget deleted' });
    }
    catch (error) {
        console.error('Delete budget error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete budget' });
    }
});
// ==================== BUDGET CATEGORIES (Customizable) ====================
// GET /api/finance/budgets/categories
router.get('/categories', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const categories = await BudgetService.getBudgetCategories(storeId);
        res.json({ code: 200, data: { list: categories } });
    }
    catch (error) {
        console.error('Get budget categories error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get budget categories' });
    }
});
// PUT /api/finance/budgets/categories
router.put('/categories', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { categories } = req.body;
        await BudgetService.saveBudgetCategories(storeId, categories);
        res.json({ code: 200, message: 'Budget categories updated' });
    }
    catch (error) {
        console.error('Save budget categories error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to save budget categories' });
    }
});
//# sourceMappingURL=financeBudget.js.map