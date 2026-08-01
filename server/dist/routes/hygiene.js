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
Object.defineProperty(exports, "__esModule", { value: true });
exports.hygieneRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const HygieneService = __importStar(require("../services/HygieneService"));
const router = (0, express_1.Router)();
exports.hygieneRouter = router;
// ============================================
// 区域管理
// ============================================
// GET /api/hygiene/areas
router.get('/areas', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const areas = await HygieneService.getAreas(storeId);
        res.json({ code: 200, data: { list: areas } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// POST /api/hygiene/areas
router.post('/areas', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const area = await HygieneService.createArea({
            ...req.body,
            storeId: req.user.storeId,
        });
        res.status(201).json({ code: 201, data: area });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/areas/:id
router.put('/areas/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const area = await HygieneService.updateArea(req.params.id, req.body);
        res.json({ code: 200, data: area });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// DELETE /api/hygiene/areas/:id
router.delete('/areas/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await HygieneService.deleteArea(req.params.id);
        res.json({ code: 200, message: 'Area deleted' });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// POST /api/hygiene/areas/init - 初始化预设区域
router.post('/areas/init', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const areas = await HygieneService.initDefaultAreas(req.user.storeId);
        res.json({ code: 200, data: { list: areas } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// ============================================
// 模板管理
// ============================================
// GET /api/hygiene/templates
router.get('/templates', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { areaCode, category, status } = req.query;
        const templates = await HygieneService.getTemplates(storeId, {
            areaCode: areaCode,
            category: category,
            status: status,
        });
        res.json({ code: 200, data: { list: templates } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/templates/:id
router.get('/templates/:id', auth_1.authenticate, async (req, res) => {
    try {
        const template = await HygieneService.getTemplateById(req.params.id, req.user.storeId);
        if (!template)
            return res.status(404).json({ code: 404, message: 'Template not found' });
        res.json({ code: 200, data: template });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// POST /api/hygiene/templates
router.post('/templates', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const template = await HygieneService.createTemplate({
            ...req.body,
            storeId: req.user.storeId,
        });
        res.status(201).json({ code: 201, data: template });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/templates/:id
router.put('/templates/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const template = await HygieneService.updateTemplate(req.params.id, req.body);
        res.json({ code: 200, data: template });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// DELETE /api/hygiene/templates/:id
router.delete('/templates/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await HygieneService.deleteTemplate(req.params.id, req.user.storeId);
        res.json({ code: 200, message: 'Template deleted' });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// POST /api/hygiene/templates/:id/duplicate
router.post('/templates/:id/duplicate', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const template = await HygieneService.duplicateTemplate(req.params.id, req.user.storeId);
        res.status(201).json({ code: 201, data: template });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// POST /api/hygiene/templates/seed - 生成预设模板
router.post('/templates/seed', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const templates = await HygieneService.seedDefaultTemplates(req.user.storeId);
        res.status(201).json({ code: 201, data: { list: templates } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// ============================================
// 任务管理
// ============================================
// GET /api/hygiene/tasks
router.get('/tasks', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { date, shift, areaCode, staffId, status } = req.query;
        if (!date)
            return res.status(400).json({ code: 400, message: 'date required (YYYY-MM-DD)' });
        const tasks = await HygieneService.getTasks(storeId, date, {
            shift: shift,
            areaCode: areaCode,
            staffId: staffId,
            status: status,
        });
        res.json({ code: 200, data: { list: tasks } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/tasks/my - 获取当前员工任务 (必须在 /tasks/:id 前面)
router.get('/tasks/my', auth_1.authenticate, async (req, res) => {
    try {
        const staffId = req.user.staffId;
        if (!staffId)
            return res.status(400).json({ code: 400, message: 'staffId required' });
        const { date } = req.query;
        const tasks = await HygieneService.getTasksByStaff(staffId, date || new Date().toISOString().split('T')[0]);
        res.json({ code: 200, data: { list: tasks } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/tasks/pending - 获取待处理任务
router.get('/tasks/pending', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { staffId } = req.query;
        const tasks = await HygieneService.getPendingTasks(storeId, { staffId: staffId });
        res.json({ code: 200, data: { list: tasks } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/tasks/overdue - 获取逾期任务
router.get('/tasks/overdue', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const tasks = await HygieneService.getOverdueTasks(storeId);
        res.json({ code: 200, data: { list: tasks } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/tasks/history/:staffId - 获取员工任务历史
router.get('/tasks/history/:staffId', auth_1.authenticate, async (req, res) => {
    try {
        const { page = '1', pageSize = '20' } = req.query;
        const pageNum = parseInt(page);
        const pageSizeNum = parseInt(pageSize);
        const result = await HygieneService.getStaffTaskHistory(req.params.staffId, req.user.storeId, pageNum, pageSizeNum);
        res.json({ code: 200, data: result });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// POST /api/hygiene/tasks/temporary - 创建临时任务
router.post('/tasks/temporary', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { name, areaCode, staffId, priority, description, dueTime, date } = req.body;
        const storeId = req.user.storeId;
        // 使用用户提供的日期或默认为今天
        const taskDate = date || new Date().toISOString().split('T')[0];
        const task = await HygieneService.createTemporaryTask(storeId, {
            name,
            areaCode,
            staffId,
            priority,
            description,
            dueTime,
            date: taskDate,
        });
        res.status(201).json({ code: 201, data: task });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/tasks/:id
router.get('/tasks/:id', auth_1.authenticate, async (req, res) => {
    try {
        const task = await HygieneService.getTaskById(req.params.id, req.user.storeId);
        if (!task)
            return res.status(404).json({ code: 404, message: 'Task not found' });
        res.json({ code: 200, data: task });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// POST /api/hygiene/tasks/generate - 手动生成任务
router.post('/tasks/generate', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { date } = req.body;
        // 安全修复：只使用当前用户的 storeId，不允许从请求体传入
        const storeId = req.user.storeId;
        if (!date)
            return res.status(400).json({ code: 400, message: 'date required (YYYY-MM-DD)' });
        const count = await HygieneService.generateDailyTasks(storeId, date);
        res.status(201).json({ code: 201, message: `Generated ${count} tasks`, data: { count } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/tasks/:id/start - 开始执行任务
router.put('/tasks/:id/start', auth_1.authenticate, async (req, res) => {
    try {
        const task = await HygieneService.startTask(req.params.id, req.user.staffId || '', req.user.storeId);
        res.json({ code: 200, data: task });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/tasks/:id/complete - 完成提交任务
router.put('/tasks/:id/complete', auth_1.authenticate, async (req, res) => {
    try {
        const { photoUrl, signatureUrl, note, selfRating, checklistResults } = req.body;
        // Get staff name from staffId
        const staffName = req.user.staffId ? await getStaffName(req.user.staffId) : 'Unknown';
        const task = await HygieneService.completeTask(req.params.id, req.user.staffId || '', staffName, req.user.storeId, {
            photoUrl,
            signatureUrl,
            note,
            selfRating,
            checklistResults,
        });
        res.json({ code: 200, data: task });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/tasks/:id/approve - 主管审核
router.put('/tasks/:id/approve', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { qualityScore, note, reject, rejectReason } = req.body;
        const approverName = req.user.staffId ? await getStaffName(req.user.staffId) : 'Unknown';
        const result = await HygieneService.approveTask(req.params.id, req.user.staffId || '', approverName, req.user.storeId, {
            qualityScore,
            note,
            reject,
            rejectReason,
        });
        res.json({ code: 200, data: result });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/tasks/:id/skip - 跳过任务
router.put('/tasks/:id/skip', auth_1.authenticate, async (req, res) => {
    try {
        const { reason } = req.body;
        const staffName = req.user.staffId ? await getStaffName(req.user.staffId) : 'Unknown';
        const task = await HygieneService.skipTask(req.params.id, req.user.staffId || '', staffName, req.user.storeId, reason);
        res.json({ code: 200, data: task });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/tasks/:id/issue - 上报问题
router.put('/tasks/:id/issue', auth_1.authenticate, async (req, res) => {
    try {
        const { description, photoUrl } = req.body;
        const staffName = req.user.staffId ? await getStaffName(req.user.staffId) : 'Unknown';
        const task = await HygieneService.reportIssue(req.params.id, req.user.staffId || '', staffName, req.user.storeId, {
            description,
            photoUrl,
        });
        res.json({ code: 200, data: task });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// ============================================
// 日志
// ============================================
// GET /api/hygiene/tasks/:id/logs
router.get('/tasks/:id/logs', auth_1.authenticate, async (req, res) => {
    try {
        const logs = await HygieneService.getTaskLogs(req.params.id, req.user.storeId);
        res.json({ code: 200, data: { list: logs } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// ============================================
// 统计
// ============================================
// GET /api/hygiene/stats
router.get('/stats', auth_1.authenticate, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date)
            return res.status(400).json({ code: 400, message: 'date required (YYYY-MM-DD)' });
        const stats = await HygieneService.getStats(req.user.storeId, date);
        res.json({ code: 200, data: stats });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/stats/range
router.get('/stats/range', auth_1.authenticate, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ code: 400, message: 'startDate and endDate required' });
        }
        const stats = await HygieneService.getStatsByRange(req.user.storeId, startDate, endDate);
        res.json({ code: 200, data: stats });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/stats/staff
router.get('/stats/staff', auth_1.authenticate, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ code: 400, message: 'startDate and endDate required' });
        }
        const stats = await HygieneService.getStaffPerformance(req.user.storeId, startDate, endDate);
        res.json({ code: 200, data: { list: stats } });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// ============================================
// 预设数据
// ============================================
// GET /api/hygiene/categories - 获取任务分类（用户配置优先，回退到预设）
router.get('/categories', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.CATEGORIES);
        res.json({ code: 200, data });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/priorities - 获取优先级（用户配置优先，回退到预设）
router.get('/priorities', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.PRIORITIES);
        res.json({ code: 200, data });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/shifts - 获取班次（用户配置优先，回退到预设）
router.get('/shifts', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.SHIFTS);
        res.json({ code: 200, data });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/evidence-types - 获取证据类型（用户配置优先，回退到预设）
router.get('/evidence-types', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.EVIDENCE_TYPES);
        res.json({ code: 200, data });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/weekdays - 获取工作日（用户配置优先，回退到预设）
router.get('/weekdays', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.WEEKDAYS);
        res.json({ code: 200, data });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/frequencies - 获取执行频率（用户配置优先，回退到预设）
router.get('/frequencies', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.FREQUENCIES);
        res.json({ code: 200, data });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/assigned-types - 获取分配方式（用户配置优先，回退到预设）
router.get('/assigned-types', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.ASSIGNED_TYPES);
        res.json({ code: 200, data });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/areas/preset - 获取预设区域
router.get('/areas/preset', auth_1.authenticate, async (req, res) => {
    res.json({ code: 200, data: HygieneService.DEFAULT_AREAS });
});
// ============================================
// 配置管理（用户可自定义）
// ============================================
// GET /api/hygiene/config - 获取所有配置
router.get('/config', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const configs = await HygieneService.getAllHygieneConfigs(storeId);
        res.json({ code: 200, data: configs });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// GET /api/hygiene/config/:key - 获取单个配置
router.get('/config/:key', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const config = await HygieneService.getHygieneConfig(storeId, req.params.key);
        res.json({ code: 200, data: config });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// PUT /api/hygiene/config/:key - 保存配置
router.put('/config/:key', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const config = await HygieneService.setHygieneConfig(storeId, req.params.key, req.body);
        res.json({ code: 200, data: config });
    }
    catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});
// ============================================
// 辅助函数
// ============================================
async function getStaffName(staffId) {
    const prisma = require('../config/database').default;
    const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { name: true },
    });
    return staff?.name || 'Unknown';
}
//# sourceMappingURL=hygiene.js.map