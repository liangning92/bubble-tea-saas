"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WEEKDAYS = exports.DEFAULT_ASSIGNED_TYPES = exports.DEFAULT_FREQUENCIES = exports.HYGIENE_CONFIG_KEYS = exports.DEFAULT_EVIDENCE_TYPES = exports.DEFAULT_SHIFTS = exports.DEFAULT_PRIORITIES = exports.DEFAULT_CATEGORIES = exports.DEFAULT_AREAS = void 0;
exports.getHygieneConfig = getHygieneConfig;
exports.setHygieneConfig = setHygieneConfig;
exports.getAllHygieneConfigs = getAllHygieneConfigs;
exports.getAreas = getAreas;
exports.createArea = createArea;
exports.updateArea = updateArea;
exports.deleteArea = deleteArea;
exports.initDefaultAreas = initDefaultAreas;
exports.getTemplates = getTemplates;
exports.getTemplateById = getTemplateById;
exports.createTemplate = createTemplate;
exports.updateTemplate = updateTemplate;
exports.deleteTemplate = deleteTemplate;
exports.duplicateTemplate = duplicateTemplate;
exports.getTasks = getTasks;
exports.getTasksByStaff = getTasksByStaff;
exports.getPendingTasks = getPendingTasks;
exports.getTaskById = getTaskById;
exports.generateDailyTasks = generateDailyTasks;
exports.startTask = startTask;
exports.completeTask = completeTask;
exports.approveTask = approveTask;
exports.skipTask = skipTask;
exports.reportIssue = reportIssue;
exports.getOverdueTasks = getOverdueTasks;
exports.getStaffTaskHistory = getStaffTaskHistory;
exports.createTemporaryTask = createTemporaryTask;
exports.getTaskLogs = getTaskLogs;
exports.getStats = getStats;
exports.getStatsByRange = getStatsByRange;
exports.getStaffPerformance = getStaffPerformance;
exports.processDueTemplates = processDueTemplates;
exports.seedDefaultTemplates = seedDefaultTemplates;
const database_1 = __importDefault(require("../config/database"));
const socket_1 = require("../socket");
// ============================================
// 预设值（用于新店铺或回退）
// ============================================
exports.DEFAULT_AREAS = [
    { code: 'counter', name: '柜台 / Counter', icon: '🧾', color: '#FF6B6B', priority: 1 },
    { code: 'kitchen', name: '后厨 / Kitchen', icon: '🍳', color: '#4ECDC4', priority: 2 },
    { code: 'ingredients', name: '原料区 / Ingredients', icon: '🧋', color: '#45B7D1', priority: 3 },
    { code: 'floor', name: '地面 / Floor', icon: '🧹', color: '#96CEB4', priority: 4 },
    { code: 'restroom', name: '卫生间 / Restroom', icon: '🚻', color: '#DDA0DD', priority: 5 },
    { code: 'waste', name: '垃圾区 / Waste', icon: '🗑️', color: '#FFEAA7', priority: 6 },
    { code: 'equipment', name: '设备区 / Equipment', icon: '⚙️', color: '#74B9FF', priority: 7 },
    { code: 'ventilation', name: '通风/空调 / Ventilation', icon: '💨', color: '#A29BFE', priority: 8 },
];
exports.DEFAULT_CATEGORIES = [
    { value: 'food_safety', label: 'Food Safety', labelZh: '食品安全', icon: '⚠️', color: '#FF0000' },
    { value: 'daily', label: 'Daily Cleaning', labelZh: '日常清洁', icon: '🧹', color: '#FFA500' },
    { value: 'equipment', label: 'Equipment', labelZh: '设备维护', icon: '🔧', color: '#00BFFF' },
    { value: 'periodic', label: 'Periodic', labelZh: '周期维护', icon: '📅', color: '#9370DB' },
    { value: 'opening', label: 'Opening', labelZh: '开业准备', icon: '🌅', color: '#32CD32' },
    { value: 'closing', label: 'Closing', labelZh: '闭店检查', icon: '🌙', color: '#8B0000' },
];
exports.DEFAULT_PRIORITIES = [
    { value: 1, label: 'Critical', labelZh: '紧急', color: '#FF0000' },
    { value: 2, label: 'High', labelZh: '重要', color: '#FFA500' },
    { value: 3, label: 'Normal', labelZh: '一般', color: '#00BFFF' },
    { value: 4, label: 'Low', labelZh: '低', color: '#808080' },
];
exports.DEFAULT_SHIFTS = [
    { value: 'morning', label: 'Morning', labelZh: '早班', time: '09:00-17:00' },
    { value: 'afternoon', label: 'Afternoon', labelZh: '午班', time: '14:00-22:00' },
    { value: 'evening', label: 'Evening', labelZh: '晚班', time: '22:00-06:00' },
];
exports.DEFAULT_EVIDENCE_TYPES = [
    { value: 'photo', label: 'Photo', labelZh: '拍照', icon: '📷' },
    { value: 'signature', label: 'Signature', labelZh: '签名', icon: '✍️' },
    { value: 'both', label: 'Photo + Signature', labelZh: '拍照+签名', icon: '📝' },
];
// 配置项 Key 常量
exports.HYGIENE_CONFIG_KEYS = {
    CATEGORIES: 'categories',
    PRIORITIES: 'priorities',
    SHIFTS: 'shifts',
    EVIDENCE_TYPES: 'evidence_types',
    WEEKDAYS: 'weekdays',
    FREQUENCIES: 'frequencies',
    ASSIGNED_TYPES: 'assigned_types',
};
// 默认执行频率配置
exports.DEFAULT_FREQUENCIES = [
    { value: 'daily', label: 'Daily', labelZh: '每日', icon: '📅' },
    { value: 'weekly', label: 'Weekly', labelZh: '每周', icon: '📆' },
    { value: 'monthly', label: 'Monthly', labelZh: '每月', icon: '🗓️' },
    { value: 'specific_days', label: 'Specific Days', labelZh: '特定日期', icon: '📌' },
];
// 默认分配方式配置
exports.DEFAULT_ASSIGNED_TYPES = [
    { value: 'shift', label: 'By Shift', labelZh: '按班次', icon: '👥' },
    { value: 'staff', label: 'By Staff', labelZh: '指定员工', icon: '👤' },
    { value: 'area', label: 'By Area', labelZh: '按区域', icon: '📍' },
];
// 默认工作日配置
exports.DEFAULT_WEEKDAYS = [
    { value: 1, label: 'Monday', labelZh: '周一', short: 'Mon' },
    { value: 2, label: 'Tuesday', labelZh: '周二', short: 'Tue' },
    { value: 3, label: 'Wednesday', labelZh: '周三', short: 'Wed' },
    { value: 4, label: 'Thursday', labelZh: '周四', short: 'Thu' },
    { value: 5, label: 'Friday', labelZh: '周五', short: 'Fri' },
    { value: 6, label: 'Saturday', labelZh: '周六', short: 'Sat' },
    { value: 0, label: 'Sunday', labelZh: '周日', short: 'Sun' },
];
// ============================================
// 卫生配置管理（完全用户可配置）
// ============================================
/**
 * 获取店铺的卫生配置（用户自定义配置）
 */
