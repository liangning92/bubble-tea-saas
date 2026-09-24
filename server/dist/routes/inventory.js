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
exports.inventoryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const storeHelper_1 = require("../utils/storeHelper");
const validation_1 = require("../utils/validation");
const InventoryService = __importStar(require("../services/InventoryService"));
const InventoryAlertConfigService_1 = require("../services/InventoryAlertConfigService");
const router = (0, express_1.Router)();
exports.inventoryRouter = router;
// Validation schemas
const stockInSchema = zod_1.z.object({
    inventoryId: zod_1.z.string(),
    storeId: zod_1.z.string(),
    quantity: zod_1.z.number().positive(),
    unitCost: zod_1.z.number().int().optional(),
    note: zod_1.z.string().optional(),
    staffId: zod_1.z.string().optional(),
    supplierId: zod_1.z.string().optional()
});
const stockOutSchema = zod_1.z.object({
    inventoryId: zod_1.z.string(),
    storeId: zod_1.z.string(),
    quantity: zod_1.z.number().positive(),
    reason: zod_1.z.enum(['sold', 'loss', 'adjust', 'expired', 'transfer']),
    note: zod_1.z.string().optional(),
    staffId: zod_1.z.string().optional(),
    orderId: zod_1.z.string().optional()
});
const adjustSchema = zod_1.z.object({
    newStock: zod_1.z.number().min(0),
    reason: zod_1.z.string(),
    staffId: zod_1.z.string().optional()
});
const createInventorySchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1),
    category: zod_1.z.string(),
    unit: zod_1.z.string(),
    currentStock: zod_1.z.number().int().optional(),
    avgCost: zod_1.z.number().int().optional(),
    minStock: zod_1.z.number().optional(),
    maxStock: zod_1.z.number().optional(),
    safetyStock: zod_1.z.number().optional(),
    shelfLife: zod_1.z.number().int().optional(),
    concentrateRatio: zod_1.z.number().optional()
});
const updateInventorySchema = createInventorySchema.partial();
// GET /api/inventory
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, categoryId, search, lowStock } = req.query;
        const items = await InventoryService.getInventory({
            storeId: storeId || req.user.storeId,
            categoryId: categoryId,
            search: search,
            lowStock: lowStock === 'true'
        });
        res.json({
            code: 200,
            data: { list: items },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get inventory' });
    }
});
// GET /api/inventory/logs - Get all inventory logs (combined stock-in, stock-out, and adjustments)
router.get('/logs', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const inventoryId = req.query.inventoryId;
        const type = req.query.type;
        let logs = [];
        if (!type || type === 'stock_in') {
            const stockInLogs = await InventoryService.getStockInLogs(storeId, inventoryId);
            logs = logs.concat(stockInLogs.map((l) => ({ ...l, type: 'stock_in' })));
        }
        if (!type || type === 'stock_out') {
            const stockOutLogs = await InventoryService.getStockOutLogs(storeId, inventoryId);
            logs = logs.concat(stockOutLogs.map((l) => ({ ...l, type: 'stock_out' })));
        }
        logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.json({
            code: 200,
            data: { list: logs },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get inventory logs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get inventory logs' });
    }
});
// GET /api/inventory/:id
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const item = await InventoryService.getInventoryById(id);
        if (!item) {
            return res.status(404).json({ code: 404, message: 'Inventory not found' });
        }
        res.json({
            code: 200,
            data: item,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get inventory item error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get inventory item' });
    }
});
// POST /api/inventory/stock-in
router.post('/stock-in', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'staff'), (0, validation_1.validateBody)(stockInSchema), async (req, res) => {
    try {
        const item = await InventoryService.stockIn({
            ...req.body,
            staffId: req.body.staffId || req.user.staffId
        });
        res.status(201).json({
            code: 201,
            message: 'Stock in successful',
            data: item,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Stock in error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to stock in' });
    }
});
// POST /api/inventory/stock-out
router.post('/stock-out', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'staff'), (0, validation_1.validateBody)(stockOutSchema), async (req, res) => {
    try {
        const item = await InventoryService.stockOut({
            ...req.body,
            staffId: req.body.staffId || req.user.staffId
        });
        res.json({
            code: 200,
            message: 'Stock out successful',
            data: item,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Stock out error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to stock out' });
    }
});
// PUT /api/inventory/:id/adjust
router.put('/:id/adjust', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(adjustSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const item = await InventoryService.adjustInventory(id, req.body.newStock, req.body.reason, req.body.staffId || req.user.staffId);
        res.json({
            code: 200,
            message: 'Inventory adjusted',
            data: item,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Adjust inventory error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to adjust inventory' });
    }
});
// GET /api/inventory/alerts/low-stock
router.get('/alerts/low-stock', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const alerts = await InventoryService.getLowStockAlerts(storeId);
        res.json({
            code: 200,
            data: { list: alerts },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get low stock alerts error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get low stock alerts' });
    }
});
// GET /api/inventory/stats
router.get('/stats/summary', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const stats = await InventoryService.getInventoryStats(storeId);
        res.json({
            code: 200,
            data: stats,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get inventory stats error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get inventory stats' });
    }
});
// GET /api/inventory/logs/stock-in
router.get('/logs/stock-in', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const inventoryId = req.query.inventoryId;
        const logs = await InventoryService.getStockInLogs(storeId, inventoryId);
        res.json({
            code: 200,
            data: { list: logs },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get stock in logs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get stock in logs' });
    }
});
// GET /api/inventory/logs/stock-out
router.get('/logs/stock-out', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const inventoryId = req.query.inventoryId;
        const logs = await InventoryService.getStockOutLogs(storeId, inventoryId);
        res.json({
            code: 200,
            data: { list: logs },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get stock out logs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get stock out logs' });
    }
});
// POST /api/inventory
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createInventorySchema), async (req, res) => {
    try {
        const item = await InventoryService.createInventory(req.body);
        res.status(201).json({
            code: 201,
            message: 'Inventory created',
            data: item,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create inventory error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create inventory' });
    }
});
// PUT /api/inventory/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(updateInventorySchema), async (req, res) => {
    try {
        const { id } = req.params;
        const item = await InventoryService.updateInventory(id, req.body);
        res.json({
            code: 200,
            message: 'Inventory updated',
            data: item,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update inventory error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update inventory' });
    }
});
// DELETE /api/inventory/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await InventoryService.deleteInventory(id);
        res.json({
            code: 200,
            message: 'Inventory deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete inventory error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete inventory' });
    }
});
// GET /api/inventory/batches
router.get('/batches', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const inventoryId = req.query.inventoryId;
        const batches = await InventoryService.getBatches(storeId, inventoryId);
        res.json({ code: 200, data: { list: batches }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get batches error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get batches' });
    }
});
// GET /api/inventory/batches/expiring
router.get('/batches/expiring', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const days = parseInt(req.query.days) || 7;
        const batches = await InventoryService.getExpiringBatches(storeId, days);
        res.json({ code: 200, data: { list: batches }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get expiring batches error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get expiring batches' });
    }
});
// ============================================
// 库存异常预警 - 理论消耗 vs 实际消耗对比
// ============================================
// GET /api/inventory/consumption-analysis
router.get('/consumption-analysis', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate, varianceThreshold, category } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ code: 400, message: 'startDate and endDate are required' });
        }
        const analysis = await InventoryService.getConsumptionAnalysis({
            storeId,
            startDate: startDate,
            endDate: endDate,
            varianceThreshold: varianceThreshold ? parseFloat(varianceThreshold) : 10,
            category: category
        });
        res.json({
            code: 200,
            data: { list: analysis },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get consumption analysis error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get consumption analysis' });
    }
});
// GET /api/inventory/anomaly-summary
router.get('/anomaly-summary', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate, varianceThreshold, category } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ code: 400, message: 'startDate and endDate are required' });
        }
        const summary = await InventoryService.getAnomalySummary({
            storeId,
            startDate: startDate,
            endDate: endDate,
            varianceThreshold: varianceThreshold ? parseFloat(varianceThreshold) : 10,
            category: category
        });
        res.json({
            code: 200,
            data: summary,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get anomaly summary error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get anomaly summary' });
    }
});
// GET /api/inventory/alert-config
router.get('/alert-config', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const config = await (0, InventoryAlertConfigService_1.getInventoryAlertConfig)(storeId);
        res.json({
            code: 200,
            data: config,
            defaults: InventoryAlertConfigService_1.DEFAULT_INVENTORY_ALERT_CONFIG,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get inventory alert config error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get inventory alert config' });
    }
});
// PUT /api/inventory/alert-config
router.put('/alert-config', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const configData = req.body;
        const config = await (0, InventoryAlertConfigService_1.saveInventoryAlertConfig)(storeId, configData);
        res.json({
            code: 200,
            message: 'Inventory alert config saved',
            data: config,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Save inventory alert config error:', error);
        res.status(500).json({ code: 500, message: 'Failed to save inventory alert config' });
    }
});
//# sourceMappingURL=inventory.js.map