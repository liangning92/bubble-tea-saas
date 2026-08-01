"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceQRRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const database_1 = require("../config/database");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
exports.attendanceQRRouter = router;
// QR Code secret key - in production, this should be in environment variables
const QR_SECRET = process.env.QR_SECRET || 'bubble-tea-attendance-secret-key-2024';
const QR_VALID_MINUTES = 5; // QR code valid for 5 minutes
// Generate QR code payload for POS
router.post('/generate', auth_1.authenticate, async (req, res) => {
    try {
        const { posId } = req.body;
        if (!posId) {
            return res.status(400).json({ code: 400, message: 'POS ID is required' });
        }
        // Get store info
        const store = await database_1.prisma.store.findFirst({
            where: { id: req.user.storeId }
        });
        if (!store) {
            return res.status(404).json({ code: 404, message: 'Store not found' });
        }
        // Generate timestamp (current minute floored)
        const timestamp = Math.floor(Date.now() / (QR_VALID_MINUTES * 60 * 1000)) * (QR_VALID_MINUTES * 60 * 1000);
        // Create signature: HMAC-SHA256(storeId + posId + timestamp)
        const dataToSign = `${req.user.storeId}:${posId}:${timestamp}`;
        const signature = crypto_1.default
            .createHmac('sha256', QR_SECRET)
            .update(dataToSign)
            .digest('hex')
            .substring(0, 16);
        // QR payload - simple format for easy scanning
        const qrPayload = {
            s: req.user.storeId, // storeId
            p: posId, // posId
            t: timestamp, // timestamp
            sig: signature // signature
        };
        // Encode as JSON string then base64
        const qrData = Buffer.from(JSON.stringify(qrPayload)).toString('base64');
        res.json({
            code: 200,
            data: {
                qrData,
                storeName: store.name,
                posId,
                expiresAt: timestamp + QR_VALID_MINUTES * 60 * 1000,
                refreshInterval: QR_VALID_MINUTES * 60 * 1000
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({ code: 500, message: 'Failed to generate QR code' });
    }
});
// Verify QR code and check in
router.post('/verify', auth_1.authenticate, async (req, res) => {
    try {
        const { qrData, type } = req.body;
        if (!qrData) {
            return res.status(400).json({ code: 400, message: 'QR data is required' });
        }
        // Decode QR data
        let payload;
        try {
            payload = JSON.parse(Buffer.from(qrData, 'base64').toString('utf8'));
        }
        catch {
            return res.status(400).json({ code: 400, message: 'Invalid QR code format' });
        }
        const { s: storeId, p: posId, t: timestamp, sig: providedSignature } = payload;
        // Verify timestamp is within valid range (5 minutes window)
        const now = Date.now();
        const qrTimestamp = Number(timestamp);
        if (isNaN(qrTimestamp)) {
            return res.status(400).json({ code: 400, message: 'Invalid QR timestamp' });
        }
        const timeDiff = Math.abs(now - qrTimestamp);
        const maxValidTime = QR_VALID_MINUTES * 60 * 1000;
        if (timeDiff > maxValidTime) {
            return res.status(400).json({
                code: 400,
                message: 'QR code expired. Please scan the new QR code on the POS.',
                expired: true
            });
        }
        // Verify signature
        const dataToSign = `${storeId}:${posId}:${qrTimestamp}`;
        const expectedSignature = crypto_1.default
            .createHmac('sha256', QR_SECRET)
            .update(dataToSign)
            .digest('hex')
            .substring(0, 16);
        if (providedSignature !== expectedSignature) {
            return res.status(400).json({
                code: 400,
                message: 'Invalid QR code. Please scan the current QR from the POS.',
                invalid: true
            });
        }
        // Verify store matches
        if (storeId !== req.user.storeId) {
            return res.status(400).json({
                code: 400,
                message: 'QR code is not for this store'
            });
        }
        // Get store info for response
        const store = await database_1.prisma.store.findFirst({
            where: { id: storeId }
        });
        // Find staff
        const staff = await database_1.prisma.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const nowDate = new Date();
        if (type === 'check_in') {
            // Check if already checked in today
            const startOfDay = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 23, 59, 59, 999);
            const existing = await database_1.prisma.attendance.findFirst({
                where: {
                    staffId: staff.id,
                    checkInTime: { gte: startOfDay }
                }
            });
            if (existing) {
                return res.status(400).json({ code: 400, message: 'Already checked in today' });
            }
            // Determine if late (after 9:30 AM)
            let status = 'normal';
            const hour = nowDate.getHours();
            if (hour > 9 || (hour === 9 && nowDate.getMinutes() > 30)) {
                status = 'late';
            }
            const attendance = await database_1.prisma.attendance.create({
                data: {
                    staffId: staff.id,
                    checkInTime: nowDate,
                    status,
                    gpsLocation: `POS:${posId}`, // Mark as QR-based check-in with POS ID
                    note: `QR Check-in at POS ${posId}`
                }
            });
            res.status(201).json({
                code: 201,
                data: {
                    ...attendance,
                    storeName: store?.name,
                    posId,
                    checkInMethod: 'qr'
                },
                timestamp: new Date().toISOString()
            });
        }
        else if (type === 'check_out') {
            if (!req.body.attendanceId) {
                return res.status(400).json({ code: 400, message: 'Attendance ID is required for check-out' });
            }
            const attendance = await database_1.prisma.attendance.findFirst({
                where: {
                    id: req.body.attendanceId,
                    staffId: staff.id,
                    checkOutTime: null
                }
            });
            if (!attendance) {
                return res.status(404).json({ code: 404, message: 'No active check-in found' });
            }
            const updated = await database_1.prisma.attendance.update({
                where: { id: attendance.id },
                data: {
                    checkOutTime: nowDate,
                    gpsLocation: `POS:${posId}`,
                    note: `QR Check-out at POS ${posId}`
                }
            });
            res.json({
                code: 200,
                data: {
                    ...updated,
                    storeName: store?.name,
                    posId,
                    checkOutMethod: 'qr'
                },
                timestamp: new Date().toISOString()
            });
        }
        else {
            // Just verify without action - return store info
            res.json({
                code: 200,
                data: {
                    valid: true,
                    storeName: store?.name,
                    storeId,
                    posId,
                    timestamp: new Date(qrTimestamp).toISOString()
                },
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        console.error('Verify QR error:', error);
        res.status(500).json({ code: 500, message: 'Failed to verify QR code' });
    }
});
//# sourceMappingURL=attendanceQR.js.map