"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaveRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const LeaveService = __importStar(require("../services/LeaveService"));
const router = (0, express_1.Router)();
exports.leaveRouter = router;
// Validation schemas
const applyLeaveSchema = zod_1.z.object({
    leaveType: zod_1.z.enum(['annual', 'sick', 'unpaid', 'maternity', 'paternity', 'bereavement', 'other']),
    startDate: zod_1.z.string(),
    endDate: zod_1.z.string(),
    totalDays: zod_1.z.number().min(1),
    reason: zod_1.z.string().optional(),
    halfDay: zod_1.z.boolean().optional(),
    contactPhone: zod_1.z.string().optional(),
    attachmentUrl: zod_1.z.string().optional()
});
const setBalanceSchema = zod_1.z.object({
    year: zod_1.z.number(),
    annualLeave: zod_1.z.number().optional(),
    sickLeave: zod_1.z.number().optional(),
    unpaidLeave: zod_1.z.number().optional(),
    broughtForward: zod_1.z.number().optional()
});
// ============================================
// Staff/Cashier APIs
// ============================================
// POST /api/leave/apply - Apply for leave
router.post('/apply', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const validated = applyLeaveSchema.parse(req.body);
        const leave = await LeaveService.applyLeave({
            staffId: staff.id,
            storeId: staff.storeId,
            leaveType: validated.leaveType,
            startDate: new Date(validated.startDate),
            endDate: new Date(validated.endDate),
            totalDays: validated.totalDays,
            reason: validated.reason,
            halfDay: validated.halfDay,
            contactPhone: validated.contactPhone,
            attachmentUrl: validated.attachmentUrl
        });
        res.status(201).json({
            code: 201,
            message: 'Leave application submitted',
            data: leave,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Apply leave error:', error);
        res.status(400).json({
            code: 400,
            message: error.message || 'Failed to apply for leave',
            timestamp: new Date().toISOString()
        });
    }
});
// GET /api/leave/my - Get my leave records
router.get('/my', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const { status, startDate, endDate } = req.query;
        const leaves = await LeaveService.getStaffLeaves(staff.id, {
            status: status,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({
            code: 200,
            data: leaves,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get my leaves error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get leaves' });
    }
});
// GET /api/leave/balance - Get my leave balance
router.get('/balance', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const balance = await LeaveService.getLeaveBalance(staff.id, year);
        res.json({
            code: 200,
            data: balance,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get leave balance error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get leave balance' });
    }
});
// GET /api/leave/balance/:staffId - Admin/Manager view staff member's leave balance
router.get('/balance/:staffId', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { staffId } = req.params;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const balance = await LeaveService.getLeaveBalance(staffId, year);
        res.json({
            code: 200,
            data: balance,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get staff leave balance error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get leave balance' });
    }
});
// PUT /api/leave/cancel/:id - Cancel my leave application
router.put('/cancel/:id', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const leave = await LeaveService.cancelLeave(req.params.id, staff.id);
        res.json({
            code: 200,
            message: 'Leave cancelled',
            data: leave,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Cancel leave error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to cancel leave' });
    }
});
// ============================================
// Admin/Manager APIs
// ============================================
// GET /api/leave/list - Get all leave applications
router.get('/list', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { storeId, status, staffId, startDate, endDate } = req.query;
        let targetStoreId = storeId;
        if (!targetStoreId) {
            if (req.user.role === 'staff' || req.user.role === 'cashier') {
                targetStoreId = req.user.storeId;
            }
        }
        const leaves = await LeaveService.getStoreLeaves(targetStoreId, {
            status: status,
            staffId: staffId,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({
            code: 200,
            data: leaves,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get leaves error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get leaves' });
    }
});
// GET /api/leave/:id - Get leave detail
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const leave = await LeaveService.getLeaveById(req.params.id);
        if (!leave) {
            return res.status(404).json({ code: 404, message: 'Leave not found' });
        }
        // Check access permission
        if (req.user.role !== 'admin' && req.user.role !== 'manager') {
            const staff = await database_1.default.staff.findFirst({
                where: { userId: req.user.id }
            });
            if (!staff || leave.staffId !== staff.id) {
                return res.status(403).json({ code: 403, message: 'Not authorized' });
            }
        }
        res.json({
            code: 200,
            data: leave,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get leave error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get leave' });
    }
});
// PUT /api/leave/approve/:id - Approve leave
router.put('/approve/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const leave = await LeaveService.approveLeave(req.params.id, req.user.id);
        res.json({
            code: 200,
            message: 'Leave approved',
            data: leave,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Approve leave error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to approve leave' });
    }
});
// PUT /api/leave/reject/:id - Reject leave
router.put('/reject/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { reason } = req.body;
        const leave = await LeaveService.rejectLeave(req.params.id, req.user.id, reason || '');
        res.json({
            code: 200,
            message: 'Leave rejected',
            data: leave,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Reject leave error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to reject leave' });
    }
});
// PUT /api/leave/balance/:staffId - Set staff leave balance
router.put('/balance/:staffId', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { staffId } = req.params;
        const validated = setBalanceSchema.parse(req.body);
        const balance = await LeaveService.setLeaveBalance(staffId, {
            staffId,
            year: validated.year,
            annualLeave: validated.annualLeave,
            sickLeave: validated.sickLeave,
            unpaidLeave: validated.unpaidLeave,
            broughtForward: validated.broughtForward
        });
        res.json({
            code: 200,
            message: 'Leave balance updated',
            data: balance,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Set leave balance error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to set leave balance' });
    }
});
//# sourceMappingURL=leave.js.map