async function getHygieneConfig(storeId, key) {
    const config = await database_1.default.hygieneConfig.findUnique({
        where: { storeId_key: { storeId, key } },
    });
    if (config) {
        return JSON.parse(config.value);
    }
    // 回退到默认值
    return getDefaultConfig(key);
}
/**
 * 获取默认值
 */
function getDefaultConfig(key) {
    switch (key) {
        case exports.HYGIENE_CONFIG_KEYS.CATEGORIES: return exports.DEFAULT_CATEGORIES;
        case exports.HYGIENE_CONFIG_KEYS.PRIORITIES: return exports.DEFAULT_PRIORITIES;
        case exports.HYGIENE_CONFIG_KEYS.SHIFTS: return exports.DEFAULT_SHIFTS;
        case exports.HYGIENE_CONFIG_KEYS.EVIDENCE_TYPES: return exports.DEFAULT_EVIDENCE_TYPES;
        case exports.HYGIENE_CONFIG_KEYS.WEEKDAYS: return exports.DEFAULT_WEEKDAYS;
        case exports.HYGIENE_CONFIG_KEYS.FREQUENCIES: return exports.DEFAULT_FREQUENCIES;
        case exports.HYGIENE_CONFIG_KEYS.ASSIGNED_TYPES: return exports.DEFAULT_ASSIGNED_TYPES;
        default: return [];
    }
}
/**
 * 保存卫生配置（用户自定义）- 合并模式
 * 用户配置会覆盖默认值，保留默认值的其他项
 */
async function setHygieneConfig(storeId, key, userValues) {
    // 获取默认配置
    const defaultConfig = getDefaultConfig(key);
    // 将用户配置转换为 Map（按 value 字段去重）
    const userConfigMap = new Map();
    for (const item of userValues) {
        if (item.value !== undefined) {
            userConfigMap.set(item.value, item);
        }
    }
    // 合并：默认配置为基础，用户配置覆盖/添加
    // 默认配置项保留，用户配置中有相同 value 的覆盖，默认配置中没有的用户配置添加
    const mergedConfig = [];
    const mergedValues = new Set();
    // 先添加所有默认配置（用户配置覆盖的部分会被覆盖）
    for (const defaultItem of defaultConfig) {
        if (userConfigMap.has(defaultItem.value)) {
            // 用户有覆盖，使用用户配置
            mergedConfig.push(userConfigMap.get(defaultItem.value));
            mergedValues.add(defaultItem.value);
        }
        else {
            // 保留默认配置
            mergedConfig.push(defaultItem);
        }
    }
    // 添加用户配置中的新项（默认配置没有的）
    for (const userItem of userValues) {
        if (!mergedValues.has(userItem.value)) {
            mergedConfig.push(userItem);
        }
    }
    const jsonValue = JSON.stringify(mergedConfig);
    return database_1.default.hygieneConfig.upsert({
        where: { storeId_key: { storeId, key } },
        create: { storeId, key, value: jsonValue },
        update: { value: jsonValue },
    });
}
/**
 * 获取所有卫生配置
 */
async function getAllHygieneConfigs(storeId) {
    const configs = await database_1.default.hygieneConfig.findMany({ where: { storeId } });
    const result = {};
    for (const key of Object.values(exports.HYGIENE_CONFIG_KEYS)) {
        result[key] = await getHygieneConfig(storeId, key);
    }
    return result;
}
// ============================================
// 区域管理
// ============================================
/**
 * 获取店铺所有区域（包含预设区域）
 */
async function getAreas(storeId) {
    // 获取自定义区域
    const customAreas = await database_1.default.hygieneArea.findMany({
        where: { storeId, isActive: true },
        orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
    });
    // 合并预设区域（标记哪些已自定义）
    const customCodes = new Set(customAreas.map(a => a.code));
    const defaultAreas = exports.DEFAULT_AREAS.filter(a => !customCodes.has(a.code));
    // 标记默认区域（未自定义的）
    const result = [
        ...customAreas.map(a => ({ ...a, isCustom: true })),
        ...defaultAreas.map(a => ({
            id: null,
            storeId,
            code: a.code,
            name: a.name,
            icon: a.icon,
            color: a.color,
            priority: a.priority,
            description: null,
            managerId: null,
            isActive: true,
            sortOrder: a.priority,
            isCustom: false,
        })),
    ];
    return result.sort((a, b) => a.priority - b.priority);
}
/**
 * 创建自定义区域
 */
async function createArea(data) {
    // 验证必填字段
    if (!data.name || data.name.trim() === '') {
        throw new Error('Area name is required');
    }
    if (!data.code || data.code.trim() === '') {
        throw new Error('Area code is required');
    }
    if (!data.storeId || data.storeId.trim() === '') {
        throw new Error('Store ID is required');
    }
    // 验证代码格式（只能是字母、数字、下划线）
    if (!/^[a-zA-Z0-9_]+$/.test(data.code)) {
        throw new Error('Area code can only contain letters, numbers, and underscores');
    }
    // 检查代码是否与预设冲突
    const existing = await database_1.default.hygieneArea.findUnique({
        where: { storeId_code: { storeId: data.storeId, code: data.code } },
    });
    if (existing) {
        throw new Error('Area code already exists');
    }
    // 获取当前最大 sortOrder
    const maxOrder = await database_1.default.hygieneArea.aggregate({
        where: { storeId: data.storeId },
        _max: { sortOrder: true },
    });
    return database_1.default.hygieneArea.create({
        data: {
            ...data,
            sortOrder: data.priority || (maxOrder._max.sortOrder || 0) + 1,
        },
    });
}
/**
 * 更新区域
 */
async function updateArea(areaId, data) {
    // 检查区域是否存在
    const existing = await database_1.default.hygieneArea.findUnique({
        where: { id: areaId },
    });
    if (!existing) {
        throw new Error('Area not found');
    }
    return database_1.default.hygieneArea.update({
        where: { id: areaId },
        data,
    });
}
/**
 * 删除区域
 */
async function deleteArea(areaId) {
    // 检查区域是否存在
    const area = await database_1.default.hygieneArea.findUnique({
        where: { id: areaId },
    });
    if (!area) {
        throw new Error('Area not found');
    }
    // 检查是否有任务引用该区域
    const taskCount = await database_1.default.hygieneTask.count({
        where: { areaCode: areaId },
    });
    if (taskCount > 0) {
        throw new Error(`Cannot delete area: ${taskCount} tasks are using this area`);
    }
    // 检查是否有模板引用该区域
    const templateCount = await database_1.default.hygieneTemplate.count({
        where: { areaCode: areaId },
    });
    if (templateCount > 0) {
        throw new Error(`Cannot delete area: ${templateCount} templates are using this area`);
    }
    return database_1.default.hygieneArea.delete({
        where: { id: areaId },
    });
}
/**
 * 初始化店铺预设区域（首次使用）
 */
