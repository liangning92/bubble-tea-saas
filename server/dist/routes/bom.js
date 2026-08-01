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
exports.bomRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const bomService = __importStar(require("../services/BomService"));
const router = (0, express_1.Router)();
exports.bomRouter = router;
// GET /api/bom/products - 获取所有产品的BOM成本分析
router.get('/products', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const products = await bomService.getProductsWithBomCost(storeId);
        res.json({ code: 200, data: { list: products } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/bom/products/:id - 获取单个产品的BOM明细
router.get('/products/:id', auth_1.authenticate, async (req, res) => {
    try {
        const product = await bomService.getProductBomDetail(req.params.id);
        if (!product)
            return res.status(404).json({ code: 404, message: 'Product not found' });
        res.json({ code: 200, data: product });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/bom/materials/usage - 获取原料使用预测
router.get('/materials/usage', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { days } = req.query;
        const usage = await bomService.getMaterialUsageForecast(storeId, days ? parseInt(days) : 30);
        res.json({ code: 200, data: usage });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/bom/materials/low-stock-alert - 库存预警（基于预测消耗）
router.get('/materials/low-stock-alert', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { days } = req.query;
        const alerts = await bomService.getLowStockAlerts(storeId, days ? parseInt(days) : 7);
        res.json({ code: 200, data: alerts });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/bom/recipes/:productId/cost - 计算单个产品成本
router.get('/recipes/:productId/cost', auth_1.authenticate, async (req, res) => {
    try {
        const cost = await bomService.calculateProductCost(req.params.productId);
        res.json({ code: 200, data: { cost } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/bom/inventory/:inventoryId/breakdown - 获取原料成本分解
router.get('/inventory/:inventoryId/breakdown', auth_1.authenticate, async (req, res) => {
    try {
        const { quantity } = req.query;
        const qty = quantity ? parseFloat(quantity) : 1;
        const breakdown = await bomService.getInventoryCostBreakdown(req.params.inventoryId, qty);
        res.json({ code: 200, data: breakdown });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
//# sourceMappingURL=bom.js.map