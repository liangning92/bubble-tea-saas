import prisma from '../config/database'
import { socketManager } from '../socket'

// ============================================
// 预设值（用于新店铺或回退）
// ============================================
export const DEFAULT_AREAS = [
  { code: 'counter', name: '柜台 / Counter', icon: '🧾', color: '#FF6B6B', priority: 1 },
  { code: 'kitchen', name: '后厨 / Kitchen', icon: '🍳', color: '#4ECDC4', priority: 2 },
  { code: 'ingredients', name: '原料区 / Ingredients', icon: '🧋', color: '#45B7D1', priority: 3 },
  { code: 'floor', name: '地面 / Floor', icon: '🧹', color: '#96CEB4', priority: 4 },
  { code: 'restroom', name: '卫生间 / Restroom', icon: '🚻', color: '#DDA0DD', priority: 5 },
  { code: 'waste', name: '垃圾区 / Waste', icon: '🗑️', color: '#FFEAA7', priority: 6 },
  { code: 'equipment', name: '设备区 / Equipment', icon: '⚙️', color: '#74B9FF', priority: 7 },
  { code: 'ventilation', name: '通风/空调 / Ventilation', icon: '💨', color: '#A29BFE', priority: 8 },
]

export const DEFAULT_CATEGORIES = [
  { value: 'food_safety', label: 'Food Safety', labelZh: '食品安全', icon: '⚠️', color: '#FF0000' },
  { value: 'daily', label: 'Daily Cleaning', labelZh: '日常清洁', icon: '🧹', color: '#FFA500' },
  { value: 'equipment', label: 'Equipment', labelZh: '设备维护', icon: '🔧', color: '#00BFFF' },
  { value: 'periodic', label: 'Periodic', labelZh: '周期维护', icon: '📅', color: '#9370DB' },
  { value: 'opening', label: 'Opening', labelZh: '开业准备', icon: '🌅', color: '#32CD32' },
  { value: 'closing', label: 'Closing', labelZh: '闭店检查', icon: '🌙', color: '#8B0000' },
]

export const DEFAULT_PRIORITIES = [
  { value: 1, label: 'Critical', labelZh: '紧急', color: '#FF0000' },
  { value: 2, label: 'High', labelZh: '重要', color: '#FFA500' },
  { value: 3, label: 'Normal', labelZh: '一般', color: '#00BFFF' },
  { value: 4, label: 'Low', labelZh: '低', color: '#808080' },
]

export const DEFAULT_SHIFTS = [
  { value: 'morning', label: 'Morning', labelZh: '早班', time: '09:00-17:00' },
  { value: 'afternoon', label: 'Afternoon', labelZh: '午班', time: '14:00-22:00' },
  { value: 'evening', label: 'Evening', labelZh: '晚班', time: '22:00-06:00' },
]

export const DEFAULT_EVIDENCE_TYPES = [
  { value: 'photo', label: 'Photo', labelZh: '拍照', icon: '📷' },
  { value: 'signature', label: 'Signature', labelZh: '签名', icon: '✍️' },
  { value: 'both', label: 'Photo + Signature', labelZh: '拍照+签名', icon: '📝' },
]

// 配置项 Key 常量
export const HYGIENE_CONFIG_KEYS = {
  CATEGORIES: 'categories',
  PRIORITIES: 'priorities',
  SHIFTS: 'shifts',
  EVIDENCE_TYPES: 'evidence_types',
  WEEKDAYS: 'weekdays',
  FREQUENCIES: 'frequencies',
  ASSIGNED_TYPES: 'assigned_types',
} as const

// 默认执行频率配置
export const DEFAULT_FREQUENCIES = [
  { value: 'daily', label: 'Daily', labelZh: '每日', icon: '📅' },
  { value: 'weekly', label: 'Weekly', labelZh: '每周', icon: '📆' },
  { value: 'monthly', label: 'Monthly', labelZh: '每月', icon: '🗓️' },
  { value: 'specific_days', label: 'Specific Days', labelZh: '特定日期', icon: '📌' },
]

