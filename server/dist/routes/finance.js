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
exports.financeRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const FinanceService = __importStar(require("../services/FinanceService"));
const ProductManagementService = __importStar(require("../services/ProductManagementService"));
const router = (0, express_1.Router)();
exports.financeRouter = router;
// ==================== REVENUE ====================
// GET /api/finance/revenue
router.get('/revenue', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const result = await FinanceService.getRevenueSummary(storeId, startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate ? new Date(endDate) : new Date());
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get revenue error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get revenue' });
    }
});
// GET /api/finance/revenue/daily
router.get('/revenue/daily', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const days = parseInt(req.query.days) || 30;
        const result = await FinanceService.getDailyRevenueTrend(storeId, days);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get daily revenue error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get daily revenue' });
    }
});
// GET /api/finance/revenue/hourly
router.get('/revenue/hourly', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const date = req.query.date ? new Date(req.query.date) : new Date();
        const result = await FinanceService.getHourlyRevenueDistribution(storeId, date);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get hourly revenue error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get hourly revenue' });
    }
});
// ==================== PROFIT ====================
// GET /api/finance/profit
router.get('/profit', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const result = await FinanceService.getProfitAnalysis(storeId, startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate ? new Date(endDate) : new Date());
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get profit error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get profit analysis' });
    }
});
// ==================== INCOME STATEMENT ====================
// GET /api/finance/income-statement
router.get('/income-statement', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const includeDepreciation = req.query.includeDepreciation === 'true';
        const result = await FinanceService.getIncomeStatement(storeId, month, year, includeDepreciation);
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get income statement error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get income statement' });
    }
});
// ==================== TAX ====================
// GET /api/finance/tax
router.get('/tax', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const result = await FinanceService.getTaxReport(storeId, month, year);
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get tax report error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get tax report' });
    }
});
// ==================== CASH FLOW ====================
// GET /api/finance/cash-flow
router.get('/cash-flow', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const result = await FinanceService.getCashFlow(storeId, startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate ? new Date(endDate) : new Date());
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get cash flow error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get cash flow' });
    }
});
// ==================== GOAL TRACKING ====================
// GET /api/finance/goal
router.get('/goal', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const targetRevenue = parseInt(req.query.target) || 100000000; // Default Rp 100M
        const result = await FinanceService.getGoalTracking(storeId, month, year, targetRevenue);
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get goal tracking error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get goal tracking' });
    }
});
// ==================== PRODUCT ANALYSIS ====================
// GET /api/finance/product-mix
router.get('/product-mix', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const endDate = new Date();
        const result = await ProductManagementService.getProductMixAnalysis(storeId, startDate, endDate);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get product mix error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get product mix' });
    }
});
// GET /api/finance/abc-analysis
router.get('/abc-analysis', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const endDate = new Date();
        const result = await ProductManagementService.getABCAnalysis(storeId, startDate, endDate);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get ABC analysis error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get ABC analysis' });
    }
});
//# sourceMappingURL=finance.js.map