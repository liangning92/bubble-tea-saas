"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaveTypeRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
exports.leaveTypeRouter = router;
// Validation schemas
const createLeaveTypeSchema = zod_1.z.object({
    code: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    color: zod_1.z.string().optional().default('#EC6D88'),
    icon: zod_1.z.string().optional(),
    deductBalance: zod_1.z.boolean().optional().default(true),
    requiresProof: zod_1.z.boolean().optional().default(false),
    maxDaysPerYear: zod_1.z.number().optional().nullable(),
    paidLeave: zod_1.z.boolean().optional().default(true),
    sortOrder: zod_1.z.number().optional().default(0)
});
const updateLeaveTypeSchema = createLeaveTypeSchema.partial();
// GET /api/leave-types - Get all leave types for store
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const leaveTypes = await database_1.default.leaveType.findMany({
            where: { storeId, isActive: true },
            orderBy: { sortOrder: 'asc' }
        });
        res.json({
            code: 200,
            data: leaveTypes,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get leave types error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get leave types' });
    }
});
// GET /api/leave-types/all - Get all leave types including inactive
router.get('/all', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const leaveTypes = await database_1.default.leaveType.findMany({
            where: { storeId },
            orderBy: { sortOrder: 'asc' }
        });
        res.json({
            code: 200,
            data: leaveTypes,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get all leave types error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get leave types' });
    }
});
// POST /api/leave-types - Create a new leave type
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const validated = createLeaveTypeSchema.parse(req.body);
        // Check if code already exists
        const existing = await database_1.default.leaveType.findUnique({
            where: { storeId_code: { storeId, code: validated.code } }
        });
        if (existing) {
            return res.status(400).json({ code: 400, message: 'Leave type code already exists' });
        }
        const leaveType = await database_1.default.leaveType.create({
            data: { ...validated, storeId }
        });
        res.status(201).json({
            code: 201,
            message: 'Leave type created',
            data: leaveType,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create leave type error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to create leave type' });
    }
});
// PUT /api/leave-types/:id - Update a leave type
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const validated = updateLeaveTypeSchema.parse(req.body);
        const leaveType = await database_1.default.leaveType.update({
            where: { id },
            data: validated
        });
        res.json({
            code: 200,
            message: 'Leave type updated',
            data: leaveType,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update leave type error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to update leave type' });
    }
});
// DELETE /api/leave-types/:id - Soft delete (deactivate) a leave type
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const leaveType = await database_1.default.leaveType.update({
            where: { id },
            data: { isActive: false }
        });
        res.json({
            code: 200,
            message: 'Leave type deactivated',
            data: leaveType,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete leave type error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to delete leave type' });
    }
});
// Seed default leave types for a store
router.post('/seed', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const defaultTypes = [
            { code: 'annual', name: 'Cuti Tahunan', color: '#10B981', deductBalance: true, requiresProof: false, paidLeave: true, sortOrder: 1 },
            { code: 'sick', name: 'Cuti Sakit', color: '#F59E0B', deductBalance: true, requiresProof: true, paidLeave: true, sortOrder: 2 },
            { code: 'unpaid', name: 'Cuti Tidak Dibayar', color: '#6B7280', deductBalance: false, requiresProof: false, paidLeave: false, sortOrder: 3 },
            { code: 'maternity', name: 'Cuti Melahirkan', color: '#EC4899', deductBalance: false, requiresProof: true, paidLeave: true, sortOrder: 4 },
            { code: 'paternity', name: 'Cuti Ayah', color: '#8B5CF6', deductBalance: false, requiresProof: true, paidLeave: true, sortOrder: 5 },
            { code: 'bereavement', name: 'Cuti Duka', color: '#374151', deductBalance: false, requiresProof: false, paidLeave: true, sortOrder: 6 }
        ];
        const created = [];
        for (const type of defaultTypes) {
            const existing = await database_1.default.leaveType.findUnique({
                where: { storeId_code: { storeId, code: type.code } }
            });
            if (!existing) {
                const createdType = await database_1.default.leaveType.create({
                    data: { ...type, storeId }
                });
                created.push(createdType);
            }
        }
        res.json({
            code: 201,
            message: `Seeded ${created.length} leave types`,
            data: created,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Seed leave types error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to seed leave types' });
    }
});
//# sourceMappingURL=leaveType.js.map