// 默认分配方式配置
export const DEFAULT_ASSIGNED_TYPES = [
  { value: 'shift', label: 'By Shift', labelZh: '按班次', icon: '👥' },
  { value: 'staff', label: 'By Staff', labelZh: '指定员工', icon: '👤' },
  { value: 'area', label: 'By Area', labelZh: '按区域', icon: '📍' },
]

// 默认工作日配置
export const DEFAULT_WEEKDAYS = [
  { value: 1, label: 'Monday', labelZh: '周一', short: 'Mon' },
  { value: 2, label: 'Tuesday', labelZh: '周二', short: 'Tue' },
  { value: 3, label: 'Wednesday', labelZh: '周三', short: 'Wed' },
  { value: 4, label: 'Thursday', labelZh: '周四', short: 'Thu' },
  { value: 5, label: 'Friday', labelZh: '周五', short: 'Fri' },
  { value: 6, label: 'Saturday', labelZh: '周六', short: 'Sat' },
  { value: 0, label: 'Sunday', labelZh: '周日', short: 'Sun' },
]

// ============================================
// 卫生配置管理（完全用户可配置）
// ============================================

/**
 * 获取店铺的卫生配置（用户自定义配置）
 */
export async function getHygieneConfig(storeId: string, key: string) {
  const config = await prisma.hygieneConfig.findUnique({
    where: { storeId_key: { storeId, key } },
  })
  if (config) {
    return JSON.parse(config.value)
  }
  // 回退到默认值
  return getDefaultConfig(key)
}

/**
 * 获取默认值
 */
function getDefaultConfig(key: string): any[] {
  switch (key) {
    case HYGIENE_CONFIG_KEYS.CATEGORIES: return DEFAULT_CATEGORIES
    case HYGIENE_CONFIG_KEYS.PRIORITIES: return DEFAULT_PRIORITIES
    case HYGIENE_CONFIG_KEYS.SHIFTS: return DEFAULT_SHIFTS
    case HYGIENE_CONFIG_KEYS.EVIDENCE_TYPES: return DEFAULT_EVIDENCE_TYPES
    case HYGIENE_CONFIG_KEYS.WEEKDAYS: return DEFAULT_WEEKDAYS
    case HYGIENE_CONFIG_KEYS.FREQUENCIES: return DEFAULT_FREQUENCIES
    case HYGIENE_CONFIG_KEYS.ASSIGNED_TYPES: return DEFAULT_ASSIGNED_TYPES
    default: return []
  }
}

/**
 * 保存卫生配置（用户自定义）
 */
export async function setHygieneConfig(storeId: string, key: string, value: any[]) {
  const jsonValue = JSON.stringify(value)
  return prisma.hygieneConfig.upsert({
    where: { storeId_key: { storeId, key } },
    create: { storeId, key, value: jsonValue },
    update: { value: jsonValue },
  })
}

/**
 * 获取所有卫生配置
 */
export async function getAllHygieneConfigs(storeId: string) {
  const configs = await prisma.hygieneConfig.findMany({ where: { storeId } })
  const result: Record<string, any[]> = {}
  for (const key of Object.values(HYGIENE_CONFIG_KEYS)) {
    result[key] = await getHygieneConfig(storeId, key)
  }
  return result
}

// ============================================
// 区域管理
// ============================================

/**
 * 获取店铺所有区域（包含预设区域）
 */
export async function getAreas(storeId: string) {
  // 获取自定义区域
  const customAreas = await prisma.hygieneArea.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
  })

  // 合并预设区域（标记哪些已自定义）
  const customCodes = new Set(customAreas.map(a => a.code))
  const defaultAreas = DEFAULT_AREAS.filter(a => !customCodes.has(a.code))

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
  ]

  return result.sort((a, b) => a.priority - b.priority)
}

/**
 * 创建自定义区域
 */
export async function createArea(data: {
  storeId: string
  name: string
  code: string
  icon?: string
  color?: string
  priority?: number
  description?: string
  managerId?: string
}) {
  // 检查代码是否与预设冲突
  const existing = await prisma.hygieneArea.findUnique({
    where: { storeId_code: { storeId: data.storeId, code: data.code } },
  })

  if (existing) {
    throw new Error('Area code already exists')
  }

  // 获取当前最大 sortOrder
  const maxOrder = await prisma.hygieneArea.aggregate({
    where: { storeId: data.storeId },
    _max: { sortOrder: true },
  })

  return prisma.hygieneArea.create({
    data: {
      ...data,
      sortOrder: data.priority || (maxOrder._max.sortOrder || 0) + 1,
    },
  })
}