async function initDefaultAreas(storeId) {
    const existing = await database_1.default.hygieneArea.findFirst({
        where: { storeId },
    });
    if (existing)
        return existing; // 已初始化
    const areas = exports.DEFAULT_AREAS.map((a, idx) => ({
        storeId,
        name: a.name,
        code: a.code,
        icon: a.icon,
        color: a.color,
        priority: a.priority,
        sortOrder: idx,
        isActive: true,
    }));
    await database_1.default.hygieneArea.createMany({ data: areas });
    return getAreas(storeId);
}
// ============================================
// 模板管理
// ============================================
/**
 * 获取模板列表
 */
async function getTemplates(storeId, options) {
    const where = { storeId };
    if (options?.areaCode)
        where.areaCode = options.areaCode;
    if (options?.category)
        where.category = options.category;
    if (options?.status)
        where.status = options.status;
    return database_1.default.hygieneTemplate.findMany({
        where,
        include: {
            checklists: { orderBy: { order: 'asc' } },
        },
        orderBy: [{ priority: 'asc' }, { time: 'asc' }],
    });
}
/**
 * 获取单个模板
 */
async function getTemplateById(id, storeId) {
    const where = { id };
    if (storeId) {
        where.storeId = storeId;
    }
    const template = await database_1.default.hygieneTemplate.findUnique({
        where,
        include: {
            checklists: { orderBy: { order: 'asc' } },
        },
    });
    if (storeId && template && template.storeId !== storeId) {
        throw new Error('Template not found');
    }
    return template;
}
/**
 * 创建模板
 */
async function createTemplate(data) {
    // 验证必填字段
    if (!data.storeId || data.storeId.trim() === '') {
        throw new Error('Store ID is required');
    }
    if (!data.areaCode || data.areaCode.trim() === '') {
        throw new Error('Area code is required');
    }
    if (!data.name || data.name.trim() === '') {
        throw new Error('Template name is required');
    }
    // 验证 priority 范围
    if (data.priority !== undefined && (data.priority < 1 || data.priority > 4)) {
        throw new Error('Priority must be between 1 and 4');
    }
    // 验证 estimatedMinutes 范围
    if (data.estimatedMinutes !== undefined && data.estimatedMinutes < 1) {
        throw new Error('Estimated minutes must be greater than 0');
    }
    const { checklists, staffIds, executionTimes, ...templateData } = data;
    // 处理 JSON 字段
    const processed = {
        ...templateData,
        toolsRequired: templateData.toolsRequired ? JSON.stringify(templateData.toolsRequired) : null,
        specificDays: templateData.specificDays ? JSON.stringify(templateData.specificDays) : null,
        executionTimes: executionTimes ? JSON.stringify(executionTimes) : null, // 新增
        staffIds: staffIds ? JSON.stringify(staffIds) : null, // 新增
    };
    // 计算下次触发时间
    processed.nextTriggerAt = calculateNextTrigger(templateData.frequency, templateData.time);
    const template = await database_1.default.hygieneTemplate.create({
        data: {
            ...processed,
            checklists: checklists ? {
                create: checklists.map((c, idx) => ({
                    item: c.item,
                    description: c.description,
                    isRequired: c.isRequired ?? true,
                    order: idx,
                })),
            } : undefined,
        },
        include: { checklists: { orderBy: { order: 'asc' } } },
    });
    // 广播到前台
    socket_1.socketManager.emitToStore(templateData.storeId, 'hygiene:template:created', template);
    return template;
}
/**
 * 更新模板
 */
async function updateTemplate(templateId, data) {
    // 检查模板是否存在
    const existing = await database_1.default.hygieneTemplate.findUnique({
        where: { id: templateId },
    });
    if (!existing) {
        throw new Error('Template not found');
    }
    const { checklists, staffIds, executionTimes, ...templateData } = data;
    // 处理 JSON 字段
    const processed = { ...templateData };
    if (templateData.toolsRequired !== undefined) {
        processed.toolsRequired = templateData.toolsRequired ? JSON.stringify(templateData.toolsRequired) : null;
    }
    if (templateData.specificDays !== undefined) {
        processed.specificDays = templateData.specificDays ? JSON.stringify(templateData.specificDays) : null;
    }
    if (staffIds !== undefined) {
        processed.staffIds = staffIds ? JSON.stringify(staffIds) : null;
    }
    if (executionTimes !== undefined) {
        processed.executionTimes = executionTimes ? JSON.stringify(executionTimes) : null;
    }
    // 如果频率或时间变了，重新计算触发时间
    if (templateData.frequency || templateData.time) {
        processed.nextTriggerAt = calculateNextTrigger(templateData.frequency, templateData.time);
    }
    // 更新检查清单（先删后建）
    if (checklists !== undefined) {
        await database_1.default.hygieneChecklist.deleteMany({ where: { templateId } });
    }
    const template = await database_1.default.hygieneTemplate.update({
        where: { id: templateId },
        data: {
            ...processed,
            ...(checklists ? {
                checklists: {
                    create: checklists.map((c, idx) => ({
                        item: c.item,
                        description: c.description,
                        isRequired: c.isRequired ?? true,
                        order: idx,
                    })),
                },
            } : {}),
        },
        include: { checklists: { orderBy: { order: 'asc' } } },
    });
    // 广播更新
    socket_1.socketManager.emitToStore(template.storeId, 'hygiene:template:updated', template);
    return template;
}
/**
 * 删除模板（软删除）
 */
async function deleteTemplate(templateId, storeId) {
    const template = await database_1.default.hygieneTemplate.findUnique({
        where: { id: templateId },
    });
    if (!template)
        throw new Error('Template not found');
    // 验证店铺归属
    if (template.storeId !== storeId) {
        throw new Error('Template not found');
    }
    const updated = await database_1.default.hygieneTemplate.update({
        where: { id: templateId },
        data: { status: 'paused' },
    });
    socket_1.socketManager.emitToStore(template.storeId, 'hygiene:template:deleted', { id: templateId });
    return updated;
}
/**
 * 复制模板
 */
async function duplicateTemplate(templateId, storeId, newStoreId) {
    const original = await getTemplateById(templateId, storeId);
    if (!original)
        throw new Error('Template not found');
    const { id, createdAt, updatedAt, checklists, areaCode, name, description, category, frequency, specificDays, time, priority, estimatedMinutes, standardBefore, standardDuring, standardAfter, toolsRequired, photoRequired, evidenceType, assignedType, shift, staffId, areaManagerId, requiresApproval, alertMinutesBefore, autoGenerate, regulationCode } = original;
    return createTemplate({
        storeId: newStoreId || storeId,
        areaCode,
        name: `${name} (Copy)`,
        description,
        category,
        frequency,
        specificDays: specificDays ? JSON.parse(specificDays) : undefined,
        time,
        priority,
        estimatedMinutes,
        standardBefore,
        standardDuring,
        standardAfter,
        toolsRequired: toolsRequired ? JSON.parse(toolsRequired) : undefined,
        photoRequired,
        evidenceType,
        assignedType,
        shift,
        staffId,
        areaManagerId,
        requiresApproval,
        alertMinutesBefore,
        autoGenerate,
        regulationCode,
        checklists: checklists.map(c => ({
            item: c.item,
            description: c.description || undefined,
            isRequired: c.isRequired,
        })),
    });
}
// ============================================
// 任务管理
// ============================================
/**
 * 获取某日任务
 */
