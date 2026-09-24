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
exports.purchaseOrderRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const storeHelper_1 = require("../utils/storeHelper");
const validation_1 = require("../utils/validation");
const PurchaseOrderService = __importStar(require("../services/PurchaseOrderService"));
const router = (0, express_1.Router)();
exports.purchaseOrderRouter = router;
// Validation schemas
const createPOSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    supplierId: zod_1.z.string(),
    expectedDate: zod_1.z.string().optional(),
    note: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        inventoryId: zod_1.z.string(),
        quantity: zod_1.z.number().positive(),
        unitCost: zod_1.z.number().int().positive()
    })).min(1)
});
// GET /api/purchase-orders
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { storeId, supplierId, status, startDate, endDate } = req.query;
        const orders = await PurchaseOrderService.getPurchaseOrders({
            storeId: storeId || req.user.storeId,
            supplierId: supplierId,
            status: status,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({
            code: 200,
            data: { list: orders },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get purchase orders error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get purchase orders' });
    }
});
// GET /api/purchase-orders/pending
router.get('/pending', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const orders = await PurchaseOrderService.getPendingPurchaseOrders(storeId);
        res.json({
            code: 200,
            data: { list: orders },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get pending purchase orders error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get pending purchase orders' });
    }
});
// GET /api/purchase-orders/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const order = await PurchaseOrderService.getPurchaseOrderById(id);
        if (!order) {
            return res.status(404).json({ code: 404, message: 'Purchase order not found' });
        }
        res.json({
            code: 200,
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get purchase order error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get purchase order' });
    }
});
// POST /api/purchase-orders
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createPOSchema), async (req, res) => {
    try {
        const order = await PurchaseOrderService.createPurchaseOrder({
            ...req.body,
            expectedDate: req.body.expectedDate ? new Date(req.body.expectedDate) : undefined
        });
        res.status(201).json({
            code: 201,
            message: 'Purchase order created',
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create purchase order error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create purchase order' });
    }
});
// PUT /api/purchase-orders/:id/status
router.put('/:id/status', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const order = await PurchaseOrderService.updatePurchaseOrderStatus(id, status);
        res.json({
            code: 200,
            message: 'Purchase order status updated',
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update purchase order status error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update purchase order status' });
    }
});
// POST /api/purchase-orders/:id/receive
router.post('/:id/receive', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const order = await PurchaseOrderService.receivePurchaseOrder(id, req.user.staffId);
        res.json({
            code: 200,
            message: 'Purchase order received and inventory updated',
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Receive purchase order error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to receive purchase order' });
    }
});
// DELETE /api/purchase-orders/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const order = await PurchaseOrderService.cancelPurchaseOrder(id, reason || 'Cancelled by admin');
        res.json({
            code: 200,
            message: 'Purchase order cancelled',
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Cancel purchase order error:', error);
        res.status(500).json({ code: 500, message: 'Failed to cancel purchase order' });
    }
});
//# sourceMappingURL=purchaseOrder.js.map