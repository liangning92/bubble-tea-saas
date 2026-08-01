"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// 获取公告列表 (Admin/Manager)
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { storeId } = req.query;
        const where = { isActive: true };
        if (storeId)
            where.storeId = storeId;
        const announcements = await database_1.default.announcement.findMany({
            where,
            orderBy: { priority: 'desc' }
        });
        res.json({ code: 200, data: announcements });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: 'Failed to fetch announcements' });
    }
});
// 创建公告 (Admin)
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { storeId, title, content, type = 'info', priority = 0, startAt, endAt } = req.body;
        if (!storeId || !title || !content) {
            return res.status(400).json({ code: 400, message: 'Missing required fields' });
        }
        const announcement = await database_1.default.announcement.create({
            data: { storeId, title, content, type, priority, startAt: startAt ? new Date(startAt) : undefined, endAt: endAt ? new Date(endAt) : undefined }
        });
        res.json({ code: 200, data: announcement });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: 'Failed to create announcement' });
    }
});
// 删除公告 (Admin)
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await database_1.default.announcement.delete({ where: { id: req.params.id } });
        res.json({ code: 200, message: 'Deleted' });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: 'Failed to delete' });
    }
});
// 更新公告 (Admin)
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { title, content, type, priority, isActive, startAt, endAt } = req.body;
        const announcement = await database_1.default.announcement.update({
            where: { id: req.params.id },
            data: {
                title,
                content,
                type,
                priority,
                isActive,
                startAt: startAt ? new Date(startAt) : undefined,
                endAt: endAt ? new Date(endAt) : undefined
            }
        });
        res.json({ code: 200, data: announcement });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: 'Failed to update announcement' });
    }
});
// 获取当前生效公告 (POS轮询 - 需要认证)
router.get('/active', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId } = req.query;
        if (!storeId) {
            return res.status(400).json({ code: 400, message: 'storeId required' });
        }
        const now = new Date();
        const announcements = await database_1.default.announcement.findMany({
            where: {
                storeId: storeId,
                isActive: true,
                OR: [
                    { startAt: null },
                    { startAt: { lte: now } }
                ],
                AND: [
                    {
                        OR: [
                            { endAt: null },
                            { endAt: { gte: now } }
                        ]
                    }
                ]
            },
            orderBy: { priority: 'desc' }
        });
        res.json({ code: 200, data: announcements });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: 'Failed to fetch active announcements' });
    }
});
// 获取卫生任务提醒 (推送到公告看板 - 需要认证)
router.get('/hygiene/pending', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId } = req.query;
        if (!storeId) {
            return res.status(400).json({ code: 400, message: 'storeId required' });
        }
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        // 获取今日待执行且未完成的卫生任务
        const tasks = await database_1.default.hygieneTask.findMany({
            where: {
                storeId: storeId,
                date: today,
                status: 'pending'
            },
            include: {
                template: true,
                staff: true
            },
            orderBy: { time: 'asc' }
        });
        // 转换为公告格式 - 返回原始数据，让客户端根据i18n格式化
        const hygieneAnnouncements = tasks.map(task => ({
            id: `hygiene-${task.id}`,
            title: task.name,
            content: task.areaCode || '',
            taskTime: task.time || '',
            staffName: task.staff?.name || '',
            type: 'warning',
            priority: 100,
            isActive: true,
            taskId: task.id,
            taskStatus: task.status
        }));
        res.json({ code: 200, data: hygieneAnnouncements });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: 'Failed to fetch hygiene tasks' });
    }
});
exports.default = router;
//# sourceMappingURL=announcement.js.map