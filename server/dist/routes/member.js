"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const storeHelper_1 = require("../utils/storeHelper");
const router = (0, express_1.Router)();
exports.memberRouter = router;
// Validation schemas
const createMemberSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(50),
    phone: zod_1.z.string().min(10).max(15),
    referredByPhone: zod_1.z.string().optional()
});
const updateMemberSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50).optional(),
    level: zod_1.z.string().optional(),
    points: zod_1.z.number().int().optional()
});
const redeemPointsSchema = zod_1.z.object({
    points: zod_1.z.number().int().positive()
});
// GET /api/members
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, level, search } = req.query;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const where = {};
        if (storeId)
            where.storeId = storeId;
        if (level)
            where.level = level;
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } }
            ];
        }
        const [members, total] = await Promise.all([
            database_1.default.member.findMany({
                where,
                include: {
                    _count: { select: { orders: true, pointLogs: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize
            }),
            database_1.default.member.count({ where })
        ]);
        res.json({
            code: 200,
            data: {
                list: members.map(m => ({
                    ...m,
                    orderCount: m._count.orders,
                    _count: undefined
                })),
                pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get members' });
    }
});
// GET /api/members/barcode/:barcode - Get member by barcode/card number
router.get('/barcode/:barcode', auth_1.authenticate, async (req, res) => {
    try {
        const { barcode } = req.params;
        const storeId = (0, storeHelper_1.getStoreId)(req);
        // Look up member by phone (assuming phone is used as member card number)
        // Or by memberCard field if it exists
        const member = await database_1.default.member.findFirst({
            where: {
                storeId,
                OR: [
                    { phone: barcode },
                    { id: barcode }
                ]
            }
        });
        if (!member) {
            return res.status(404).json({ code: 404, message: 'Member not found' });
        }
        res.json({
            code: 200,
            data: {
                id: member.id,
                name: member.name,
                phone: member.phone,
                level: member.level,
                points: member.points
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get member by barcode error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get member by barcode' });
    }
});
// GET /api/members/:id
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { type, limit } = req.query;
        // Build pointLogs where clause
        const pointLogsWhere = {};
        if (type)
            pointLogsWhere.type = type;
        const member = await database_1.default.member.findUnique({
            where: { id },
            include: {
                orders: { orderBy: { createdAt: 'desc' }, take: 20 },
                pointLogs: {
                    where: pointLogsWhere,
                    orderBy: { createdAt: 'desc' },
                    take: limit ? parseInt(limit) : 50
                }
            }
        });
        if (!member) {
            return res.status(404).json({ code: 404, message: 'Member not found' });
        }
        res.json({
            code: 200,
            data: member,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get member error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get member' });
    }
});
// GET /api/members/phone/:phone
router.get('/phone/:phone', auth_1.authenticate, async (req, res) => {
    try {
        const { phone } = req.params;
        const member = await database_1.default.member.findUnique({
            where: { phone },
            include: {
                _count: { select: { orders: true } }
            }
        });
        if (!member) {
            return res.status(404).json({ code: 404, message: 'Member not found' });
        }
        res.json({
            code: 200,
            data: {
                ...member,
                orderCount: member._count.orders,
                _count: undefined
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get member by phone error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get member' });
    }
});
// 生成6位随机推荐码
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
// POST /api/members
router.post('/', auth_1.authenticate, (0, validation_1.validateBody)(createMemberSchema), async (req, res) => {
    try {
        const { storeId, name, phone, referredByPhone } = req.body;
        // Check if phone exists
        const existing = await database_1.default.member.findUnique({ where: { phone } });
        if (existing) {
            return res.status(400).json({ code: 400, message: 'Phone number already registered' });
        }
        // 自动生成推荐码
        const referralCode = generateReferralCode();
        // 如果有推荐人手机号，找到推荐人
        let referredById = null;
        if (referredByPhone) {
            const referrer = await database_1.default.member.findUnique({ where: { phone: referredByPhone } });
            referredById = referrer?.id || null;
        }
        const member = await database_1.default.member.create({
            data: {
                storeId,
                name,
                phone,
                referralCode,
                referredBy: referredById
            }
        });
        // Create welcome point log
        await database_1.default.pointLog.create({
            data: {
                memberId: member.id,
                type: 'earn',
                points: 100, // Welcome bonus
                note: 'Welcome bonus'
            }
        });
        await database_1.default.member.update({
            where: { id: member.id },
            data: { points: 100 }
        });
        // 如果有推荐人，给推荐人奖励
        if (referredById) {
            await database_1.default.pointLog.create({
                data: {
                    memberId: referredById,
                    type: 'earn',
                    points: 500, // 推荐奖励
                    note: `推荐奖励: ${name}`
                }
            });
            await database_1.default.member.update({
                where: { id: referredById },
                data: { points: { increment: 500 } }
            });
        }
        res.status(201).json({
            code: 201,
            message: 'Member created',
            data: {
                ...member,
                points: 100,
                welcomePoints: 100,
                referralCode: referralCode,
                referredByReward: referredById ? 500 : null
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create member error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create member' });
    }
});
// PUT /api/members/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, level, points } = req.body;
        const member = await database_1.default.member.update({
            where: { id },
            data: { name, level, ...(points !== undefined && { points }) }
        });
        res.json({
            code: 200,
            message: 'Member updated',
            data: member,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update member' });
    }
});
// DELETE /api/members/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await database_1.default.member.delete({ where: { id } });
        res.json({
            code: 200,
            message: 'Member deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete member error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete member' });
    }
});
// POST /api/members/:id/redeem
router.post('/:id/redeem', auth_1.authenticate, (0, validation_1.validateBody)(redeemPointsSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { points } = req.body;
        const member = await database_1.default.member.findUnique({ where: { id } });
        if (!member) {
            return res.status(404).json({ code: 404, message: 'Member not found' });
        }
        if (member.points < points) {
            return res.status(400).json({ code: 400, message: 'Insufficient points' });
        }
        await database_1.default.member.update({
            where: { id },
            data: { points: { decrement: points } }
        });
        await database_1.default.pointLog.create({
            data: {
                memberId: id,
                type: 'redeem',
                points: -points,
                note: `Redeemed ${points} points`
            }
        });
        res.json({
            code: 200,
            message: 'Points redeemed',
            data: { remainingPoints: member.points - points },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Redeem points error:', error);
        res.status(500).json({ code: 500, message: 'Failed to redeem points' });
    }
});
// GET /api/members/:id/points-history
router.get('/:id/points-history', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const logs = await database_1.default.pointLog.findMany({
            where: { memberId: id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json({
            code: 200,
            data: logs,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get points history error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get points history' });
    }
});
// POST /api/members/:id/adjust-points
router.post('/:id/adjust-points', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { points, note } = req.body;
        const member = await database_1.default.member.findUnique({ where: { id } });
        if (!member) {
            return res.status(404).json({ code: 404, message: 'Member not found' });
        }
        const newPoints = Math.max(0, member.points + points);
        await database_1.default.member.update({
            where: { id },
            data: { points: newPoints }
        });
        await database_1.default.pointLog.create({
            data: {
                memberId: id,
                type: 'adjust',
                points,
                note: note || 'Manual adjustment'
            }
        });
        res.json({
            code: 200,
            message: 'Points adjusted',
            data: { newPoints },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Adjust points error:', error);
        res.status(500).json({ code: 500, message: 'Failed to adjust points' });
    }
});
// GET /api/members/stats/summary
router.get('/stats/summary', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId } = req.query;
        const where = {};
        if (storeId)
            where.storeId = storeId;
        const [totalMembers, byLevel, recentActivity] = await Promise.all([
            database_1.default.member.count({ where }),
            database_1.default.member.groupBy({
                by: ['level'],
                where,
                _count: { id: true }
            }),
            database_1.default.member.count({
                where: {
                    ...where,
                    lastVisit: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }
            })
        ]);
        res.json({
            code: 200,
            data: {
                totalMembers,
                activeLast30Days: recentActivity,
                byLevel: byLevel.map(l => ({ level: l.level, count: l._count.id })),
                newThisMonth: await database_1.default.member.count({
                    where: {
                        ...where,
                        createdAt: { gte: new Date(new Date().setDate(1)) }
                    }
                })
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get member stats error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get member stats' });
    }
});
//# sourceMappingURL=member.js.map