/**
 * 更新区域
 */
export async function updateArea(areaId: string, data: Partial<{
  name: string
  icon: string
  color: string
  priority: number
  description: string
  managerId: string
  isActive: boolean
  sortOrder: number
}>) {
  return prisma.hygieneArea.update({
    where: { id: areaId },
    data,
  })
}

/**
 * 删除区域
 */
export async function deleteArea(areaId: string) {
  return prisma.hygieneArea.delete({
    where: { id: areaId },
  })
}

/**
 * 初始化店铺预设区域（首次使用）
 */
export async function initDefaultAreas(storeId: string) {
  const existing = await prisma.hygieneArea.findFirst({
    where: { storeId },
  })

  if (existing) return existing // 已初始化

  const areas = DEFAULT_AREAS.map((a, idx) => ({
    storeId,
    name: a.name,
    code: a.code,
    icon: a.icon,
    color: a.color,
    priority: a.priority,
    sortOrder: idx,
    isActive: true,
  }))

  await prisma.hygieneArea.createMany({ data: areas })
  return getAreas(storeId)
}

// ============================================
// 模板管理
// ============================================

/**
 * 获取模板列表
 */
export async function getTemplates(storeId: string, options?: {
  areaCode?: string
  category?: string
  status?: string
}) {
  const where: any = { storeId }
  if (options?.areaCode) where.areaCode = options.areaCode
  if (options?.category) where.category = options.category
  if (options?.status) where.status = options.status

  return prisma.hygieneTemplate.findMany({
    where,
    include: {
      checklists: { orderBy: { order: 'asc' } },
    },
    orderBy: [{ priority: 'asc' }, { time: 'asc' }],
  })
}

/**
 * 获取单个模板
 */
export async function getTemplateById(id: string) {
  return prisma.hygieneTemplate.findUnique({
    where: { id },
    include: {
      checklists: { orderBy: { order: 'asc' } },
    },
  })
}

/**
 * 创建模板
 */
export async function createTemplate(data: {
  storeId: string
  areaCode: string
  name: string
  description?: string
  category?: string
  frequency?: string
  specificDays?: number[]
  time?: string
  priority?: number
  estimatedMinutes?: number
  standardBefore?: string
  standardDuring?: string
  standardAfter?: string
  toolsRequired?: string[]
  photoRequired?: boolean
  evidenceType?: string
  assignedType?: string
  shift?: string
  staffId?: string
  areaManagerId?: string
  requiresApproval?: boolean
  alertMinutesBefore?: number
  autoGenerate?: boolean
  regulationCode?: string
  checklists?: { item: string; description?: string; isRequired?: boolean }[]
}) {
  const { checklists, ...templateData } = data

  // 处理 JSON 字段
  const processed: any = {
    ...templateData,
    toolsRequired: templateData.toolsRequired ? JSON.stringify(templateData.toolsRequired) : null,
    specificDays: templateData.specificDays ? JSON.stringify(templateData.specificDays) : null,
  }

  // 计算下次触发时间
  processed.nextTriggerAt = calculateNextTrigger(templateData.frequency, templateData.time)

  const template = await prisma.hygieneTemplate.create({
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
  })

  // 广播到前台
  socketManager.emitToStore(templateData.storeId, 'hygiene:template:created', template)

  return template
}

/**
 * 更新模板
 */
