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
exports.materialRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const zod_1 = require("zod");
const materialService = __importStar(require("../services/MaterialService"));
const router = (0, express_1.Router)();
exports.materialRouter = router;
// 原料类型
router.get('/types', auth_1.authenticate, async (req, res) => {
    res.json({
        code: 200,
        data: {
            types: materialService.INVENTORY_TYPES,
            labels: materialService.INVENTORY_TYPE_LABELS,
            categories: materialService.INVENTORY_CATEGORIES
        }
    });
});
// 获取原料列表
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { type } = req.query;
        const storeId = req.user.storeId;
        const list = await materialService.getInventoryList(storeId, type);
        res.json({ code: 200, data: { list } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 获取单个原料详情
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const item = await materialService.getInventoryDetail(req.params.id);
        if (!item)
            return res.status(404).json({ code: 404, message: 'Not found' });
        res.json({ code: 200, data: item });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 创建原料
const createSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string(),
    category: zod_1.z.string(),
    type: zod_1.z.string().optional(),
    unit: zod_1.z.string(),
    avgCost: zod_1.z.number().optional(),
    concentrateRatio: zod_1.z.number().optional(),
    safetyStock: zod_1.z.number().optional(),
    minStock: zod_1.z.number().optional(),
    maxStock: zod_1.z.number().optional(),
    shelfLife: zod_1.z.number().optional(),
    processRecipeId: zod_1.z.string().optional()
});
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createSchema), async (req, res) => {
    try {
        const item = await materialService.createInventory(req.body);
        res.status(201).json({ code: 201, data: item });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 更新原料
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const item = await materialService.updateInventory(req.params.id, req.body);
        res.json({ code: 200, data: item });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 库存预警
router.get('/alerts/low-stock', auth_1.authenticate, async (req, res) => {
    try {
        const alerts = await materialService.checkLowStockAlerts(req.user.storeId);
        res.json({ code: 200, data: alerts });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 过期预警
router.get('/alerts/expiry', auth_1.authenticate, async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days) : 7;
        const alerts = await materialService.checkExpiryAlerts(req.user.storeId, days);
        res.json({ code: 200, data: alerts });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 补货建议
router.get('/suggestions/restock', auth_1.authenticate, async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days) : 7;
        const suggestions = await materialService.calculateRestockSuggestions(req.user.storeId, days);
        res.json({ code: 200, data: suggestions });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 执行加工
router.post('/process/:recipeId/execute', auth_1.authenticate, async (req, res) => {
    try {
        const { multiplier, note } = req.body;
        const staffId = req.user.staffId || '';
        const result = await materialService.executeProcessing(req.params.recipeId, staffId, multiplier, note);
        res.json({ code: 200, data: result });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 加工历史
router.get('/process/history', auth_1.authenticate, async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const history = await materialService.getProcessingHistory(req.user.storeId, limit);
        res.json({ code: 200, data: history });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// 加工日志详情
router.get('/process/:id', auth_1.authenticate, async (req, res) => {
    try {
        const log = await materialService.getProcessingLogDetail(req.params.id);
        if (!log)
            return res.status(404).json({ code: 404, message: 'Not found' });
        res.json({ code: 200, data: log });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
//# sourceMappingURL=material.js.map