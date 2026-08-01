"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const PaymentService_1 = require("../services/PaymentService");
const router = (0, express_1.Router)();
// Create QRIS payment
router.post('/qris/create', async (req, res) => {
    try {
        const { storeId, orderId, amount } = req.body;
        if (!storeId || !orderId || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
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
        const payload = req.body;
        const result = await (0, PaymentService_1.handleQrisWebhook)({
            external_id: payload.external_id,
            status: payload.status,
            amount: payload.amount,
            paid_at: payload.paid_at
        });
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
        res.json(status);
    }
    catch (error) {
        console.error('Get QRIS status error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=payment.js.map