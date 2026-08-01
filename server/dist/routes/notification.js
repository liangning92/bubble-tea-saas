"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
exports.notificationRouter = router;
// GET /api/notifications
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        const { type, status, limit = 50 } = req.query;
        const where = { storeId };
        if (type)
            where.type = type;
        if (status)
            where.status = status;
        const notifications = await database_1.default.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            include: { member: { select: { name: true, phone: true } } }
        });
        res.json({ code: 200, data: { list: notifications }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get notifications' });
    }
});
// POST /api/notifications - Create a new notification
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const { type, title, message, memberId, storeId } = req.body;
        const finalStoreId = storeId || req.user.storeId;
        const notification = await database_1.default.notification.create({
            data: {
                type: type || 'promotion',
                title,
                message,
                memberId,
                storeId: finalStoreId,
                status: 'unread'
            }
        });
        res.status(201).json({ code: 201, message: 'Notification created', data: notification, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create notification error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create notification' });
    }
});
// PUT /api/notifications/:id/read
router.put('/:id/read', auth_1.authenticate, async (req, res) => {
    try {
        const notification = await database_1.default.notification.update({
            where: { id: req.params.id },
            data: { status: 'read', readAt: new Date() }
        });
        res.json({ code: 200, message: 'Notification marked as read', data: notification, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ code: 500, message: 'Failed to mark notification as read' });
    }
});
// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        await database_1.default.notification.updateMany({
            where: { storeId, status: 'unread' },
            data: { status: 'read', readAt: new Date() }
        });
        res.json({ code: 200, message: 'All notifications marked as read', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ code: 500, message: 'Failed to mark all notifications as read' });
    }
});
//# sourceMappingURL=notification.js.map