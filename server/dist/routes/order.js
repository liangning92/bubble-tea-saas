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
exports.orderRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const storeHelper_1 = require("../utils/storeHelper");
const validation_1 = require("../utils/validation");
const OrderService = __importStar(require("../services/OrderService"));
const router = (0, express_1.Router)();
exports.orderRouter = router;
// Validation schema
const createOrderSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    channelId: zod_1.z.string().optional(),
    staffId: zod_1.z.string(),
    memberId: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string(),
        productName: zod_1.z.string(),
        specId: zod_1.z.string(),
        specName: zod_1.z.string(),
        quantity: zod_1.z.number().int().positive(),
        unitPrice: zod_1.z.number().int().min(0),
        addons: zod_1.z.array(zod_1.z.object({
            name: zod_1.z.string(),
            price: zod_1.z.number().int()
        })).optional().default([])
    })),
    discountAmount: zod_1.z.number().int().optional().default(0),
    pointsRedeemed: zod_1.z.number().int().optional().default(0),
    taxEnabled: zod_1.z.boolean().optional().default(true),
    paymentMethod: zod_1.z.enum(['cash', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'debit', 'card', 'member', 'bca_va', 'mandiri_va']),
    status: zod_1.z.enum(['completed', 'suspended']).optional().default('completed'),
    customerCount: zod_1.z.number().int().optional().default(1),
    dineInCount: zod_1.z.number().int().optional(),
    tableNumber: zod_1.z.string().optional(),
    platformOrderId: zod_1.z.string().optional(),
    orderNumber: zod_1.z.string().optional()
});
// GET /api/orders
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, status, paymentMethod, channelId, startDate, endDate, page, pageSize, date } = req.query;
        const result = await OrderService.getOrders({
            storeId: storeId,
            userId: req.user.id,
            userRole: req.user.role,
            status: status,
            paymentMethod: paymentMethod,
            channelId: channelId,
            startDate: startDate,
            endDate: endDate,
            date: date,
            page: parseInt(page) || 1,
            pageSize: parseInt(pageSize) || 20
        });
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get orders' });
    }
});
// GET /api/orders/refund-requests - 必须在 /:id 之前
router.get('/refund-requests', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { status } = req.query;
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const where = {};
        if (status && status !== 'all')
            where.status = status;
        const requests = await prisma.refundRequest.findMany({
            where,
            include: {
                order: {
                    include: { items: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        const filtered = requests.filter(r => r.order?.storeId === storeId);
        res.json({
            code: 200,
            data: { list: filtered },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get refund requests error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get refund requests' });
    }
});
// GET /api/orders/:id
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await OrderService.getOrderById(id);
        if (!order) {
            return res.status(404).json({ code: 404, message: 'Order not found' });
        }
        res.json({
            code: 200,
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get order' });
    }
});
// POST /api/orders
router.post('/', auth_1.authenticate, (0, validation_1.validateBody)(createOrderSchema), async (req, res) => {
    try {
        const order = await OrderService.createOrder(req.body);
        res.status(201).json({
            code: 201,
            message: 'Order created',
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create order error:', error);
        // Pass through the actual error message (e.g., "库存不足: 生珍珠 (可用: 500, 需要: 750)")
        const message = error?.message || 'Failed to create order';
        res.status(500).json({ code: 500, message });
    }
});
// POST /api/orders/bulk-sync - POS端离线订单批量同步
router.post('/bulk-sync', auth_1.authenticate, async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ code: 400, message: 'Invalid or empty orders array' });
        }
        const results = await OrderService.bulkCreateOrders(orders);
        res.json({
            code: 200,
            message: 'Bulk sync completed',
            data: { results },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Bulk sync error:', error);
        res.status(500).json({ code: 500, message: error?.message || 'Failed to process bulk sync' });
    }
});
// POST /api/orders/refund-request - POS端退款申请
router.post('/refund-request', auth_1.authenticate, async (req, res) => {
    try {
        const { orderId, reason, staffId } = req.body;
        if (!orderId || !reason) {
            return res.status(400).json({ code: 400, message: 'Missing orderId or reason' });
        }
        const result = await OrderService.createRefundRequest({
            orderId,
            reason,
            requestedBy: staffId || req.user.staffId || req.user.id
        });
        res.status(201).json({
            code: 201,
            message: 'Refund request submitted',
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Refund request error:', error);
        res.status(500).json({ code: 500, message: 'Failed to submit refund request' });
    }
});
// PUT /api/orders/:id/status
router.put('/:id/status', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const order = await OrderService.updateOrderStatus(id, status);
        res.json({
            code: 200,
            message: 'Order status updated',
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update order status' });
    }
});
// DELETE /api/orders/:id - Delete a suspended order (used when resuming order)
router.delete('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        // Only allow deleting suspended orders
        const order = await prisma.order.findUnique({ where: { id } });
        if (!order) {
            return res.status(404).json({ code: 404, message: 'Order not found' });
        }
        if (order.status !== 'suspended') {
            return res.status(400).json({ code: 400, message: 'Only suspended orders can be deleted' });
        }
        await prisma.order.delete({ where: { id } });
        res.json({
            code: 200,
            message: 'Order deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete order error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete order' });
    }
});
// POST /api/orders/:id/refund
router.post('/:id/refund', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const order = await OrderService.refundOrder(id, reason);
        res.json({
            code: 200,
            message: 'Order refunded',
            data: order,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Refund order error:', error);
        res.status(500).json({ code: 500, message: 'Failed to refund order' });
    }
});
// POST /api/orders/refund-requests/:id/approve - 批准退款
router.post('/refund-requests/:id/approve', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        const request = await prisma.refundRequest.findUnique({
            where: { id },
            include: { order: true }
        });
        if (!request) {
            return res.status(404).json({ code: 404, message: 'Refund request not found' });
        }
        // Validate refund amount does not exceed order total
        if (request.amount > request.order.totalAmount) {
            return res.status(400).json({
                code: 400,
                message: `Refund amount (${request.amount}) cannot exceed order total (${request.order.totalAmount})`
            });
        }
        // Validate refund amount is positive
        if (request.amount <= 0) {
            return res.status(400).json({
                code: 400,
                message: 'Refund amount must be greater than 0'
            });
        }
        // Update refund request status
        await prisma.refundRequest.update({
            where: { id },
            data: {
                status: 'approved',
                approvedBy: req.user.staffId || req.user.id,
                approvedAt: new Date(),
                note
            }
        });
        // Update order status to refunded
        await prisma.order.update({
            where: { id: request.orderId },
            data: { status: 'refunded' }
        });
        // Return inventory and reverse member points
        if (request.order) {
            await OrderService.refundOrder(request.orderId, note);
        }
        res.json({
            code: 200,
            message: 'Refund approved',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Approve refund error:', error);
        res.status(500).json({ code: 500, message: 'Failed to approve refund' });
    }
});
// POST /api/orders/refund-requests/:id/reject - 拒绝退款
router.post('/refund-requests/:id/reject', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        if (!note) {
            return res.status(400).json({ code: 400, message: 'Rejection reason is required' });
        }
        await prisma.refundRequest.update({
            where: { id },
            data: {
                status: 'rejected',
                approvedBy: req.user.staffId || req.user.id,
                approvedAt: new Date(),
                note
            }
        });
        res.json({
            code: 200,
            message: 'Refund rejected',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Reject refund error:', error);
        res.status(500).json({ code: 500, message: 'Failed to reject refund' });
    }
});
// GET /api/orders/kds/list - KDS orders for kitchen display
router.get('/kds/list', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'staff'), async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const orders = await OrderService.getKDSOrders(storeId, {
            status: req.query.status,
            limit: parseInt(req.query.limit) || 50
        });
        res.json({
            code: 200,
            data: { list: orders },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get KDS orders error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get KDS orders' });
    }
});
//# sourceMappingURL=order.js.map