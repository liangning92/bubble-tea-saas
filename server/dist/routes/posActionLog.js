"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.posActionLogRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const POSActionLogService_1 = require("../services/POSActionLogService");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
exports.posActionLogRouter = router;
const logActionSchema = zod_1.z.object({
    action: zod_1.z.string(),
    sessionId: zod_1.z.string(),
    entityId: zod_1.z.string().optional(),
    description: zod_1.z.string(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
    severity: zod_1.z.enum(['info', 'warning', 'critical']).optional(),
});
// POST /api/pos-action-logs - Log a POS action
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const { action, sessionId, entityId, description, metadata, severity } = req.body;
        if (!action || !sessionId || !description) {
            res.status(400).json({ code: 400, message: 'Missing required fields' });
            return;
        }
        const storeId = req.user.storeId;
        const staffId = req.user.staffId || '';
        // Get staff name from database
        let staffName = 'Unknown';
        if (staffId) {
            const staff = await database_1.default.staff.findUnique({
                where: { id: staffId },
                select: { name: true },
            });
            staffName = staff?.name || 'Unknown';
        }
        const log = await (0, POSActionLogService_1.logPOSAction)({
            storeId,
            staffId,
            staffName,
            sessionId,
            action: action,
            entityId,
            description,
            metadata,
            severity: severity || 'info',
        });
        res.status(201).json({ code: 201, data: log });
    }
    catch (error) {
        console.error('POS action log error:', error);
        res.status(500).json({ code: 500, message: 'Failed to log POS action' });
    }
});
// GET /api/pos-action-logs - Get logs with filters
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { staffId, severity, startDate, endDate, sessionId, action, page, limit } = req.query;
        const result = await (0, POSActionLogService_1.getPOSActionLogs)(storeId, {
            staffId: staffId,
            severity: severity,
            startDate: startDate,
            endDate: endDate,
            sessionId: sessionId,
            action: action,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50,
        });
        res.json({ code: 200, data: result });
    }
    catch (error) {
        console.error('Get POS action logs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get logs' });
    }
});
// GET /api/pos-action-logs/stats - Get alert stats for dashboard
router.get('/stats', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const stats = await (0, POSActionLogService_1.getAlertStats)(storeId, startDate, endDate);
        res.json({ code: 200, data: stats });
    }
    catch (error) {
        console.error('Get alert stats error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get stats' });
    }
});
// GET /api/pos-action-logs/sessions - Get active sessions (unfinished carts)
router.get('/sessions', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const sessions = await (0, POSActionLogService_1.getActiveSessions)(storeId);
        res.json({ code: 200, data: sessions });
    }
    catch (error) {
        console.error('Get active sessions error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get sessions' });
    }
});
//# sourceMappingURL=posActionLog.js.map