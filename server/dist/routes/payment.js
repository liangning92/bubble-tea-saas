"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const PaymentService_1 = require("../services/PaymentService");
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.use((req, res, next) => {
    if (req.path === '/qris/webhook')
        return next();
    return (0, auth_1.authenticate)(req, res, next);
});
// Create QRIS payment
router.post('/qris/create', async (req, res) => {
    try {
        const schema = zod_1.z.object({ storeId: zod_1.z.string().min(1), orderId: zod_1.z.string().min(1).max(100), amount: zod_1.z.number().int().positive().max(1000000000) });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: 'Invalid payment request' });
        const { storeId, orderId, amount } = parsed.data;
        const authReq = req;
        if (!authReq.user || !(0, auth_1.canAccessStore)(authReq.user, storeId)) {
            return res.status(403).json({ error: 'Access denied: Store mismatch' });
        }
        const result = await (0, PaymentService_1.createQrisPayment)(storeId, orderId, amount);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({
            success: true,
            data: {
                qrString: result.qrString,
                qrImage: result.qrImage,
                externalId: result.externalId,
                expiresAt: result.expiresAt
            }
        });
    }
    catch (error) {
        console.error('Create QRIS error:', error);
        res.status(500).json({ error: error.message });
    }
});
// QRIS webhook from Xendit
router.post('/qris/webhook', async (req, res) => {
    try {
        const expectedToken = process.env.XENDIT_CALLBACK_TOKEN || '';
        const suppliedToken = req.get('x-callback-token') || '';
        if (!expectedToken)
            return res.status(503).json({ error: 'Payment webhook is not configured' });
        if (Buffer.byteLength(expectedToken) !== Buffer.byteLength(suppliedToken) ||
            !(0, crypto_1.timingSafeEqual)(Buffer.from(expectedToken), Buffer.from(suppliedToken))) {
            return res.status(401).json({ error: 'Invalid webhook token' });
        }
        const payload = req.body;
        const parsed = zod_1.z.object({
            external_id: zod_1.z.string().min(1).max(200),
            status: zod_1.z.string().min(1).max(40),
            amount: zod_1.z.number().optional(),
            paid_at: zod_1.z.string().optional()
        }).safeParse(payload);
        if (!parsed.success)
            return res.status(400).json({ error: 'Invalid webhook payload' });
        const result = await (0, PaymentService_1.handleQrisWebhook)(parsed.data);
        if (result.success) {
            res.json({ success: true });
        }
        else {
            res.status(404).json({ success: false, error: 'Payment not found' });
        }
    }
    catch (error) {
        console.error('QRIS webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get QRIS payment status
router.get('/qris/status/:externalId', async (req, res) => {
    try {
        const { externalId } = req.params;
        const status = await (0, PaymentService_1.getQrisPaymentStatus)(externalId);
        if (status.storeId && (!req.user || !(0, auth_1.canAccessStore)(req.user, status.storeId))) {
            return res.status(403).json({ error: 'Access denied: Store mismatch' });
        }
        res.json(status);
    }
    catch (error) {
        console.error('Get QRIS status error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=payment.js.map