export async function updateTemplate(templateId: string, data: Partial<{
  areaCode: string
  name: string
  description: string
  category: string
  frequency: string
  specificDays: number[]
  time: string
  priority: number
  estimatedMinutes: number
  standard: string
  toolsRequired: string[]
  photoRequired: boolean
  evidenceType: string
  assignedType: string
  shift: string
  staffId: string
  areaManagerId: string
  requiresApproval: boolean
  alertMinutesBefore: number
  autoGenerate: boolean
  regulationCode: string
  status: string
  checklists: { item: string; description?: string; isRequired?: boolean }[]
}>) {
  const { checklists, ...templateData } = data

  // 处理 JSON 字段
  const processed: any = { ...templateData }
  if (templateData.toolsRequired !== undefined) {
    processed.toolsRequired = templateData.toolsRequired ? JSON.stringify(templateData.toolsRequired) : null
  }
  if (templateData.specificDays !== undefined) {
    processed.specificDays = templateData.specificDays ? JSON.stringify(templateData.specificDays) : null
  }

  // 如果频率或时间变了，重新计算触发时间
  if (templateData.frequency || templateData.time) {
    processed.nextTriggerAt = calculateNextTrigger(templateData.frequency, templateData.time)
  }

  // 更新检查清单（先删后建）
  if (checklists !== undefined) {
    await prisma.hygieneChecklist.deleteMany({ where: { templateId } })
  }

  const template = await prisma.hygieneTemplate.update({
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
  })

  // 广播更新
  socketManager.emitToStore(template.storeId, 'hygiene:template:updated', template)

  return template
}

/**
 * 删除模板（软删除）
 */
export async function deleteTemplate(templateId: string) {
  const template = await prisma.hygieneTemplate.update({
    where: { id: templateId },
    data: { status: 'paused' },
  })

  socketManager.emitToStore(template.storeId, 'hygiene:template:deleted', { id: templateId })

  return template
}

/**
 * 复制模板
 */
export async function duplicateTemplate(templateId: string, newStoreId?: string) {
  const original = await getTemplateById(templateId)
  if (!original) throw new Error('Template not found')

  const { id, createdAt, updatedAt, checklists, areaCode, name, description, category, frequency, specificDays, time, priority, estimatedMinutes, standardBefore, standardDuring, standardAfter, toolsRequired, photoRequired, evidenceType, assignedType, shift, staffId, areaManagerId, requiresApproval, alertMinutesBefore, autoGenerate, regulationCode, storeId } = original

  return createTemplate({
    storeId: newStoreId || storeId,
    areaCode,
    name: `${name} (Copy)`,
    description,
    category,
    frequency,
    specificDays: specificDays ? JSON.parse(specificDays as string) : undefined,
    time,
    priority,
    estimatedMinutes,
    standardBefore,
    standardDuring,
    standardAfter,
    toolsRequired: toolsRequired ? JSON.parse(toolsRequired as string) : undefined,
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
  })
}

// ============================================
// 任务管理
// ============================================

/**
 * 获取某日任务
 */
