"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyReimbursement = applyReimbursement;
exports.approveReimbursement = approveReimbursement;
exports.rejectReimbursement = rejectReimbursement;
exports.markAsPaid = markAsPaid;
exports.cancelReimbursement = cancelReimbursement;
exports.getStaffReimbursements = getStaffReimbursements;
exports.getStoreReimbursements = getStoreReimbursements;
exports.getReimbursementById = getReimbursementById;
exports.updateReceiptUrls = updateReceiptUrls;
const database_1 = __importDefault(require("../config/database"));
// Apply for reimbursement
async function applyReimbursement(data) {
    return database_1.default.reimbursement.create({
        data: {
            staffId: data.staffId,
            storeId: data.storeId,
            type: data.type,
            amount: data.amount,
            description: data.description,
            receiptUrls: data.receiptUrls ? JSON.stringify(data.receiptUrls) : null,
            status: 'pending'
        },
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true } }
        }
    });
}
// Approve reimbursement
async function approveReimbursement(reimbursementId, approverId) {
    const reimbursement = await database_1.default.reimbursement.findUnique({ where: { id: reimbursementId } });
    if (!reimbursement)
        throw new Error('Reimbursement not found');
    if (reimbursement.status !== 'pending')
        throw new Error('Reimbursement is not pending');
    return database_1.default.reimbursement.update({
        where: { id: reimbursementId },
        data: {
            status: 'approved',
            approvedBy: approverId,
            approvedAt: new Date()
        }
    });
}
// Reject reimbursement
async function rejectReimbursement(reimbursementId, approverId, reason) {
    const reimbursement = await database_1.default.reimbursement.findUnique({ where: { id: reimbursementId } });
    if (!reimbursement)
        throw new Error('Reimbursement not found');
    if (reimbursement.status !== 'pending')
        throw new Error('Reimbursement is not pending');
    return database_1.default.reimbursement.update({
        where: { id: reimbursementId },
        data: {
            status: 'rejected',
            approvedBy: approverId,
            approvedAt: new Date(),
            rejectionReason: reason
        }
    });
}
// Mark as paid
async function markAsPaid(reimbursementId, paidBy) {
    const reimbursement = await database_1.default.reimbursement.findUnique({ where: { id: reimbursementId } });
    if (!reimbursement)
        throw new Error('Reimbursement not found');
    if (reimbursement.status !== 'approved')
        throw new Error('Reimbursement must be approved before marking as paid');
    // Get reimbursement type name for expense category (type stores code, not id)
    const reimbType = await database_1.default.reimbursementType.findFirst({
        where: { storeId: reimbursement.storeId, code: reimbursement.type }
    });
    return database_1.default.$transaction(async (tx) => {
        // Update reimbursement status
        const updated = await tx.reimbursement.update({
            where: { id: reimbursementId },
            data: {
                status: 'paid',
                paidAt: new Date(),
                paidBy
            }
        });
        // Auto-create expense record
        await tx.expense.create({
            data: {
                storeId: reimbursement.storeId,
                type: 'reimbursement',
                category: reimbType?.name || 'Ganti Rugi',
                amount: reimbursement.amount,
                description: `[Reimbursement] ${reimbursement.description}`,
                referenceId: reimbursementId,
                referenceType: 'reimbursement'
            }
        });
        return updated;
    });
}
// Cancel reimbursement (by staff)
async function cancelReimbursement(reimbursementId, staffId) {
    const reimbursement = await database_1.default.reimbursement.findUnique({ where: { id: reimbursementId } });
    if (!reimbursement)
        throw new Error('Reimbursement not found');
    if (reimbursement.staffId !== staffId)
        throw new Error('Not authorized');
    if (reimbursement.status !== 'pending')
        throw new Error('Only pending reimbursements can be cancelled');
    return database_1.default.reimbursement.update({
        where: { id: reimbursementId },
        data: { status: 'cancelled' }
    });
}
// Get staff reimbursements
async function getStaffReimbursements(staffId, options) {
    const where = { staffId };
    if (options?.status)
        where.status = options.status;
    if (options?.startDate || options?.endDate) {
        where.createdAt = {};
        if (options.startDate)
            where.createdAt.gte = options.startDate;
        if (options.endDate)
            where.createdAt.lte = options.endDate;
    }
    return database_1.default.reimbursement.findMany({
        where,
        orderBy: { createdAt: 'desc' }
    });
}
// Get store reimbursements
async function getStoreReimbursements(storeId, options) {
    const where = { storeId };
    if (options?.status)
        where.status = options.status;
    if (options?.staffId)
        where.staffId = options.staffId;
    if (options?.startDate || options?.endDate) {
        where.createdAt = {};
        if (options.startDate)
            where.createdAt.gte = options.startDate;
        if (options.endDate)
            where.createdAt.lte = options.endDate;
    }
    return database_1.default.reimbursement.findMany({
        where,
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}
// Get reimbursement by ID
async function getReimbursementById(reimbursementId) {
    return database_1.default.reimbursement.findUnique({
        where: { id: reimbursementId },
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true, storeId: true } }
        }
    });
}
// Update receipt URLs
async function updateReceiptUrls(reimbursementId, receiptUrls) {
    return database_1.default.reimbursement.update({
        where: { id: reimbursementId },
        data: {
            receiptUrls: JSON.stringify(receiptUrls)
        }
    });
}
//# sourceMappingURL=ReimbursementService.js.map