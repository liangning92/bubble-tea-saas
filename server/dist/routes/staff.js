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
    password: zod_1.z.string().min(6),
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
        if (storeId)
            where.storeId = storeId;
        else if (req.user.role === 'staff' || req.user.role === 'cashier') {
            where.storeId = req.user.storeId;
        }
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
router.get('/:id', auth_1.authenticate, async (req, res) => {
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
        const { storeId, name, phone, password, position, role, employmentType, hourlyRate, weeklyHours, hireDate, emergencyContact, emergencyPhone, bankAccount, bankName, email, address } = req.body;
        // Check if phone exists
        const existing = await database_1.default.user.findUnique({ where: { phone } });
        if (existing) {
            return res.status(400).json({ code: 400, message: 'Phone number already registered' });
        }
        const staff = await database_1.default.$transaction(async (tx) => {
            const hashed = await bcryptjs_1.default.hash(password, 10);
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
        const staff = await database_1.default.staff.update({
            where: { id },
            data: updateData
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
        const { role } = req.body;
        if (!['admin', 'manager', 'cashier', 'staff'].includes(role)) {
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
            data: { role }
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
            // 校验当日排班（可选 - 如果有排班记录则检查是否在班）
            const todaySchedule = await database_1.default.schedule.findFirst({
                where: {
                    staffId: staff.id,
                    date: { gte: startOfDay, lte: endOfDay }
                }
            });
            // Determine if late based on attendance rule or defaults
            let status = 'normal';
            if (rule) {
                // Parse work start time from rule
                const [startHour, startMin] = rule.workStartTime.split(':').map(Number);
                const gracePeriod = rule.gracePeriod || 0;
                const lateThreshold = startHour * 60 + startMin + gracePeriod;
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                if (currentMinutes > lateThreshold) {
                    status = 'late';
                }
            }
            else {
                // Default: 9:30 AM (no rules enabled)
                const hour = now.getHours();
                if (hour > 9 || (hour === 9 && now.getMinutes() > 30)) {
                    status = 'late';
                }
            }
            const attendance = await database_1.default.attendance.create({
                data: {
                    staffId: staff.id,
                    checkInTime: now,
                    status,
                    gpsLocation,
                    note
                }
            });
            // 更新排班状态为已打卡
            if (todaySchedule) {
                await database_1.default.schedule.update({
                    where: { id: todaySchedule.id },
                    data: { status: 'completed' }
                });
            }
            res.status(201).json({
                code: 201,
                message: 'Check in successful',
                data: attendance,
                timestamp: new Date().toISOString()
            });
        }
        else if (type === 'check_out') {
            // Check out - 支持通过attendanceId指定，或查找当日的未checkout记录
            let attendance;
            const { attendanceId } = req.body;
            if (attendanceId) {
                // 通过ID直接指定
                attendance = await database_1.default.attendance.findFirst({
                    where: { id: attendanceId, staffId: staff.id }
                });
            }
            else {
                // 查找当日的未checkout记录
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                attendance = await database_1.default.attendance.findFirst({
                    where: {
                        staffId: staff.id,
                        checkInTime: { gte: startOfDay },
                        checkOutTime: null
                    }
                });
            }
            if (!attendance) {
                return res.status(400).json({ code: 400, message: 'No check in record found today' });
            }
            const updated = await database_1.default.attendance.update({
                where: { id: attendance.id },
                data: {
                    checkOutTime: now,
                    gpsLocation: gpsLocation || undefined
                }
            });
            res.json({
                code: 200,
                message: 'Check out successful',
                data: { ...updated, id: attendance.id }, // 确保返回id
                timestamp: new Date().toISOString()
            });
        }
        else {
            return res.status(400).json({ code: 400, message: 'Invalid attendance type' });
        }
    }
    catch (error) {
        console.error('Attendance error:', error);
        res.status(500).json({ code: 500, message: 'Failed to record attendance' });
    }
});
// GET /api/staff/attendance/today
router.get('/attendance/today', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const attendance = await database_1.default.attendance.findFirst({
            where: {
                staffId: staff.id,
                checkInTime: { gte: startOfDay }
            }
        });
        res.json({
            code: 200,
            data: attendance || null,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get today attendance error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get attendance' });
    }
});
// GET /api/staff/attendance/list
router.get('/attendance/list', auth_1.authenticate, async (req, res) => {
    try {
        const { staffId, startDate, endDate } = req.query;
        const where = {};
        if (staffId)
            where.staffId = staffId;
        if (startDate || endDate) {
            where.checkInTime = {};
            if (startDate)
                where.checkInTime.gte = new Date(startDate);
            if (endDate)
                where.checkInTime.lte = new Date(endDate);
        }
        const attendances = await database_1.default.attendance.findMany({
            where,
            include: { staff: { select: { id: true, name: true, employeeNumber: true } } },
            orderBy: { checkInTime: 'desc' },
            take: 100
        });
        res.json({
            code: 200,
            data: attendances,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get attendance list error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get attendance list' });
    }
});
// POST /api/staff/schedule
router.post('/schedule', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(scheduleSchema), async (req, res) => {
    try {
        const { staffId, date, shift } = req.body;
        const storeId = req.user.storeId;
        // Check if leave-schedule linkage is enabled
        const leaveLinkageEnabled = await (0, StaffConfigService_1.isFeatureEnabled)(storeId, 'leaveScheduleLinkage');
        // If linkage enabled, check if staff has approved leave on this date
        if (leaveLinkageEnabled) {
            const hasLeave = await (0, LeaveService_1.hasApprovedLeaveOnDate)(staffId, new Date(date));
            if (hasLeave) {
                return res.status(400).json({
                    code: 400,
                    message: 'Cannot schedule: Staff has approved leave on this date',
                    timestamp: new Date().toISOString()
                });
            }
        }
        // Check if schedule exists
        const existing = await database_1.default.schedule.findFirst({
            where: {
                staffId,
                date: new Date(date)
            }
        });
        if (existing) {
            const updated = await database_1.default.schedule.update({
                where: { id: existing.id },
                data: { shift }
            });
            return res.json({
                code: 200,
                message: 'Schedule updated',
                data: updated,
                timestamp: new Date().toISOString()
            });
        }
        const schedule = await database_1.default.schedule.create({
            data: {
                staffId,
                date: new Date(date),
                shift
            }
        });
        res.status(201).json({
            code: 201,
            message: 'Schedule created',
            data: schedule,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create schedule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create schedule' });
    }
});
// GET /api/staff/schedule/list
router.get('/schedule/list', auth_1.authenticate, async (req, res) => {
    try {
        const { staffId, month } = req.query;
        const storeId = req.user.storeId;
        const where = {};
        if (staffId)
            where.staffId = staffId;
        if (month) {
            const [year, m] = month.split('-');
            const startDate = new Date(parseInt(year), parseInt(m) - 1, 1);
            const endDate = new Date(parseInt(year), parseInt(m), 0);
            where.date = { gte: startDate, lte: endDate };
        }
        const schedules = await database_1.default.schedule.findMany({
            where,
            include: { staff: { select: { id: true, name: true, employeeNumber: true } } },
            orderBy: { date: 'asc' }
        });
        // Check if leave-schedule linkage is enabled
        const leaveLinkageEnabled = await (0, StaffConfigService_1.isFeatureEnabled)(storeId, 'leaveScheduleLinkage');
        let leaves = [];
        if (leaveLinkageEnabled && month) {
            const [year, m] = month.split('-');
            const startDate = new Date(parseInt(year), parseInt(m) - 1, 1);
            const endDate = new Date(parseInt(year), parseInt(m), 0);
            leaves = await (0, LeaveService_1.getApprovedLeavesInRange)(storeId, startDate, endDate);
        }
        res.json({
            code: 200,
            data: schedules,
            leaves: leaves,
            leaveLinkageEnabled,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get schedule list error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get schedule list' });
    }
});
// GET /api/staff/schedule/my - Get current staff's schedule
router.get('/schedule/my', auth_1.authenticate, async (req, res) => {
    try {
        const { weekStart } = req.query;
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const startOfWeek = weekStart ? new Date(weekStart) : new Date();
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const schedules = await database_1.default.schedule.findMany({
            where: {
                staffId: staff.id,
                date: { gte: startOfWeek, lte: endOfWeek }
            },
            orderBy: { date: 'asc' }
        });
        // Format as weekly object with day keys
        const weeklySchedule = {
            sunday: 'off',
            monday: 'off',
            tuesday: 'off',
            wednesday: 'off',
            thursday: 'off',
            friday: 'off',
            saturday: 'off'
        };
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        schedules.forEach(s => {
            const dayIndex = new Date(s.date).getDay();
            weeklySchedule[dayKeys[dayIndex]] = s.shift;
        });
        res.json({
            code: 200,
            data: weeklySchedule,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get my schedule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get schedule' });
    }
});
// GET /api/staff/attendance/history - Get current staff's attendance history
router.get('/attendance/history', auth_1.authenticate, async (req, res) => {
    try {
        const { month, year } = req.query;
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const now = new Date();
        const targetMonth = month ? parseInt(month) : now.getMonth() + 1;
        const targetYear = year ? parseInt(year) : now.getFullYear();
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
        const attendances = await database_1.default.attendance.findMany({
            where: {
                staffId: staff.id,
                checkInTime: { gte: startDate, lte: endDate }
            },
            orderBy: { checkInTime: 'desc' }
        });
        res.json({
            code: 200,
            data: attendances,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get attendance history error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get attendance history' });
    }
});
// GET /api/staff/salary/my - Get current staff's salary
router.get('/salary/my', auth_1.authenticate, async (req, res) => {
    try {
        const { month, year } = req.query;
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const now = new Date();
        const targetMonth = month ? `${year}-${String(month).padStart(2, '0')}` : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const salaryRecord = await database_1.default.salary.findFirst({
            where: {
                staffId: staff.id,
                month: targetMonth
            },
            orderBy: { createdAt: 'desc' }
        });
        if (!salaryRecord) {
            return res.json({
                code: 200,
                data: null,
                timestamp: new Date().toISOString()
            });
        }
        // Transform to match frontend expected format
        const salaryData = {
            staffName: staff.name,
            month: salaryRecord.month,
            baseSalary: salaryRecord.baseSalary,
            workDays: 0, // Would need attendance data to calculate
            lateDays: 0, // Would need attendance data to calculate
            overtimeHours: Math.round((salaryRecord.overtime / (salaryRecord.baseSalary / 176)) * 100) / 100 || 0,
            overtimePay: salaryRecord.overtime,
            bonuses: salaryRecord.bonus,
            commissions: salaryRecord.commission,
            deductions: salaryRecord.deduction,
            totalSalary: salaryRecord.finalAmount
        };
        res.json({
            code: 200,
            data: salaryData,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get salary error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get salary' });
    }
});
// PUT /api/staff/:id/reset-password - Reset staff password (admin only)
router.put('/:id/reset-password', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ code: 400, message: 'Password must be at least 6 characters' });
        }
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await database_1.default.user.update({
            where: { id },
            data: { password: hashed }
        });
        res.json({ code: 200, message: 'Password reset successfully', timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ code: 500, message: 'Failed to reset password' });
    }
});
//# sourceMappingURL=staff.js.map