"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const StaffConfigService_1 = require("../services/StaffConfigService");
const LeaveService_1 = require("../services/LeaveService");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
exports.staffRouter = router;
// Helper: Get attendance rule for store (with defaults)
async function getAttendanceRuleWithDefaults(storeId) {
    const rules = await database_1.default.attendanceRule.findMany({
        where: { storeId, isActive: true }
    });
    const defaultRule = rules.find(r => r.isDefault) || rules[0];
    return defaultRule || {
        workStartTime: '09:00',
        gracePeriod: 15,
        lateDeductionType: 'none',
        lateDeductionFixed: 50000
    };
}
// Validation schemas
const createStaffSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(50),
    phone: zod_1.z.string().min(10).max(15),
    password: zod_1.z.string().min(6).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
    position: zod_1.z.string().optional().default('店员'),
    role: zod_1.z.enum(['manager', 'staff', 'cashier']).default('staff'),
    employmentType: zod_1.z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
    hourlyRate: zod_1.z.number().optional(),
    weeklyHours: zod_1.z.number().optional(),
    hireDate: zod_1.z.string().optional(),
    emergencyContact: zod_1.z.string().optional(),
    emergencyPhone: zod_1.z.string().optional(),
    bankAccount: zod_1.z.string().optional(),
    bankName: zod_1.z.string().optional(),
    email: zod_1.z.string().optional(),
    address: zod_1.z.string().optional()
});
const updateStaffSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50).optional(),
    position: zod_1.z.string().optional(),
    status: zod_1.z.enum(['active', 'inactive', 'resigned', 'suspended']).optional(),
    employmentType: zod_1.z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
    hourlyRate: zod_1.z.number().optional(),
    weeklyHours: zod_1.z.number().optional(),
    hireDate: zod_1.z.string().optional(),
    terminationDate: zod_1.z.string().optional(),
    emergencyContact: zod_1.z.string().optional(),
    emergencyPhone: zod_1.z.string().optional(),
    bankAccount: zod_1.z.string().optional(),
    bankName: zod_1.z.string().optional(),
    email: zod_1.z.string().optional(),
    address: zod_1.z.string().optional()
});
const attendanceSchema = zod_1.z.object({
    type: zod_1.z.enum(['check_in', 'check_out']),
    gpsLocation: zod_1.z.string().optional(),
    note: zod_1.z.string().optional()
});
const scheduleSchema = zod_1.z.object({
    staffId: zod_1.z.string(),
    date: zod_1.z.string(),
    shift: zod_1.z.string()
});
// GET /api/staff
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, status, position } = req.query;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const where = {};
        if (storeId && !(0, auth_1.canAccessStore)(req.user, storeId)) {
            return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' });
        }
        if (req.user.role !== 'admin')
            where.storeId = req.user.storeId;
        else if (storeId)
            where.storeId = storeId;
        if (status)
            where.status = status;
        if (position)
            where.position = position;
        const [staff, total] = await Promise.all([
            database_1.default.staff.findMany({
                where,
                include: {
                    user: { select: { id: true, phone: true, role: true } },
                    _count: { select: { attendances: true, schedules: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize
            }),
            database_1.default.staff.count({ where })
        ]);
        res.json({
            code: 200,
            data: {
                list: staff.map(s => ({
                    ...s,
                    phone: s.user.phone,
                    role: s.user.role,
                    _count: undefined
                })),
                pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get staff error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get staff' });
    }
});
// GET /api/staff/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await database_1.default.staff.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, phone: true, role: true } },
                attendances: { orderBy: { checkInTime: 'desc' }, take: 30 },
                schedules: { orderBy: { date: 'desc' }, take: 30 },
                salaries: { orderBy: { month: 'desc' }, take: 12 }
            }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff not found' });
        }
        if (!(0, auth_1.canAccessStore)(req.user, staff.storeId)) {
            return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' });
        }
        res.json({
            code: 200,
            data: {
                ...staff,
                phone: staff.user.phone,
                role: staff.user.role
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get staff error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get staff' });
    }
});
// POST /api/staff
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createStaffSchema), async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.body.storeId !== req.user.storeId) {
            return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' });
        }
        const { storeId, name, phone, password, position, role, employmentType, hourlyRate, weeklyHours, hireDate, emergencyContact, emergencyPhone, bankAccount, bankName, email, address } = req.body;
        // Check if phone exists
        const existing = await database_1.default.user.findUnique({ where: { phone } });
        if (existing) {
            return res.status(400).json({ code: 400, message: 'Phone number already registered' });
        }
        const staff = await database_1.default.$transaction(async (tx) => {
            const hashed = await bcryptjs_1.default.hash(password, 12);
            const user = await tx.user.create({
                data: {
                    phone,
                    password: hashed,
                    role,
                    storeId
                }
            });
            const newStaff = await tx.staff.create({
                data: {
                    userId: user.id,
                    storeId,
                    name,
                    employeeNumber: `EMP${Date.now()}`,
                    position: position || '店员',
                    employmentType: employmentType || 'full_time',
                    hourlyRate: hourlyRate || null,
                    weeklyHours: weeklyHours || null,
                    hireDate: hireDate ? new Date(hireDate) : new Date(),
                    emergencyContact: emergencyContact || null,
                    emergencyPhone: emergencyPhone || null,
                    bankAccount: bankAccount || null,
                    bankName: bankName || null,
                    email: email || null,
                    address: address || null,
                    status: 'active'
                },
                include: {
                    user: { select: { id: true, phone: true, role: true } }
                }
            });
            return newStaff;
        });
        res.status(201).json({
            code: 201,
            message: 'Staff created',
            data: {
                id: staff.id,
                name: staff.name,
                employeeNumber: staff.employeeNumber,
                position: staff.position,
                status: staff.status,
                employmentType: staff.employmentType,
                phone: staff.user.phone,
                role: staff.user.role
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create staff error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create staff' });
    }
});
// PUT /api/staff/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await database_1.default.staff.findUnique({ where: { id }, select: { storeId: true, userId: true } });
        if (!existing)
            return res.status(404).json({ code: 404, message: 'Staff not found' });
        if (!(0, auth_1.canAccessStore)(req.user, existing.storeId)) {
            return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' });
        }
        const { name, position, status, employmentType, hourlyRate, weeklyHours, hireDate, terminationDate, emergencyContact, emergencyPhone, bankAccount, bankName, email, address } = req.body;
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (position !== undefined)
            updateData.position = position;
        if (status !== undefined)
            updateData.status = status;
        if (employmentType !== undefined)
            updateData.employmentType = employmentType;
        if (hourlyRate !== undefined)
            updateData.hourlyRate = hourlyRate;
        if (weeklyHours !== undefined)
            updateData.weeklyHours = weeklyHours;
        if (hireDate !== undefined)
            updateData.hireDate = new Date(hireDate);
        if (terminationDate !== undefined)
            updateData.terminationDate = new Date(terminationDate);
        if (emergencyContact !== undefined)
            updateData.emergencyContact = emergencyContact;
        if (emergencyPhone !== undefined)
            updateData.emergencyPhone = emergencyPhone;
        if (bankAccount !== undefined)
            updateData.bankAccount = bankAccount;
        if (bankName !== undefined)
            updateData.bankName = bankName;
        if (email !== undefined)
            updateData.email = email;
        if (address !== undefined)
            updateData.address = address;
        const staff = await database_1.default.$transaction(async (tx) => {
            const staff = await tx.staff.update({ where: { id }, data: updateData });
            if (status !== undefined) {
                await tx.user.update({ where: { id: existing.userId }, data: { updatedAt: new Date() } });
            }
            return staff;
        });
        res.json({
            code: 200,
            message: 'Staff updated',
            data: staff,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update staff error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update staff' });
    }
});
// PUT /api/staff/:id/role - 更新员工系统角色
router.put('/:id/role', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const role = zod_1.z.enum(['admin', 'manager', 'cashier', 'staff']).safeParse(req.body?.role);
        if (!role.success) {
            return res.status(400).json({ code: 400, message: 'Invalid role' });
        }
        // 先获取 staff 信息
        const staff = await database_1.default.staff.findUnique({
            where: { id },
            include: { user: true }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff not found' });
        }
        // 更新 user 的 role
        await database_1.default.user.update({
            where: { id: staff.userId },
            data: { role: role.data }
        });
        res.json({
            code: 200,
            message: 'Role updated',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update role' });
    }
});
// DELETE /api/staff/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await database_1.default.staff.update({
            where: { id },
            data: { status: 'resigned' }
        });
        await database_1.default.user.update({ where: { id: staff.userId }, data: { updatedAt: new Date() } });
        res.json({
            code: 200,
            message: 'Staff marked as resigned',
            data: staff,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete staff error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete staff' });
    }
});
// POST /api/staff/attendance
router.post('/attendance', auth_1.authenticate, async (req, res) => {
    try {
        const { type, gpsLocation, note } = req.body;
        // Find staff by user id
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const now = new Date();
        const storeId = staff.storeId;
        // Check if attendance rules are enabled
        const rulesEnabled = await (0, StaffConfigService_1.isFeatureEnabled)(storeId, 'attendanceRuleActive');
        // Get attendance rule (if enabled)
        const rule = rulesEnabled ? await getAttendanceRuleWithDefaults(storeId) : null;
        if (type === 'check_in') {
            // Check if already checked in today
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            const existing = await database_1.default.attendance.findFirst({
                where: {
                    staffId: staff.id,
                    checkInTime: { gte: startOfDay }
                }
            });
            if (existing) {
                return res.status(400).json({ code: 400, message: 'Already checked in today' });
            }
            // 校验当日排班（优先根据员工排班的实际班次时间判定迟到）
            const todaySchedule = await database_1.default.schedule.findFirst({
                where: {
                    staffId: staff.id,
                    date: { gte: startOfDay, lte: endOfDay }
                }
            });
            // Determine if late based on schedule shift, attendance rule, or defaults
            let status = 'normal';
            let targetStartTime = null;
            let gracePeriod = 15;
            if (todaySchedule && todaySchedule.shift && todaySchedule.shift !== 'off') {
                // 查找排班对应的班次设置
                const shiftRecord = await database_1.default.shift.findFirst({
                    where: {
                        storeId,
                        OR: [
                            { key: todaySchedule.shift },
              