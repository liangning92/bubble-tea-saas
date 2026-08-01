"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
exports.getAuditLogs = getAuditLogs;
const database_1 = __importDefault(require("../config/database"));
async function createAuditLog(data) {
    return database_1.default.financeAuditLog.create({
        data: {
            storeId: data.storeId,
            userId: data.userId,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            description: data.description,
            oldValue: data.oldValue ? JSON.stringify(data.oldValue) : null,
            newValue: data.newValue ? JSON.stringify(data.newValue) : null,
            ipAddress: data.ipAddress || null
        }
    });
}
async function getAuditLogs(storeId, options) {
    const where = { storeId };
    if (options?.entityType)
        where.entityType = options.entityType;
    if (options?.userId)
        where.userId = options.userId;
    if (options?.startDate || options?.endDate) {
        where.createdAt = {};
        if (options.startDate)
            where.createdAt.gte = options.startDate;
        if (options.endDate)
            where.createdAt.lte = options.endDate;
    }
    return database_1.default.financeAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 100
    });
}
//# sourceMappingURL=FinanceAuditService.js.map