export async function getTasks(storeId: string, date: string, options?: {
  shift?: string
  areaCode?: string
  staffId?: string
  status?: string
}) {
  const where: any = { storeId, date }
  if (options?.shift) where.shift = options.shift
  if (options?.areaCode) where.areaCode = options.areaCode
  if (options?.staffId) where.staffId = options.staffId
  if (options?.status) where.status = options.status

  return prisma.hygieneTask.findMany({
    where,
    include: {
      staff: { select: { id: true, name: true } },
      template: { select: { id: true, name: true, photoRequired: true, evidenceType: true, requiresApproval: true } },
      logs: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: [{ priority: 'asc' }, { time: 'asc' }],
  })
}

/**
 * 获取员工任务
 */
export async function getTasksByStaff(staffId: string, date: string) {
  return prisma.hygieneTask.findMany({
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
  })
}

/**
 * 获取待处理任务
 */
export async function getPendingTasks(storeId: string, options?: { staffId?: string }) {
  const today = new Date().toISOString().split('T')[0]
  const where: any = { storeId, date: today, status: 'pending' }
  if (options?.staffId) where.staffId = options.staffId

  return prisma.hygieneTask.findMany({
    where,
    include: {
      staff: { select: { id: true, name: true } },
      template: { select: { id: true, name: true, areaCode: true, priority: true } },
    },
    orderBy: [{ priority: 'asc' }, { time: 'asc' }],
  })
}

/**
 * 获取单个任务详情
 */
export async function getTaskById(taskId: string) {
  return prisma.hygieneTask.findUnique({
    where: { id: taskId },
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
  })
}

/**
 * 生成每日任务（手动触发）
 */
export async function generateDailyTasks(storeId: string, date: string) {
  const templates = await prisma.hygieneTemplate.findMany({
    where: { storeId, status: 'active', autoGenerate: true },
  })

  const createdTasks = []

  for (const template of templates) {
    // 检查是否应该在这天生成
    if (!shouldGenerateOnDate(template, date)) continue

    // 根据 assignedType 获取员工列表
    const staffIds = await resolveStaffIds(template, storeId)

    for (const staffId of staffIds) {
      // 检查今天是否已为此模板+员工创建过任务
      const existing = await prisma.hygieneTask.findFirst({
        where: { templateId: template.id, staffId, date },
      })
      if (existing) continue

      const task = await prisma.hygieneTask.create({
        data: {
          storeId,
          templateId: template.id,
          staffId,
          areaCode: template.areaCode,
          name: template.name,
          date,
          time: template.time,
          priority: template.priority,
          status: 'pending',
        },
      })

      await createTaskLog(task.id, staffId, 'created', null, null, `Task auto-generated from template: ${template.name}`)

      createdTasks.push(task)
    }
  }

  if (createdTasks.length > 0) {
    socketManager.emitToStore(storeId, 'hygiene:tasks:generated', { date, count: createdTasks.length })
  }

  return createdTasks.length
}

/**
 * 开始执行任务
 */
export async function startTask(taskId: string, staffId: string) {
  const task = await prisma.hygieneTask.update({
    where: { id: taskId },
    data: {
      status: 'pending', // 仍然是 pending，但记录开始时间
      startedAt: new Date(),
    },
  })

  await createTaskLog(task.id, staffId, 'started', null, null, 'Task execution started')

  return task
}

/**
 * 完成提交任务
 */
export async function completeTask(taskId: string, staffId: string, staffName: string, data: {
  photoUrl?: string
  signatureUrl?: string
  note?: string
  checklistResults?: { checklistId: string; completed: boolean; note?: string }[]
}) {
  const task = await prisma.hygieneTask.update({
    where: { id: taskId },
    include: { template: { select: { requiresApproval: true } } },
    data: {
      status: data.note?.includes('[issue]') ? 'pending' : 'completed', // 如果备注包含[issue]则需要审核
      completedAt: new Date(),
      completedBy: staffId,
      photoUrl: data.photoUrl,
      signatureUrl: data.signatureUrl,
      note: data.note,
      actualMinutes: data.photoUrl ? calculateActualMinutes(taskId) : null,
    },
  })

  await createTaskLog(task.id, staffId, 'completed', data.photoUrl, staffName,
    data.note || 'Task completed')

  // 如果需要审核，通知主管
  if (task.template?.requiresApproval) {
    socketManager.emitToStore(task.storeId, 'hygiene:task:needs_approval', {
      taskId: task.id,
      taskName: task.name,
      areaCode: task.areaCode,
      completedBy: staffName,
    })
  } else {
    // 不需要审核，直接广播完成
    socketManager.emitToStore(task.storeId, 'hygiene:task:completed', task)
  }

  return task
}

/**
 * 主管审核任务
 */
export async function approveTask(taskId: string, approverId: string, approverName: string, data: {
  qualityScore: number
  note?: string
  reject?: boolean
  rejectReason?: string
}) {
  const task = await prisma.hygieneTask.findUnique({ where: { id: taskId } })

  const updated = await prisma.hygieneTask.update({
    where: { id: taskId },
    data: {
      status: data.reject ? 'rejected' : 'approved',
      approvedBy: approverId,
      approvedAt: new Date(),
      qualityScore: data.qualityScore,
      note: data.reject ? data.rejectReason : data.note,
    },
  })

  const action = data.reject ? 'rejected' : 'approved'
  await createTaskLog(task.id, approverId, action, null, approverName,
    data.reject ? `Rejected: ${data.rejectReason}` : `Approved with score ${data.qualityScore}`)

  socketManager.emitToStore(task.storeId, 'hygiene:task:approved', updated)

  return updated
}

/**
 * 跳过任务
 */
export async function skipTask(taskId: string, staffId: string, staffName: string, reason: string) {
  const task = await prisma.hygieneTask.update({
    where: { id: taskId },
    data: {
      status: 'skipped',
      completedAt: new Date(),
      completedBy: staffId,
      note: reason,
    },
  })

  await createTaskLog(task.id, staffId, 'skipped', null, staffName, `Skipped: ${reason}`)

  socketManager.emitToStore(task.storeId, 'hygiene:task:skipped', task)

  return task
}

/**
 * 上报问题
 */
export async function reportIssue(taskId: string, staffId: string, staffName: string, data: {
  description: string
  photoUrl?: string
}) {
  const task = await prisma.hygieneTask.update({
    where: { id: taskId },
    data: {
      issueDescription: data.description,
      issuePhotoUrl: data.photoUrl,
    },
  })

  await createTaskLog(task.id, staffId, 'issue', data.photoUrl, staffName,
    `Issue reported: ${data.description}`)

  // 通知主管
  socketManager.emitToStore(task.storeId, 'hygiene:task:issue', {
    taskId: task.id,
    taskName: task.name,
    areaCode: task.areaCode,
    reportedBy: staffName,
    description: data.description,
  })

  return task
}

// ============================================
// 操作日志
// ============================================

async function createTaskLog(
  taskId: string,
  performedBy: string,
  action: string,
  photoUrl: string | null,
  performedName: string | null,
  note: string,
  oldValue?: string,
  newValue?: string
) {
  return prisma.hygieneTaskLog.create({
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
  })
}

/**
 * 获取任务日志
 */
export async function getTaskLogs(taskId: string) {
  return prisma.hygieneTaskLog.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  })
}

