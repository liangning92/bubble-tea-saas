"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailablePayments = getAvailablePayments;
exports.createPayment = createPayment;
exports.simulatePaymentCallback = simulatePaymentCallback;
exports.getPaymentStatus = getPaymentStatus;
exports.calculatePaymentFee = calculatePaymentFee;
exports.getPaymentSummary = getPaymentSummary;
exports.createQrisPayment = createQrisPayment;
exports.handleQrisWebhook = handleQrisWebhook;
exports.getQrisPaymentStatus = getQrisPaymentStatus;
const database_1 = __importDefault(require("../config/database"));
// Get available payment methods for a store
async function getAvailablePayments(storeId) {
    const payments = await database_1.default.config.findMany({
        where: {
            storeId,
            category: 'payment'
        }
    });
    const defaultPayments = [
        { code: 'cash', name: 'Tunai', icon: 'cash', fee: 0 },
        { code: 'gopay', name: 'GoPay', icon: 'gopay', fee: 2.5 },
        { code: 'ovo', name: 'OVO', icon: 'ovo', fee: 2.5 },
        { code: 'dana', name: 'DANA', icon: 'dana', fee: 2.0 },
        { code: 'shopeepay', name: 'ShopeePay', icon: 'sp', fee: 2.0 }
    ];
    // Merge with store-specific configs
    return defaultPayments.map(p => {
        const config = payments.find(pp => pp.key === `payment_${p.code}`);
        return {
            ...p,
            enabled: config ? JSON.parse(config.value).isActive : true,
            customFee: config ? JSON.parse(config.value).feeRate : p.fee
        };
    });
}
// Create payment (mock implementation - simulates QR code generation)
async function createPayment(data) {
    const { orderId, method, amount } = data;
    // Get order
    const order = await database_1.default.order.findUnique({
        where: { id: orderId }
    });
    if (!order) {
        return {
            success: false,
            status: 'error',
            message: 'Order not found'
        };
    }
    // Create payment record
    const payment = await database_1.default.config.create({
        data: {
            storeId: order.storeId,
            category: 'payment_transactions',
            key: `payment_${Date.now()}`,
            value: JSON.stringify({
                orderId,
                method,
                amount,
                status: 'pending',
                createdAt: new Date()
            })
        }
    });
    // Mock QR code generation for e-wallets
    if (method !== 'cash' && method !== 'member') {
        // Generate mock QR code (in production, this would call payment provider API)
        const qrCode = generateMockQRCode(orderId, method, amount);
        return {
            success: true,
            paymentId: payment.id,
            qrCode,
            deeplink: getDeeplink(method),
            status: 'pending',
            message: `${method.toUpperCase()} payment ready`
        };
    }
    // Cash payment - instant success
    return {
        success: true,
        paymentId: payment.id,
        status: 'completed',
        message: 'Cash payment confirmed'
    };
}
// Simulate payment callback (in production, this comes from payment provider)
async function simulatePaymentCallback(paymentId, status) {
    const payment = await database_1.default.config.findFirst({
        where: { id: paymentId }
    });
    if (!payment) {
        throw new Error('Payment not found');
    }
    const paymentData = JSON.parse(payment.value);
    // Update payment status
    await database_1.default.config.update({
        where: { id: paymentId },
        data: {
            key: payment.key,
            value: JSON.stringify({
                ...paymentData,
                status: status === 'success' ? 'completed' : 'failed',
                completedAt: new Date()
            })
        }
    });
    // If success, update order status
    if (status === 'success') {
        await database_1.default.order.update({
            where: { id: paymentData.orderId },
            data: { status: 'completed' }
        });
    }
    return { success: status === 'success' };
}
// Get payment status
async function getPaymentStatus(paymentId) {
    const payment = await database_1.default.config.findFirst({
        where: { id: paymentId }
    });
    if (!payment) {
        return { status: 'not_found' };
    }
    const paymentData = JSON.parse(payment.value);
    return {
        paymentId: payment.id,
        orderId: paymentData.orderId,
        method: paymentData.method,
        amount: paymentData.amount,
        status: paymentData.status,
        createdAt: paymentData.createdAt,
        completedAt: paymentData.completedAt
    };
}
// Generate mock QR code (base64 placeholder)
function generateMockQRCode(orderId, method, amount) {
    // In production, this would call the actual payment provider's API
    // For now, return a placeholder QR code
    const mockData = `${method.toUpperCase()}|${orderId}|${amount}`;
    return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
}
// Get deeplink for e-wallet apps
function getDeeplink(method) {
    const deeplinks = {
        gopay: 'gojek://pay',
        ovo: 'ovo://pay',
        dana: 'dana://pay',
        shopeepay: 'shopeepay://pay'
    };
    return deeplinks[method] || '';
}
// Calculate payment fee
function calculatePaymentFee(amount, method) {
    const feeRates = {
        cash: 0,
        member: 0,
        gopay: 0.025,
        ovo: 0.025,
        dana: 0.02,
        shopeepay: 0.02,
        bca_va: 4500,
        mandiri_va: 4500
    };
    const rate = feeRates[method] || 0;
    if (rate < 1) {
        // Percentage fee
        return Math.round(amount * rate);
    }
    else {
        // Fixed fee
        return rate;
    }
}
// Get daily payment summary
async function getPaymentSummary(storeId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            createdAt: { gte: startOfDay, lte: endOfDay },
            status: { not: 'refunded' }
        }
    });
    const summary = {};
    orders.forEach(order => {
        if (!summary[order.paymentMethod]) {
            summary[order.paymentMethod] = { count: 0, amount: 0 };
        }
        summary[order.paymentMethod].count++;
        summary[order.paymentMethod].amount += order.finalAmount;
    });
    return {
        date: date.toISOString().slice(0, 10),
        totalOrders: orders.length,
        totalAmount: orders.reduce((sum, o) => sum + o.finalAmount, 0),
        byMethod: summary
    };
}
async function getXenditConfig(storeId) {
    const config = await database_1.default.config.findUnique({
        where: { storeId_key: { storeId, key: 'api.apiSettings' } }
    });
    if (!config)
        return null;
    const settings = JSON.parse(config.value);
    return {
        apiKey: settings.xenditApiKey,
        enabled: settings.xenditEnabled
    };
}
async function createQrisPayment(storeId, orderId, amount) {
    const xenditConfig = await getXenditConfig(storeId);
    if (!xenditConfig || !xenditConfig.enabled) {
        return { success: false, error: 'Xendit QRIS not enabled' };
    }
    const externalId = `QRIS-${orderId}-${Date.now()}`;
    const apiBaseUrl = process.env.API_BASE_URL;
    if (!apiBaseUrl) {
        return { success: false, error: 'API_BASE_URL environment variable not configured' };
    }
    const callbackUrl = `${apiBaseUrl}/api/payments/qris/webhook`;
    try {
        const response = await fetch('https://api.xendit.co/qr_codes', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(xenditConfig.apiKey + ':').toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                external_id: externalId,
                type: 'DYNAMIC',
                amount: amount,
                currency: 'IDR',
                callback_url: callbackUrl
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            return { success: false, error: errorData.message || 'Failed to create QRIS' };
        }
        const data = await response.json();
        // Save to database
        await database_1.default.qrisPayment.create({
            data: {
                storeId,
                externalId: data.external_id,
                xenditId: data.id,
                amount,
                status: 'pending',
                qrString: data.qr_string,
                qrImage: data.qr_image,
                expiresAt: data.expires_at ? new Date(data.expires_at) : null
            }
        });
        return {
            success: true,
            qrString: data.qr_string,
            qrImage: data.qr_image,
            externalId: data.external_id,
            expiresAt: data.expires_at
        };
    }
    catch (error) {
        console.error('Xendit QRIS error:', error);
        return { success: false, error: error.message || 'Network error' };
    }
}
async function handleQrisWebhook(payload) {
    const { external_id, status } = payload;
    // Find payment by external_id
    const qrisPayment = await database_1.default.qrisPayment.findUnique({
        where: { externalId: external_id }
    });
    if (!qrisPayment) {
        console.error('QRIS payment not found:', external_id);
        return { success: false };
    }
    // Update status
    const newStatus = status === 'PAID' ? 'completed' : status === 'EXPIRED' ? 'expired' : 'failed';
    await database_1.default.qrisPayment.update({
        where: { id: qrisPayment.id },
        data: {
            status: newStatus,
            callbackData: JSON.stringify(payload)
        }
    });
    // Extract orderId from external_id (format: QRIS-{orderId}-{timestamp})
    const orderIdMatch = external_id.match(/^QRIS-(.+?)-\d+$/);
    const orderId = orderIdMatch ? orderIdMatch[1] : qrisPayment.orderId;
    // Update order status to completed if payment is successful
    if (newStatus === 'completed' && orderId) {
        await database_1.default.order.update({
            where: { id: orderId },
            data: { status: 'completed' }
        }).catch(err => {
            console.error('Failed to update order status:', err);
        });
    }
    return { success: true, orderId };
}
async function getQrisPaymentStatus(externalId) {
    const payment = await database_1.default.qrisPayment.findUnique({
        where: { externalId }
    });
    if (!payment) {
        return { status: 'not_found' };
    }
    return {
        status: payment.status,
        amount: payment.amount,
        qrString: payment.qrString,
        qrImage: payment.qrImage,
        createdAt: payment.createdAt,
        expiresAt: payment.expiresAt
    };
}
//# sourceMappingURL=PaymentService.js.map