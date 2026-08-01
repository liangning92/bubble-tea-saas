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
exports.productAnalysisRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const ProductManagementService = __importStar(require("../services/ProductManagementService"));
const router = (0, express_1.Router)();
exports.productAnalysisRouter = router;
// ==================== PROCESS RECIPES ====================
// GET /api/product-analysis/recipes
router.get('/recipes', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const result = await ProductManagementService.getProcessRecipes(storeId);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get recipes error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get recipes' });
    }
});
// POST /api/product-analysis/recipes
router.post('/recipes', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const result = await ProductManagementService.createProcessRecipe({
            ...req.body,
            storeId: req.user.storeId
        });
        res.status(201).json({
            code: 201,
            message: 'Recipe created',
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create recipe error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create recipe' });
    }
});
// GET /api/product-analysis/recipes/:id/cost
router.get('/recipes/:id/cost', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await ProductManagementService.calculateRecipeCost(id);
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Calculate recipe cost error:', error);
        res.status(500).json({ code: 500, message: 'Failed to calculate recipe cost' });
    }
});
// ==================== PRODUCT MIX ====================
// GET /api/product-analysis/mix
router.get('/mix', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
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
// ==================== ABC ANALYSIS ====================
// GET /api/product-analysis/abc
router.get('/abc', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
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
// ==================== PRODUCT SCORE ====================
// GET /api/product-analysis/score/:productId
router.get('/score/:productId', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { productId } = req.params;
        const days = parseInt(req.query.days) || 30;
        const result = await ProductManagementService.getProductPerformanceScore(productId, days);
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get product score error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get product score' });
    }
});
//# sourceMappingURL=productAnalysis.js.map