// ============================================
// 统计
// ============================================

/**
 * 获取单日统计
 */
export async function getStats(storeId: string, date: string) {
  const tasks = await prisma.hygieneTask.findMany({
    where: { storeId, date },
  })

  const total = tasks.length
  const completed = tasks.filter(t => ['completed', 'approved'].includes(t.status)).length
  const skipped = tasks.filter(t => t.status === 'skipped').length
  const pending = tasks.filter(t => t.status === 'pending').length
  const rejected = tasks.filter(t => t.status === 'rejected').length

  // 按区域分组
  const byArea = tasks.reduce((acc, task) => {
    if (!acc[task.areaCode]) {
      acc[task.areaCode] = { total: 0, completed: 0, pending: 0 }
    }
    acc[task.areaCode].total++
    if (['completed', 'approved'].includes(task.status)) acc[task.areaCode].completed++
    if (task.status === 'pending') acc[task.areaCode].pending++
    return acc
  }, {} as Record<string, { total: number; completed: number; pending: number }>)

  return {
    total,
    completed,
    skipped,
    pending,
    rejected,
    completionRate: total > 0 ? Math.round((completed + skipped) / total * 100) : 0,
    byArea,
  }
}

/**
 * 获取日期范围统计
 */
export async function getStatsByRange(storeId: string, startDate: string, endDate: string) {
  const tasks = await prisma.hygieneTask.findMany({
    where: {
      storeId,
      date: { gte: startDate, lte: endDate },
    },
  })

  // 按日期分组
  const byDate = tasks.reduce((acc, task) => {
    if (!acc[task.date]) {
      acc[task.date] = { total: 0, completed: 0, skipped: 0, pending: 0, rejected: 0 }
    }
    acc[task.date].total++
    if (['completed', 'approved'].includes(task.status)) acc[task.date].completed++
    if (task.status === 'skipped') acc[task.date].skipped++
    if (task.status === 'pending') acc[task.date].pending++
    if (task.status === 'rejected') acc[task.date].rejected++
    return acc
  }, {} as Record<string, { total: number; completed: number; skipped: number; pending: number; rejected: number }>)

  // 按区域分组
  const byArea = tasks.reduce((acc, task) => {
    if (!acc[task.areaCode]) {
      acc[task.areaCode] = { total: 0, completed: 0, skipped: 0, pending: 0 }
    }
    acc[task.areaCode].total++
    if (['completed', 'approved'].includes(task.status)) acc[task.areaCode].completed++
    if (task.status === 'skipped') acc[task.areaCode].skipped++
    if (task.status === 'pending') acc[task.areaCode].pending++
    return acc
  }, {} as Record<string, { total: number; completed: number; skipped: number; pending: number }>)

  // 计算总体完成率趋势
  const dates = Object.keys(byDate).sort()
  const trend = dates.map(date => ({
    date,
    ...byDate[date],
    completionRate: byDate[date].total > 0
      ? Math.round((byDate[date].completed + byDate[date].skipped) / byDate[date].total * 100)
      : 0,
  }))

  // 质量评分平均
  const completedWithScore = tasks.filter(t => t.qualityScore)
  const avgQualityScore = completedWithScore.length > 0
    ? Math.round(completedWithScore.reduce((sum, t) => sum + (t.qualityScore || 0), 0) / completedWithScore.length * 10) / 10
    : null

  return {
    total: tasks.length,
    completed: Object.values(byDate).reduce((sum, d) => sum + d.completed, 0),
    skipped: Object.values(byDate).reduce((sum, d) => sum + d.skipped, 0),
    pending: Object.values(byDate).reduce((sum, d) => sum + d.pending, 0),
    rejected: Object.values(byDate).reduce((sum, d) => sum + d.rejected, 0),
    avgQualityScore,
    trend,
    byArea,
  }
}