async function getTasks(storeId, date, options) {
    const where = { storeId, date };
    if (options?.shift)
        where.shift = options.shift;
    if (options?.areaCode)
        where.areaCode = options.areaCode;
    if (options?.staffId)
        where.staffId = options.staffId;
    if (options?.status)
        where.status = options.status;
    return database_1.default.hygieneTask.findMany({
        where,
        include: {
            staff: { select: { id: true, name: true } },
            template: { select: { id: true, name: true, photoRequired: true, evidenceType: true, requiresApproval: true } },
            logs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
        orderBy: [{ priority: 'asc' }, { time: 'asc' }],
    });
}
/**
 * 获取员工任务
 */
async function getTasksByStaff(staffId, date) {
    return database_1.default.hygieneTask.findMany({
        where: { staffId, date },
        include: {
            template: {
                select: {
                    id: true,
                    name: true,
                    photoRequired: true,
                    evidenceType: true,
                    requiresApproval: true,
                    checklists: { orderBy: { order: 'asc' } },
                },
            },
            logs: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
        orderBy: [{ priority: 'asc' }, { time: 'asc' }],
    });
}
/**
 * 获取待处理任务
 */
async function getPendingTasks(storeId, options) {
    const today = new Date().toISOString().split('T')[0];
    const where = { storeId, date: today, status: 'pending' };
    if (options?.staffId)
        where.staffId = options.staffId;
    return database_1.default.hygieneTask.findMany({
        where,
        include: {
            staff: { select: { id: true, name: true } },
            template: { select: { id: true, name: true, areaCode: true, priority: true } },
        },
        orderBy: [{ priority: 'asc' }, { time: 'asc' }],
    });
}
/**
 * 获取单个任务详情
 */
async function getTaskById(taskId, storeId) {
    const where = { id: taskId };
    if (storeId) {
        where.storeId = storeId;
    }
    const task = await database_1.default.hygieneTask.findUnique({
        where,
        include: {
            staff: { select: { id: true, name: true } },
            template: {
                select: {
                    id: true,
                    name: true,
                    areaCode: true,
                    priority: true,
                    photoRequired: true,
                    evidenceType: true,
                    requiresApproval: true,
                    estimatedMinutes: true,
                    toolsRequired: true,
                    checklists: { orderBy: { order: 'asc' } },
                },
            },
            logs: { orderBy: { createdAt: 'desc' } },
        },
    });
    if (storeId && task && task.storeId !== storeId) {
        throw new Error('Task not found');
    }
    return task;
}
/**
 * 生成每日任务（手动触发）
 */
async function generateDailyTasks(storeId, date) {
    const templates = await database_1.default.hygieneTemplate.findMany({
        where: { storeId, status: 'active', autoGenerate: true },
    });
    const createdTasks = [];
    for (const template of templates) {
        // 检查是否应该在这天生成
        if (!shouldGenerateOnDate(template, date))
            continue;
        // 获取执行时间列表（支持多次执行）
        const executionTimes = getExecutionTimes(template);
        // 根据 assignedType 获取员工列表（支持多个员工）
        const staffIds = await resolveStaffIds(template, storeId);
        for (const staffId of staffIds) {
            // 遍历每个执行时间
            for (let timeIdx = 0; timeIdx < executionTimes.length; timeIdx++) {
                const execTime = executionTimes[timeIdx];
                // 检查今天是否已为此模板+员工+执行时间创建过任务
                const existing = await database_1.default.hygieneTask.findFirst({
                    where: {
                        templateId: template.id,
                        staffId,
                        date,
                        executionIndex: timeIdx
                    },
                });
                if (existing)
                    continue;
                // 计算截止时间（执行时间 + 预计完成时间）
                const [year, month, day] = date.split('-').map(Number);
                const [hours, mins] = execTime.split(':').map(Number);
                const estimated = template.estimatedMinutes || 10;
                // 使用 Date 构造函数直接创建本地时间
                const dueTime = new Date(year, month - 1, day, hours, mins + estimated, 0, 0);
                const task = await database_1.default.hygieneTask.create({
                    data: {
                        storeId,
                        templateId: template.id,
                        staffId,
                        areaCode: template.areaCode,
                        name: template.name,
                        date,
                        time: execTime,
                        priority: template.priority,
                        status: 'pending',
                        executionIndex: timeIdx,
                        dueTime: dueTime,
                    },
                });
                await createTaskLog(task.id, staffId, 'created', null, null, `Task auto-generated from template: ${template.name}${executionTimes.length > 1 ? ` (${timeIdx + 1}/${executionTimes.length})` : ''}`);
                createdTasks.push(task);
            }
        }
    }
    if (createdTasks.length > 0) {
        socket_1.socketManager.emitToStore(storeId, 'hygiene:tasks:generated', { date, count: createdTasks.length });
    }
    return createdTasks.length;
}
/**
 * 获取模板的执行时间列表（支持多次执行）
 */
function getExecutionTimes(template) {
    // 优先使用 executionTimes 字段
    if (template.executionTimes) {
        try {
            const times = JSON.parse(template.executionTimes);
            if (Array.isArray(times) && times.length > 0) {
                return times.sort(); // 按时间排序
            }
        }
        catch { /* ignore */ }
    }
    // 回退到单时间字段
    return [template.time || '10:00'];
}
/**
 * 开始执行任务
 */
async function startTask(taskId, staffId, storeId) {
    const existingTask = await database_1.default.hygieneTask.findUnique({
        where: { id: taskId },
    });
    if (!existingTask)
        throw new Error('Task not found');
    // 验证任务属于当前店铺
    if (existingTask.storeId !== storeId) {
        throw new Error('Task not found');
    }
    // 只能对待执行状态的任务开始执行
    if (existingTask.status !== 'pending') {
        throw new Error(`Cannot start task: invalid status "${existingTask.status}" (expected "pending")`);
    }
    const task = await database_1.default.hygieneTask.update({
        where: { id: taskId },
        data: {
            status: 'in_progress',
            startedAt: new Date(),
        },
    });
    await createTaskLog(task.id, staffId, 'started', null, null, 'Task execution started');
    return task;
}
/**
 * 完成提交任务
 */
async function completeTask(taskId, staffId, staffName, storeId, data) {
    // 先获取任务和模板信息
    const existingTask = await database_1.default.hygieneTask.findUnique({
        where: { id: taskId },
        include: { template: { select: { requiresApproval: true, estimatedMinutes: true } } },
    });
    if (!existingTask)
        throw new Error('Task not found');
    // 验证任务属于当前店铺
    if (existingTask.storeId !== storeId) {
        throw new Error('Task not found');
    }
    // 只能对正在执行状态的任务提交
    if (existingTask.status !== 'in_progress') {
        throw new Error(`Cannot complete task: invalid status "${existingTask.status}" (expected "in_progress")`);
    }
    // 验证 selfRating 范围
    if (data.selfRating !== undefined && (data.selfRating < 1 || data.selfRating > 5)) {
        throw new Error('selfRating must be between 1 and 5');
    }
    const requiresApproval = existingTask.template?.requiresApproval ?? false;
    const newStatus = requiresApproval ? 'pending_approval' : 'completed';
    // 计算实际耗时（如果有开始时间）
    let actualMinutes = null;
    if (existingTask.startedAt) {
        const startedAt = new Date(existingTask.startedAt);
        const completedAt = new Date();
        actualMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
    }
    const task = await database_1.default.hygieneTask.update({
        where: { id: taskId },
        data: {
            status: newStatus,
            completedAt: new Date(),
            completedBy: staffId,
            photoUrl: data.photoUrl,
            signatureUrl: data.signatureUrl,
            note: data.note,
            selfRating: data.selfRating,
            actualMinutes,
        },
    });
    await createTaskLog(task.id, staffId, 'completed', data.photoUrl, staffName, data.note || `Task completed (self-rating: ${data.selfRating || 'N/A'})`);
    // 如果需要审核，通知主管
    if (requiresApproval) {
        socket_1.socketManager.emitToStore(task.storeId, 'hygiene:task:needs_approval', {
            taskId: task.id,
            taskName: task.name,
            areaCode: task.areaCode,
            completedBy: staffName,
        });
    }
    else {
        // 不需要审核，直接广播完成
        socket_1.socketManager.emitToStore(task.storeId, 'hygiene:task:completed', task);
    }
    return task;
}
/**
 * 主管审核任务（支持批准或驳回重做）
 */
async function approveTask(taskId, approverId, approverName, storeId, data) {
    const task = await database_1.default.hygieneTask.findUnique({
        where: { id: taskId },
        include: { template: true }
    });
    if (!task)
        throw new Error('Task not found');
    // 验证任务属于当前店铺
    if (task.storeId !== storeId) {
        throw new Error('Task not found');
    }
    // 只能对待审核状态的任务进行审核
    if (task.status !== 'pending_approval') {
        throw new Error(`Cannot approve task: invalid status "${task.status}" (expected "pending_approval")`);
    }
    // 验证 qualityScore 范围
    if (data.qualityScore < 1 || data.qualityScore > 5) {
        throw new Error('qualityScore must be between 1 and 5');
    }
    // 驳回时必须提供原因
    if (data.reject && (!data.rejectReason || data.rejectReason.trim() === '')) {
        throw new Error('rejectReason is required when rejecting a task');
    }
    let updated;
    let newRedoTask = null;
    if (data.reject) {
        // 驳回：创建新的重做任务
        updated = await database_1.default.hygieneTask.update({
            where: { id: taskId },
            data: {
                status: 'rejected',
                approvedBy: approverId,
                approvedAt: new Date(),
                qualityScore: data.qualityScore,
                rejectReason: data.rejectReason,
            },
        });
        // 创建新的重做任务
        const redoDate = new Date().toISOString().split('T')[0];
        const redoTime = new Date().toTimeString().slice(0, 5);
        // 计算截止时间：当前时间 + 预计完成时间
        const dueTime = new Date();
        dueTime.setMinutes(dueTime.getMinutes() + (task.template?.estimatedMinutes || 10));
        newRedoTask = await database_1.default.hygieneTask.create({
            data: {
                storeId: task.storeId,
                templateId: task.templateId,
                staffId: task.staffId,
                areaCode: task.areaCode,
                name: `${task.name} (重做)`,
                date: redoDate,
                time: redoTime,
                priority: task.priority,
                status: 'pending',
                parentTaskId: taskId,
                redoCount: task.redoCount + 1,
                dueTime: dueTime,
            },
        });
        await createTaskLog(newRedoTask.id, approverId, 'redo', null, approverName, `Redo task created due to rejection: ${data.rejectReason}`);
        // 通知员工
        if (task.staffId) {
            socket_1.socketManager.emitToStaff(task.staffId, 'hygiene:task:redo', {
                originalTaskId: taskId,
                redoTaskId: newRedoTask.id,
                reason: data.rejectReason,
                taskName: task.name,
            });
        }
    }
    else {
        // 批准
        updated = await database_1.default.hygieneTask.update({
            where: { id: taskId },
            data: {
                status: 'approved',
                approvedBy: approverId,
                approvedAt: new Date(),
                qualityScore: data.qualityScore,
                note: data.note,
            },
        });
    }
    const action = data.reject ? 'rejected' : 'approved';
    await createTaskLog(task.id, approverId, action, null, approverName, data.reject ? `Rejected: ${data.rejectReason}` : `Approved with score ${data.qualityScore}`);
    socket_1.socketManager.emitToStore(task.storeId, 'hygiene:task:approved', updated);
    return { task: updated, redoTask: newRedoTask };
}
/**
 * 跳过任务
 */
async function skipTask(taskId, staffId, staffName, storeId, reason) {
    // 先检查任务状态
    const existingTask = await database_1.default.hygieneTask.findUnique({
        where: { id: taskId },
    });
    if (!existingTask)
        throw new Error('Task not found');
    // 验证任务属于当前店铺
    if (existingTask.storeId !== storeId) {
        throw new Error('Task not found');
    }
    // 只能跳过 pending 或 in_progress 状态的任务
    if (!['pending', 'in_progress'].includes(existingTask.status)) {
        throw new Error(`Cannot skip task: invalid status "${existingTask.status}" (expected "pending" or "in_progress")`);
    }
    // 跳过必须提供原因
    if (!reason || reason.trim() === '') {
        throw new Error('Reason is required when skipping a task');
    }
    const task = await database_1.default.hygieneTask.update({
        where: { id: taskId },
        data: {
            status: 'skipped',
            completedAt: new Date(),
            completedBy: staffId,
            note: reason,
        },
    });
    await createTaskLog(task.id, staffId, 'skipped', null, staffName, `Skipped: ${reason}`);
    socket_1.socketManager.emitToStore(task.storeId, 'hygiene:task:skipped', task);
    return task;
}
/**
 * 上报问题
 */
async function reportIssue(taskId, staffId, staffName, storeId, data) {
    // 先检查任务状态
    const existingTask = await database_1.default.hygieneTask.findUnique({
        where: { id: taskId },
    });
    if (!existingTask)
        throw new Error('Task not found');
    // 验证任务属于当前店铺
    if (existingTask.storeId !== storeId) {
        throw new Error('Task not found');
    }
    // 问题描述必填
    if (!data.description || data.description.trim() === '') {
        throw new Error('Issue description is required');
    }
    const task = await database_1.default.hygieneTask.update({
        where: { id: taskId },
        data: {
            issueDescription: data.description,
            issuePhotoUrl: data.photoUrl,
        },
    });
    await createTaskLog(task.id, staffId, 'issue', data.photoUrl, staffName, `Issue reported: ${data.description}`);
    // 通知主管
    socket_1.socketManager.emitToStore(task.storeId, 'hygiene:task:issue', {
        taskId: task.id,
        taskName: task.name,
        areaCode: task.areaCode,
        reportedBy: staffName,
        description: data.description,
    });
    return task;
}
/**
 * 获取逾期任务
 */
async function getOverdueTasks(storeId) {
    const now = new Date();
    return database_1.default.hygieneTask.findMany({
        where: {
            storeId,
            status: { in: ['pending', 'in_progress'] },
            dueTime: { lt: now },
        },
        include: {
            staff: { select: { id: true, name: true } },
            template: { select: { id: true, name: true, areaCode: true, priority: true } },
        },
        orderBy: [{ priority: 'asc' }, { dueTime: 'asc' }],
    });
}
/**
 * 获取员工任务历史
 */
async function getStaffTaskHistory(staffId, storeId, page, pageSize) {
    const where = {
        storeId,
        staffId,
        status: { in: ['completed', 'approved', 'skipped', 'rejected'] },
    };
    const [tasks, total] = await Promise.all([
        database_1.default.hygieneTask.findMany({
            where,
            include: {
                template: { select: { id: true, name: true, areaCode: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        database_1.default.hygieneTask.count({ where }),
    ]);
    return {
        list: tasks,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}
/**
 * 创建临时任务
 */
async function createTemporaryTask(storeId, data) {
    // 验证必填字段
    if (!storeId || storeId.trim() === '') {
        throw new Error('Store ID is required');
    }
    if (!data.name || data.name.trim() === '') {
        throw new Error('Task name is required');
    }
    if (!data.areaCode || data.areaCode.trim() === '') {
        throw new Error('Area code is required');
    }
    if (!data.date || data.date.trim() === '') {
        throw new Error('Date is required');
    }
    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
    }
    // 解析截止时间（支持 ISO 格式或本地时间格式）
    let parsedDueTime = null;
    if (data.dueTime) {
        const dueDate = new Date(data.dueTime);
        if (!isNaN(dueDate.getTime())) {
            parsedDueTime = dueDate;
        }
    }
    const task = await database_1.default.hygieneTask.create({
        data: {
            storeId,
            name: data.name,
            areaCode: data.areaCode,
            staffId: data.staffId,
            priority: data.priority || 2,
            date: data.date,
            time: new Date().toTimeString().slice(0, 5),
            status: 'pending',
            isTemporary: true,
            dueTime: parsedDueTime,
            note: data.description,
        },
    });
    if (data.staffId) {
        await createTaskLog(task.id, data.staffId, 'created', null, null, `Temporary task created: ${data.name}`);
    }
    socket_1.socketManager.emitToStore(storeId, 'hygiene:temporary_task:created', task);
    return task;
}
// ============================================
// 操作日志
// ============================================
async function createTaskLog(taskId, performedBy, action, photoUrl, performedName, note, oldValue, newValue) {
    return database_1.default.hygieneTaskLog.create({
        data: {
            taskId,
            action,
            performedBy,
            performedName,
            photoUrl,
            note,
            oldValue,
            newValue,
        },
    });
}
/**
 * 获取任务日志
 */
async function getTaskLogs(taskId, storeId) {
    // 如果提供了 storeId，验证任务归属
    if (storeId) {
        const task = await database_1.default.hygieneTask.findUnique({
            where: { id: taskId },
            select: { storeId: true },
        });
        if (!task || task.storeId !== storeId) {
            throw new Error('Task not found');
        }
    }
    return database_1.default.hygieneTaskLog.findMany({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
    });
}
// ============================================
// 统计
// ============================================
/**
 * 获取单日统计
 */
async function getStats(storeId, date) {
    const tasks = await database_1.default.hygieneTask.findMany({
        where: { storeId, date },
    });
    const total = tasks.length;
    const completed = tasks.filter(t => ['completed', 'approved'].includes(t.status)).length;
    const skipped = tasks.filter(t => t.status === 'skipped').length;
    const pending = tasks.filter(t => ['pending', 'in_progress'].includes(t.status)).length;
    const pendingApproval = tasks.filter(t => t.status === 'pending_approval').length;
    const rejected = tasks.filter(t => t.status === 'rejected').length;
    const overdue = tasks.filter(t => {
        if (!['pending', 'in_progress'].includes(t.status))
            return false;
        if (!t.dueTime)
            return false;
        return new Date(t.dueTime) < new Date();
    }).length;
    // 按区域分组
    const byArea = tasks.reduce((acc, task) => {
        if (!acc[task.areaCode]) {
            acc[task.areaCode] = { total: 0, completed: 0, pending: 0, overdue: 0 };
        }
        acc[task.areaCode].total++;
        if (['completed', 'approved'].includes(task.status))
            acc[task.areaCode].completed++;
        if (['pending', 'in_progress'].includes(task.status))
            acc[task.areaCode].pending++;
        if (task.dueTime && new Date(task.dueTime) < new Date() && ['pending', 'in_progress'].includes(task.status)) {
            acc[task.areaCode].overdue++;
        }
        return acc;
    }, {});
    return {
        total,
        completed,
        skipped,
        pending,
        pendingApproval,
        rejected,
        overdue,
        completionRate: total > 0 ? Math.round((completed + skipped) / total * 100) : 0,
        byArea,
    };
}
/**
 * 获取日期范围统计
 */
async function getStatsByRange(storeId, startDate, endDate) {
    const tasks = await database_1.default.hygieneTask.findMany({
        where: {
            storeId,
            date: { gte: startDate, lte: endDate },
        },
    });
    // 按日期分组
    const byDate = tasks.reduce((acc, task) => {
        if (!acc[task.date]) {
            acc[task.date] = { total: 0, completed: 0, skipped: 0, pending: 0, rejected: 0 };
        }
        acc[task.date].total++;
        if (['completed', 'approved'].includes(task.status))
            acc[task.date].completed++;
        if (task.status === 'skipped')
            acc[task.date].skipped++;
        if (task.status === 'pending')
            acc[task.date].pending++;
        if (task.status === 'rejected')
            acc[task.date].rejected++;
        return acc;
    }, {});
    // 按区域分组
    const byArea = tasks.reduce((acc, task) => {
        if (!acc[task.areaCode]) {
            acc[task.areaCode] = { total: 0, completed: 0, skipped: 0, pending: 0 };
        }
        acc[task.areaCode].total++;
        if (['completed', 'approved'].includes(task.status))
            acc[task.areaCode].completed++;
        if (task.status === 'skipped')
            acc[task.areaCode].skipped++;
        if (task.status === 'pending')
            acc[task.areaCode].pending++;
        return acc;
    }, {});
    // 计算总体完成率趋势
    const dates = Object.keys(byDate).sort();
    const trend = dates.map(date => ({
        date,
        ...byDate[date],
        completionRate: byDate[date].total > 0
            ? Math.round((byDate[date].completed + byDate[date].skipped) / byDate[date].total * 100)
            : 0,
    }));
    // 质量评分平均
    const completedWithScore = tasks.filter(t => t.qualityScore);
    const avgQualityScore = completedWithScore.length > 0
        ? Math.round(completedWithScore.reduce((sum, t) => sum + (t.qualityScore || 0), 0) / completedWithScore.length * 10) / 10
        : null;
    const statsByDate = Object.values(byDate);
    const completed = statsByDate.reduce((sum, d) => sum + d.completed, 0);
    const skipped = statsByDate.reduce((sum, d) => sum + d.skipped, 0);
    const pending = statsByDate.reduce((sum, d) => sum + d.pending, 0);
    const rejected = statsByDate.reduce((sum, d) => sum + d.rejected, 0);
    return {
        total: tasks.length,
        completed,
        skipped,
        pending,
        rejected,
        avgQualityScore,
        trend,
        byArea,
    };
}
/**
 * 获取员工绩效统计
 */
async function getStaffPerformance(storeId, startDate, endDate) {
    const tasks = await database_1.default.hygieneTask.findMany({
        where: {
            storeId,
            date: { gte: startDate, lte: endDate },
        },
        include: { staff: { select: { id: true, name: true } } },
    });
    const byStaff = tasks.reduce((acc, task) => {
        const staffId = task.staffId || 'unassigned';
        const staffName = task.staff?.name || 'Unassigned';
        if (!acc[staffId]) {
            acc[staffId] = {
                staffId,
                staffName,
                total: 0,
                completed: 0,
                skipped: 0,
                rejected: 0,
                avgQualityScore: null,
                qualityScores: [],
            };
        }
        acc[staffId].total++;
        if (['completed', 'approved'].includes(task.status))
            acc[staffId].completed++;
        if (task.status === 'skipped')
            acc[staffId].skipped++;
        if (task.status === 'rejected')
            acc[staffId].rejected++;
        if (task.qualityScore) {
            acc[staffId].qualityScores.push(task.qualityScore);
        }
        return acc;
    }, {});
    // 计算平均质量分
    Object.values(byStaff).forEach((staff) => {
        if (staff.qualityScores.length > 0) {
            staff.avgQualityScore = Math.round(staff.qualityScores.reduce((a, b) => a + b, 0) / staff.qualityScores.length * 10) / 10;
        }
        delete staff.qualityScores;
        staff.completionRate = staff.total > 0 ? Math.round((staff.completed + staff.skipped) / staff.total * 100) : 0;
    });
    return Object.values(byStaff).sort((a, b) => b.completed - a.completed);
}
// ============================================
// 自动任务生成（定时任务调用）
// ============================================
async function processDueTemplates() {
    const now = new Date();
    // 查找所有需要触发的模板
    const dueTemplates = await database_1.default.hygieneTemplate.findMany({
        where: {
            status: 'active',
            autoGenerate: true,
            nextTriggerAt: { lte: now },
        },
    });
    const createdTasks = [];
    for (const template of dueTemplates) {
        const today = new Date().toISOString().split('T')[0];
        // 检查是否应该在这天生成
        if (!shouldGenerateOnDate(template, today)) {
            await database_1.default.hygieneTemplate.update({
                where: { id: template.id },
                data: { nextTriggerAt: calculateNextTrigger(template.frequency, template.time, template.specificDays) },
            });
            continue;
        }
        // 获取执行员工
        const staffIds = await resolveStaffIds(template, template.storeId);
        for (const staffId of staffIds) {
            // 检查今天是否已为此模板+员工创建过任务
            const existing = await database_1.default.hygieneTask.findFirst({
                where: { templateId: template.id, staffId, date: today },
            });
            if (existing)
                continue;
            // 计算截止时间
            const [year, month, day] = today.split('-').map(Number);
            const [hours, mins] = (template.time || '10:00').split(':').map(Number);
            const estimated = template.estimatedMinutes || 10;
            const dueTime = new Date(year, month - 1, day, hours, mins + estimated, 0, 0);
            const task = await database_1.default.hygieneTask.create({
                data: {
                    storeId: template.storeId,
                    templateId: template.id,
                    staffId,
                    areaCode: template.areaCode,
                    name: template.name,
                    date: today,
                    time: template.time || '10:00',
                    priority: template.priority,
                    status: 'pending',
                    executionIndex: 0,
                    dueTime,
                },
            });
            await createTaskLog(task.id, staffId, 'created', null, null, 'Auto-generated by system');
            // 发送提醒
            socket_1.socketManager.emitToStaff(staffId, 'hygiene:reminder', {
                taskId: task.id,
                areaCode: task.areaCode,
                name: task.name,
                time: task.time,
                priority: task.priority,
            });
            createdTasks.push(task);
        }
        // 更新下次触发时间
        await database_1.default.hygieneTemplate.update({
            where: { id: template.id },
            data: { nextTriggerAt: calculateNextTrigger(template.frequency, template.time, template.specificDays) },
        });
    }
    // 广播到 POS 端
    if (createdTasks.length > 0) {
        socket_1.socketManager.emitToStore(createdTasks[0].storeId, 'hygiene:reminder', {
            count: createdTasks.length,
            message: `${createdTasks.length} new hygiene tasks generated`,
        });
    }
    return createdTasks.length;
}
// ============================================
// 辅助函数
// ============================================
/**
 * 根据模板分配方式解析员工ID列表（支持多个员工）
 */
async function resolveStaffIds(template, storeId) {
    // 优先使用 staffIds（多个员工）
    if (template.staffIds) {
        try {
            const staffIds = JSON.parse(template.staffIds);
            if (Array.isArray(staffIds) && staffIds.length > 0) {
                return staffIds;
            }
        }
        catch { /* ignore */ }
    }
    // 回退到单个 staffId
    if (template.assignedType === 'staff' && template.staffId) {
        return [template.staffId];
    }
    if (template.assignedType === 'area' && template.areaManagerId) {
        // 查找该区域负责人下的所有员工
        const staffInArea = await database_1.default.staff.findMany({
            where: { storeId, status: 'active' },
            select: { id: true },
        });
        // 简化：返回区域经理ID，实际应该返回该区域的员工
        return [template.areaManagerId];
    }
    if (template.assignedType === 'shift' && template.shift) {
        // 查询该班次今天的所有员工
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        const schedules = await database_1.default.schedule.findMany({
            where: {
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                shift: template.shift,
                status: { in: ['scheduled', 'confirmed'] },
            },
            select: { staffId: true },
        });
        return schedules.map(s => s.staffId);
    }
    return [];
}
/**
 * 检查模板是否应该在指定日期生成
 */
function shouldGenerateOnDate(template, dateStr) {
    if (!template.specificDays)
        return true;
    try {
        const specificDays = JSON.parse(template.specificDays);
        if (!Array.isArray(specificDays) || specificDays.length === 0)
            return true;
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ...
        // specificDays 使用 1-7 (周一到周日) 或 0-6 (周日到周六)
        return specificDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek);
    }
    catch {
        return true;
    }
}
/**
 * 计算下次触发时间
 */
function calculateNextTrigger(frequency, time, specificDays) {
    const now = new Date();
    const [hours, minutes] = (time || '10:00').split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    // 如果 specificDays 存在，优先按特定日期计算
    if (specificDays && frequency === 'specific_days') {
        try {
            const days = JSON.parse(specificDays);
            if (Array.isArray(days) && days.length > 0) {
                const dayOfWeek = next.getDay();
                const currentDayIndex = dayOfWeek === 0 ? 7 : dayOfWeek;
                // 找到下一个指定日
                let daysToAdd = 0;
                for (let i = 1; i <= 7; i++) {
                    const checkDay = (currentDayIndex + i - 1) % 7 + 1;
                    if (days.includes(checkDay)) {
                        daysToAdd = i;
                        break;
                    }
                }
                next.setDate(next.getDate() + daysToAdd);
                return next;
            }
        }
        catch { /* ignore */ }
    }
    switch (frequency) {
        case 'daily':
            if (next <= now)
                next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            const dayOfWeek = next.getDay();
            const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 6 ? 2 : (8 - dayOfWeek);
            next.setDate(next.getDate() + daysUntilMonday);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        default:
            next.setDate(next.getDate() + 1);
    }
    return next;
}
// ============================================
// 预设模板生成
// ============================================
/**
 * 生成奶茶店常用预设模板
 */
async function seedDefaultTemplates(storeId) {
    const defaultTemplates = [
        // 食品安全类
        {
            name: '原料保质期检查',
            areaCode: 'ingredients',
            category: 'food_safety',
            frequency: 'daily',
            priority: 1,
            estimatedMinutes: 15,
            standard: '检查所有原料生产日期和保质期，及时处理过期原料',
            photoRequired: true,
            checklists: [
                { item: '茶叶检查', description: '检查各类茶叶保质期', isRequired: true },
                { item: '糖浆检查', description: '检查糖浆/果酱保质期', isRequired: true },
                { item: '奶类检查', description: '检查鲜奶、奶精保质期', isRequired: true },
                { item: '配料检查', description: '珍珠、椰果、布丁等配料', isRequired: true },
            ],
        },
        {
            name: '冰箱温度记录',
            areaCode: 'kitchen',
            category: 'food_safety',
            frequency: 'daily',
            priority: 1,
            estimatedMinutes: 5,
            standard: '冰箱温度应在 0-4°C，超出范围需调整',
            photoRequired: true,
            checklists: [
                { item: '冷藏柜温度', description: '记录温度数值', isRequired: true },
                { item: '冷冻柜温度', description: '记录温度数值', isRequired: true },
                { item: '检查除霜情况', description: '是否有结霜', isRequired: false },
            ],
        },
        // 日常清洁类
        {
            name: '柜台台面清洁消毒',
            areaCode: 'counter',
            category: 'daily',
            frequency: 'daily',
            priority: 2,
            estimatedMinutes: 10,
            standard: '使用消毒水擦拭台面，保持干净整洁',
            photoRequired: true,
            checklists: [
                { item: '收银台消毒', description: '喷洒消毒水并擦拭', isRequired: true },
                { item: '制作台清洁', description: '清除残留饮品渍', isRequired: true },
                { item: '设备表面擦拭', description: '封口机、摇摇机等', isRequired: true },
            ],
        },
        {
            name: '地面清扫消毒',
            areaCode: 'floor',
            category: 'daily',
            frequency: 'daily',
            priority: 2,
            estimatedMinutes: 15,
            standard: '先清扫后拖地，重点区域消毒',
            photoRequired: false,
            checklists: [
                { item: '用餐区清扫', description: '清扫垃圾和杂物', isRequired: true },
                { item: '后厨地面清扫', description: '清除食材残渣', isRequired: true },
                { item: '拖地消毒', description: '使用稀释消毒水拖地', isRequired: true },
            ],
        },
        // 周期性维护
        {
            name: '制冰机清洁',
            areaCode: 'equipment',
            category: 'periodic',
            frequency: 'weekly',
            priority: 2,
            estimatedMinutes: 30,
            standard: '按照制冰机说明书进行除垢和消毒',
            photoRequired: true,
            checklists: [
                { item: '关机断电', description: '安全第一', isRequired: true },
                { item: '清空冰仓', description: '处理剩余冰块', isRequired: true },
                { item: '内部清洗', description: '使用专用清洁剂', isRequired: true },
                { item: '除垢处理', description: '去除水垢', isRequired: true },
                { item: '冲洗干净', description: '确保无清洁剂残留', isRequired: true },
            ],
        },
        {
            name: '煮茶设备除垢',
            areaCode: 'kitchen',
            category: 'periodic',
            frequency: 'weekly',
            priority: 2,
            estimatedMinutes: 20,
            standard: '使用食品级除垢剂，去除水垢',
            photoRequired: true,
            checklists: [
                { item: '设备降温', description: '等待设备冷却', isRequired: true },
                { item: '除垢液浸泡', description: '按比例稀释后使用', isRequired: true },
                { item: '刷洗冲净', description: '彻底冲洗', isRequired: true },
            ],
        },
        // 开业检查
        {
            name: '开业前设备检查',
            areaCode: 'counter',
            category: 'opening',
            frequency: 'daily',
            priority: 1,
            estimatedMinutes: 10,
            standard: '确认所有设备正常运转',
            photoRequired: true,
            checklists: [
                { item: '封口机测试', description: '确认能正常工作', isRequired: true },
                { item: '冰箱温度确认', description: '温度在正常范围', isRequired: true },
                { item: '净水器检查', description: '确认出水正常', isRequired: true },
                { item: '制冰机状态', description: '确认制冰正常', isRequired: true },
                { item: '原料备料', description: '确认原料充足', isRequired: true },
            ],
        },
        // 闭店检查
        {
            name: '闭店前卫生检查',
            areaCode: 'counter',
            category: 'closing',
            frequency: 'daily',
            priority: 2,
            estimatedMinutes: 20,
            standard: '完成当日最后一次清洁',
            photoRequired: true,
            checklists: [
                { item: '台面清洁消毒', description: '彻底清洁', isRequired: true },
                { item: '设备清洁', description: '擦拭设备表面', isRequired: true },
                { item: '垃圾分类', description: '按分类处理垃圾', isRequired: true },
                { item: '明日备料', description: '准备明日原料', isRequired: false },
            ],
        },
    ];
    const created = [];
    for (const template of defaultTemplates) {
        const existing = await database_1.default.hygieneTemplate.findFirst({
            where: { storeId, name: template.name },
        });
        if (existing)
            continue;
        const createdTemplate = await createTemplate({
            storeId,
            ...template,
        });
        created.push(createdTemplate);
    }
    return created;
}
//# sourceMappingURL=HygieneService.js.map