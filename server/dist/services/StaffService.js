"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaff = getStaff;
exports.getStaffById = getStaffById;
exports.createStaff = createStaff;
exports.updateStaff = updateStaff;
exports.checkIn = checkIn;
exports.checkOut = checkOut;
exports.getAttendance = getAttendance;
exports.createSchedule = createSchedule;
exports.getSchedule = getSchedule;
exports.calculateSalary = calculateSalary;
const database_1 = __importDefault(require("../config/database"));
// Get staff list
async function getStaff(filter) {
    const where = {};
    if (filter.storeId)
        where.storeId = filter.storeId;
    if (filter.position)
        where.position = filter.position;
    if (filter.status)
        where.status = filter.status;
    if (filter.search) {
        where.OR = [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { phone: { contains: filter.search, mode: 'insensitive' } }
        ];
    }
    return database_1.default.staff.findMany({
        where,
        include: {
            store: { select: { id: true, name: true } },
            user: { select: { id: true, phone: true, role: true } }
        },
        orderBy: { name: 'asc' }
    });
}
// Get staff by ID
async function getStaffById(staffId) {
    return database_1.default.staff.findUnique({
        where: { id: staffId },
        include: {
            store: true,
            user: true,
            attendances: {
                orderBy: { checkInTime: 'desc' },
                take: 30
            },
            schedules: {
                orderBy: { date: 'desc' },
                take: 4
            }
        }
    });
}
// Create staff (creates User first, then Staff linked to it)
async function createStaff(data) {
    // First create the User
    const user = await database_1.default.user.create({
        data: {
            phone: data.phone,
            password: data.password || 'password123',
            role: 'staff',
            storeId: data.storeId
        }
    });
    // Generate employee number
    const employeeNumber = 'EMP' + Date.now().toString().slice(-6);
    // Then create the Staff linked to the User
    return database_1.default.staff.create({
        data: {
            userId: user.id,
            storeId: data.storeId,
            name: data.name,
            employeeNumber,
            position: data.position,
            email: data.email,
            address: data.address,
            employmentType: data.employmentType || 'full_time',
            hourlyRate: data.hourlyRate,
            weeklyHours: data.weeklyHours,
            hireDate: data.hireDate || new Date(),
            emergencyContact: data.emergencyContact,
            emergencyPhone: data.emergencyPhone,
            bankAccount: data.bankAccount,
            bankName: data.bankName,
            status: 'active'
        }
    });
}
// Update staff
async function updateStaff(staffId, data) {
    return database_1.default.staff.update({
        where: { id: staffId },
        data
    });
}
// Attendance operations
async function checkIn(staffId, data) {
    return database_1.default.attendance.create({
        data: {
            staffId,
            checkInTime: data.checkInTime,
            gpsLocation: data.location,
            status: 'normal'
        }
    });
}
async function checkOut(attendanceId, data) {
    const attendance = await database_1.default.attendance.update({
        where: { id: attendanceId },
        data: {
            checkOutTime: data.checkOutTime,
            gpsLocation: data.location
        }
    });
    // Calculate work duration
    const duration = Math.abs(new Date(data.checkOutTime).getTime() - attendance.checkInTime.getTime());
    const hours = Math.round(duration / (1000 * 60 * 60) * 100) / 100;
    return { ...attendance, workHours: hours };
}
// Get attendance records
async function getAttendance(filter) {
    const where = {};
    if (filter.storeId)
        where.storeId = filter.storeId;
    if (filter.staffId)
        where.staffId = filter.staffId;
    if (filter.startDate || filter.endDate) {
        where.checkInTime = {};
        if (filter.startDate)
            where.checkInTime.gte = filter.startDate;
        if (filter.endDate)
            where.checkInTime.lte = filter.endDate;
    }
    return database_1.default.attendance.findMany({
        where,
        include: {
            staff: { select: { id: true, name: true } }
        },
        orderBy: { checkInTime: 'desc' }
    });
}
// Schedule operations
async function createSchedule(data) {
    return database_1.default.schedule.create({
        data: {
            staffId: data.staffId,
            date: data.date,
            shift: data.shift,
            status: 'scheduled'
        }
    });
}
// Get schedule for a staff member
async function getSchedule(staffId, date) {
    return database_1.default.schedule.findFirst({
        where: {
            staffId,
            date
        }
    });
}
// Salary operations
async function calculateSalary(staffId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const [staff, attendances, attendanceRule, activeDeposits] = await Promise.all([
        database_1.default.staff.findUnique({ where: { id: staffId } }),
        database_1.default.attendance.findMany({
            where: {
                staffId,
                checkInTime: { gte: startDate, lte: endDate }
            }
        }),
        // Get the store's default attendance rule
        database_1.default.attendanceRule.findFirst({
            where: { storeId: (await database_1.default.staff.findUnique({ where: { id: staffId } }))?.storeId || '', isDefault: true, isActive: true }
        }),
        // Get active staff deposits
        database_1.default.staffDeposit.findMany({
            where: { staffId, status: 'active' },
            include: { depositRule: true }
        })
    ]);
    if (!staff)
        throw new Error('Staff not found');
    // Use attendance rule or defaults
    const rule = attendanceRule;
    const workStartHour = rule ? parseInt(rule.workStartTime.split(':')[0]) : 9;
    const gracePeriod = rule?.gracePeriod || 15;
    const lateDeductionFixed = rule?.lateDeductionFixed || 50000;
    const overtimeRate = rule?.overtimeRate || 1.5;
    const overtimeMinHours = rule?.overtimeMinHours || 1;
    // Calculate work days
    const workDays = attendances.filter(a => a.checkInTime).length;
    // Calculate late days based on workStartTime + gracePeriod
    const lateDays = attendances.filter(a => {
        if (!a.checkInTime)
            return false;
        const checkIn = new Date(a.checkInTime);
        const graceEnd = new Date(checkIn);
        graceEnd.setHours(workStartHour, gracePeriod, 0, 0);
        return checkIn > graceEnd;
    }).length;
    // Base salary - use position-based default
    const positionSalaries = {
        '店长': 5000000,
        '副店长': 4000000,
        '店员': 3500000
    };
    let baseSalary = positionSalaries[staff.position] || 3500000;
    let deductions = 0;
    let bonuses = 0;
    let depositDeductions = [];
    // Late penalty based on attendance rule
    if (rule?.lateDeductionType === 'fixed') {
        deductions += lateDays * lateDeductionFixed;
    }
    // Calculate deposit monthly deductions
    for (const deposit of activeDeposits) {
        const depositRule = deposit.depositRule;
        let monthlyDeduction = 0;
        switch (depositRule.deductionType) {
            case 'one_time':
                // One-time: deduct full amount in first month if not yet deducted
                if (deposit.deductionCount === 0) {
                    monthlyDeduction = depositRule.depositAmount;
                }
                break;
            case 'monthly': {
                // Monthly: deduct monthlyAmount until fully paid
                const remaining = depositRule.depositAmount - deposit.deductedAmount;
                if (remaining > 0) {
                    monthlyDeduction = Math.min(depositRule.monthlyAmount || 0, remaining);
                }
                break;
            }
            case 'limited': {
                // Limited: deduct up to maxDeductions times
                if (deposit.deductionCount < (depositRule.maxDeductions || 0)) {
                    const remaining = depositRule.depositAmount - deposit.deductedAmount;
                    if (remaining > 0) {
                        monthlyDeduction = Math.min(depositRule.monthlyAmount || 0, remaining);
                    }
                }
                break;
            }
        }
        if (monthlyDeduction > 0) {
            deductions += monthlyDeduction;
            depositDeductions.push({ ruleName: depositRule.name, amount: monthlyDeduction });
        }
    }
    // Calculate work hours for overtime
    const totalHours = attendances.reduce((sum, a) => {
        if (a.checkOutTime) {
            return sum + Math.abs(new Date(a.checkOutTime).getTime() - new Date(a.checkInTime).getTime()) / (1000 * 60 * 60);
        }
        return sum;
    }, 0);
    const overtimeHours = Math.max(0, totalHours - workDays * 8);
    const hourlyRate = baseSalary / 176;
    const overtimePay = overtimeHours >= overtimeMinHours
        ? Math.floor(overtimeHours * hourlyRate * overtimeRate)
        : 0;
    return {
        staffId,
        staffName: staff.name,
        month,
        year,
        baseSalary,
        workDays,
        lateDays,
        overtimeHours,
        overtimePay,
        deductions,
        depositDeductions,
        bonuses,
        totalSalary: baseSalary + overtimePay + bonuses - deductions
    };
}
//# sourceMappingURL=StaffService.js.map