/**
 * 获取员工绩效统计
 */
export async function getStaffPerformance(storeId: string, startDate: string, endDate: string) {
  const tasks = await prisma.hygieneTask.findMany({
    where: {
      storeId,
      date: { gte: startDate, lte: endDate },
    },
    include: { staff: { select: { id: true, name: true } } },
  })

  const byStaff = tasks.reduce((acc, task) => {
    const staffId = task.staffId || 'unassigned'
    const staffName = task.staff?.name || 'Unassigned'

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
      }
    }

    acc[staffId].total++
    if (['completed', 'approved'].includes(task.status)) acc[staffId].completed++
    if (task.status === 'skipped') acc[staffId].skipped++
    if (task.status === 'rejected') acc[staffId].rejected++
    if (task.qualityScore) {
      acc[staffId].qualityScores.push(task.qualityScore)
    }

    return acc
  }, {} as Record<string, any>)

  // 计算平均质量分
  Object.values(byStaff).forEach((staff: any) => {
    if (staff.qualityScores.length > 0) {
      staff.avgQualityScore = Math.round(staff.qualityScores.reduce((a: number, b: number) => a + b, 0) / staff.qualityScores.length * 10) / 10
    }
    delete staff.qualityScores
    staff.completionRate = staff.total > 0 ? Math.round((staff.completed + staff.skipped) / staff.total * 100) : 0
  })

  return Object.values(byStaff).sort((a, b) => b.completed - a.completed)
}

// ============================================
// 自动任务生成（定时任务调用）
// ============================================

export async function processDueTemplates() {
  const now = new Date()

  // 查找所有需要触发的模板
  const dueTemplates = await prisma.hygieneTemplate.findMany({
    where: {
      status: 'active',
      autoGenerate: true,
      nextTriggerAt: { lte: now },
    },
  })

  const createdTasks = []

  for (const template of dueTemplates) {
    const today = new Date().toISOString().split('T')[0]

    // 检查是否应该在这天生成
    if (!shouldGenerateOnDate(template, today)) {
      await prisma.hygieneTemplate.update({
        where: { id: template.id },
        data: { nextTriggerAt: calculateNextTrigger(template.frequency, template.time, template.specificDays) },
      })
      continue
    }

    // 获取执行员工
    const staffIds = await resolveStaffIds(template, template.storeId)

    for (const staffId of staffIds) {
      // 检查今天是否已为此模板+员工创建过任务
      const existing = await prisma.hygieneTask.findFirst({
        where: { templateId: template.id, staffId, date: today },
      })
      if (existing) continue

      const task = await prisma.hygieneTask.create({
        data: {
          storeId: template.storeId,
          templateId: template.id,
          staffId,
          areaCode: template.areaCode,
          name: template.name,
          date: today,
          time: template.time,
          priority: template.priority,
          status: 'pending',
        },
      })

      await createTaskLog(task.id, staffId, 'created', null, null, 'Auto-generated by system')

      // 发送提醒
      socketManager.emitToStaff(staffId, 'hygiene:reminder', {
        taskId: task.id,
        areaCode: task.areaCode,
        name: task.name,
        time: task.time,
        priority: task.priority,
      })

      createdTasks.push(task)
    }

    // 更新下次触发时间
    await prisma.hygieneTemplate.update({
      where: { id: template.id },
      data: { nextTriggerAt: calculateNextTrigger(template.frequency, template.time, template.specificDays) },
    })
  }

  // 广播到 POS 端
  if (createdTasks.length > 0) {
    socketManager.emitToStore(createdTasks[0].storeId, 'hygiene:reminder', {
      count: createdTasks.length,
      message: `${createdTasks.length} new hygiene tasks generated`,
    })
  }

  return createdTasks.length
}

