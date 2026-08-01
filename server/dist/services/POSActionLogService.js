"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPOSAction = logPOSAction;
exports.getPOSActionLogs = getPOSActionLogs;
exports.getActiveSessions = getActiveSessions;
exports.getAlertStats = getAlertStats;
const database_1 = __importDefault(require("../config/database"));
const socket_1 = require("../socket");
async function logPOSAction(data) {
    const log = await database_1.default.pOSActionLog.create({
        data: {
            storeId: data.storeId,
            staffId: data.staffId,
            staffName: data.staffName,
            sessionId: data.sessionId,
            action: data.action,
            entityId: data.entityId || null,
            description: data.description,
            metadata: data.metadata ? JSON.stringify(data.metadata) : null,
            severity: data.severity || 'info',
        },
    });
    // Broadcast to admin dashboard in real-time if warning/critical
    if (data.severity === 'warning' || data.severity === 'critical') {
        socket_1.socketManager.emitToStore(data.storeId, 'pos:alert', {
            type: 'pos:alert',
            data: {
                id: log.id,
                action: log.action,
                description: log.description,
                severity: log.severity,
                staffName: log.staffName,
                sessionId: log.sessionId,
                createdAt: log.createdAt,
                metadata: data.metadata,
            },
            timestamp: new Date().toISOString(),
        });
    }
    return log;
}
async function getPOSActionLogs(storeId, options) {
    const where = { storeId };
    if (options?.staffId)
        where.staffId = options.staffId;
    if (options?.severity)
        where.severity = options.severity;
    if (options?.sessionId)
        where.sessionId = options.sessionId;
    if (options?.action)
        where.action = options.action;
    if (options?.startDate || options?.endDate) {
        where.createdAt = {};
        if (options.startDate)
            where.createdAt.gte = new Date(options.startDate);
        if (options.endDate)
            where.createdAt.lte = new Date(options.endDate);
    }
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
        database_1.default.pOSActionLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        database_1.default.pOSActionLog.count({ where }),
    ]);
    return {
        logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}
async function getActiveSessions(storeId) {
    // Get sessions from last 30 minutes that have cart_add but no checkout_complete
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const sessions = await database_1.default.pOSActionLog.groupBy({
        by: ['sessionId', 'staffId', 'staffName'],
        where: {
            storeId,
            createdAt: { gte: thirtyMinutesAgo },
        },
        _count: { id: true },
    });
    const activeSessions = [];
    for (const session of sessions) {
        const actions = await database_1.default.pOSActionLog.findMany({
            where: { sessionId: session.sessionId },
            orderBy: { createdAt: 'desc' },
            take: 1,
        });
        const hasCheckout = await database_1.default.pOSActionLog.findFirst({
            where: { sessionId: session.sessionId, action: 'checkout_complete' },
        });
        // Count cart_add actions
        const cartAdds = await database_1.default.pOSActionLog.count({
            where: { sessionId: session.sessionId, action: 'cart_add' },
        });
        // Count cart_clear actions (if clears > adds, suspicious)
        const cartClears = await database_1.default.pOSActionLog.count({
            where: { sessionId: session.sessionId, action: 'cart_clear' },
        });
        activeSessions.push({
            sessionId: session.sessionId,
            staffId: session.staffId,
            staffName: session.staffName,
            lastAction: actions[0]?.action || 'unknown',
            lastActionAt: actions[0]?.createdAt || new Date(),
            hasCheckoutComplete: !!hasCheckout,
            itemCount: cartAdds - cartClears, // net items added
        });
    }
    return activeSessions.filter(s => s.itemCount > 0 && !s.hasCheckoutComplete);
}
async function getAlertStats(storeId, startDate, endDate) {
    const where = { storeId, severity: { in: ['warning', 'critical'] } };
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate)
            where.createdAt.gte = new Date(startDate);
        if (endDate)
            where.createdAt.lte = new Date(endDate);
    }
    const [warningCount, criticalCount, todayTotal] = await Promise.all([
        database_1.default.pOSActionLog.count({ where: { ...where, severity: 'warning' } }),
        database_1.default.pOSActionLog.count({ where: { ...where, severity: 'critical' } }),
        database_1.default.pOSActionLog.count({
            where: {
                storeId,
                createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
        }),
    ]);
    return { warningCount, criticalCount, todayTotal };
}
//# sourceMappingURL=POSActionLogService.js.map