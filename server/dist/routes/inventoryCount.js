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
exports.inventoryCountRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const InventoryCountService = __importStar(require("../services/InventoryCountService"));
const router = (0, express_1.Router)();
exports.inventoryCountRouter = router;
const createSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    period: zod_1.z.enum(['monthly', 'quarterly', 'annual']),
    startDate: zod_1.z.string(),
    endDate: zod_1.z.string(),
    notes: zod_1.z.string().optional()
});
const updateItemSchema = zod_1.z.object({
    countedQty: zod_1.z.number().min(0),
    countedBy: zod_1.z.string(),
    note: zod_1.z.string().optional()
});
// GET /api/inventory-counts
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const counts = await InventoryCountService.getInventoryCounts(storeId);
        res.json({ code: 200, data: { list: counts }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get inventory counts error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get inventory counts' });
    }
});
// GET /api/inventory-counts/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const count = await InventoryCountService.getInventoryCountById(req.params.id);
        if (!count)
            return res.status(404).json({ code: 404, message: 'Inventory count not found' });
        res.json({ code: 200, data: count, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get inventory count error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get inventory count' });
    }
});
// POST /api/inventory-counts
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createSchema), async (req, res) => {
    try {
        const count = await InventoryCountService.createInventoryCount({
            ...req.body,
            startDate: new Date(req.body.startDate),
            endDate: new Date(req.body.endDate)
        });
        res.status(201).json({ code: 201, message: 'Inventory count created', data: count, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create inventory count error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create inventory count' });
    }
});
// PUT /api/inventory-counts/:id/item/:itemId
router.put('/:id/item/:itemId', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'staff'), (0, validation_1.validateBody)(updateItemSchema), async (req, res) => {
    try {
        const item = await InventoryCountService.updateCountItem(req.params.itemId, req.body.countedQty, req.body.countedBy, req.body.note);
        res.json({ code: 200, message: 'Count item updated', data: item, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update count item error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update count item' });
    }
});
// POST /api/inventory-counts/:id/complete
router.post('/:id/complete', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const count = await InventoryCountService.completeInventoryCount(req.params.id, req.user.staffId || '');
        res.json({ code: 200, message: 'Inventory count completed', data: count, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Complete inventory count error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to complete inventory count' });
    }
});
// POST /api/inventory-counts/:id/cancel
router.post('/:id/cancel', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const count = await InventoryCountService.cancelInventoryCount(req.params.id);
        res.json({ code: 200, message: 'Inventory count cancelled', data: count, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Cancel inventory count error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to cancel inventory count' });
    }
});
//# sourceMappingURL=inventoryCount.js.map