// ============================================
// 辅助函数
// ============================================

/**
 * 根据模板分配方式解析员工ID列表
 */
async function resolveStaffIds(template: any, storeId: string): Promise<string[]> {
  if (template.assignedType === 'staff' && template.staffId) {
    return [template.staffId]
  }

  if (template.assignedType === 'area' && template.areaManagerId) {
    // 查找该区域负责人下的所有员工
    // 这里简化处理，实际应该查询该区域的员工列表
    return [template.areaManagerId]
  }

  if (template.assignedType === 'shift' && template.shift) {
    // 查询该班次今天的所有员工
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]

    const schedules = await prisma.schedule.findMany({
      where: {
        date: dateStr,
        shift: template.shift,
        status: { in: ['scheduled', 'confirmed'] },
      },
      select: { staffId: true },
    })

    return schedules.map(s => s.staffId)
  }

  return []
}

/**
 * 检查模板是否应该在指定日期生成
 */
function shouldGenerateOnDate(template: any, dateStr: string): boolean {
  if (!template.specificDays) return true

  try {
    const specificDays = JSON.parse(template.specificDays)
    if (!Array.isArray(specificDays) || specificDays.length === 0) return true

    const date = new Date(dateStr)
    const dayOfWeek = date.getDay() // 0=周日, 1=周一, ...

    // specificDays 使用 1-7 (周一到周日) 或 0-6 (周日到周六)
    return specificDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek)
  } catch {
    return true
  }
}

/**
 * 计算下次触发时间
 */
function calculateNextTrigger(frequency?: string, time?: string, specificDays?: string | null): Date {
  const now = new Date()
  const [hours, minutes] = (time || '10:00').split(':').map(Number)

  const next = new Date(now)
  next.setHours(hours, minutes, 0, 0)

  // 如果 specificDays 存在，优先按特定日期计算
  if (specificDays && frequency === 'specific_days') {
    try {
      const days = JSON.parse(specificDays)
      if (Array.isArray(days) && days.length > 0) {
        const dayOfWeek = next.getDay()
        const currentDayIndex = dayOfWeek === 0 ? 7 : dayOfWeek

        // 找到下一个指定日
        let daysToAdd = 0
        for (let i = 1; i <= 7; i++) {
          const checkDay = (currentDayIndex + i - 1) % 7 + 1
          if (days.includes(checkDay)) {
            daysToAdd = i
            break
          }
        }
        next.setDate(next.getDate() + daysToAdd)
        return next
      }
    } catch { /* ignore */ }
  }

  switch (frequency) {
    case 'daily':
      if (next <= now) next.setDate(next.getDate() + 1)
      break
    case 'weekly':
      const dayOfWeek = next.getDay()
      const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 6 ? 2 : (8 - dayOfWeek)
      next.setDate(next.getDate() + daysUntilMonday)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    default:
      next.setDate(next.getDate() + 1)
  }

  return next
}

/**
 * 计算任务实际耗时
 */
function calculateActualMinutes(taskId: string): number {
  // 这个需要在 task 数据中已有 startedAt
  // 简化处理，返回 null 由前端计算
  return 0
}

// ============================================
// 预设模板生成
// ============================================

/**
 * 生成奶茶店常用预设模板
 */
export async function seedDefaultTemplates(storeId: string) {
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
  ]

  const created = []
  for (const template of defaultTemplates) {
    const existing = await prisma.hygieneTemplate.findFirst({
      where: { storeId, name: template.name },
    })
    if (existing) continue

    const createdTemplate = await createTemplate({
      storeId,
      ...template,
    })
    created.push(createdTemplate)
  }

  return created
}
