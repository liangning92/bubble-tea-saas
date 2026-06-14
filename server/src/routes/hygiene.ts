import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody, validateQuery } from '../utils/validation'
import * as HygieneService from '../services/HygieneService'

const router = Router()

// ============================================
// 区域管理
// ============================================

// GET /api/hygiene/areas
router.get('/areas', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const areas = await HygieneService.getAreas(storeId)
    res.json({ code: 200, data: { list: areas } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// POST /api/hygiene/areas
router.post('/areas', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const area = await HygieneService.createArea({
      ...req.body,
      storeId: req.user!.storeId,
    })
    res.status(201).json({ code: 201, data: area })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/areas/:id
router.put('/areas/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const area = await HygieneService.updateArea(req.params.id, req.body)
    res.json({ code: 200, data: area })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// DELETE /api/hygiene/areas/:id
router.delete('/areas/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await HygieneService.deleteArea(req.params.id)
    res.json({ code: 200, message: 'Area deleted' })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// POST /api/hygiene/areas/init - 初始化预设区域
router.post('/areas/init', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const areas = await HygieneService.initDefaultAreas(req.user!.storeId)
    res.json({ code: 200, data: { list: areas } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// ============================================
// 模板管理
// ============================================

// GET /api/hygiene/templates
router.get('/templates', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { areaCode, category, status } = req.query
    const templates = await HygieneService.getTemplates(storeId, {
      areaCode: areaCode as string,
      category: category as string,
      status: status as string,
    })
    res.json({ code: 200, data: { list: templates } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/templates/:id
router.get('/templates/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const template = await HygieneService.getTemplateById(req.params.id)
    if (!template) return res.status(404).json({ code: 404, message: 'Template not found' })
    res.json({ code: 200, data: template })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// POST /api/hygiene/templates
router.post('/templates', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const template = await HygieneService.createTemplate({
      ...req.body,
      storeId: req.user!.storeId,
    })
    res.status(201).json({ code: 201, data: template })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/templates/:id
router.put('/templates/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const template = await HygieneService.updateTemplate(req.params.id, req.body)
    res.json({ code: 200, data: template })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// DELETE /api/hygiene/templates/:id
router.delete('/templates/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await HygieneService.deleteTemplate(req.params.id)
    res.json({ code: 200, message: 'Template deleted' })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// POST /api/hygiene/templates/:id/duplicate
router.post('/templates/:id/duplicate', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const template = await HygieneService.duplicateTemplate(req.params.id, req.user!.storeId)
    res.status(201).json({ code: 201, data: template })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// POST /api/hygiene/templates/seed - 生成预设模板
router.post('/templates/seed', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const templates = await HygieneService.seedDefaultTemplates(req.user!.storeId)
    res.status(201).json({ code: 201, data: { list: templates } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// ============================================
// 任务管理
// ============================================

// GET /api/hygiene/tasks
router.get('/tasks', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { date, shift, areaCode, staffId, status } = req.query
    if (!date) return res.status(400).json({ code: 400, message: 'date required (YYYY-MM-DD)' })

    const tasks = await HygieneService.getTasks(storeId, date as string, {
      shift: shift as string,
      areaCode: areaCode as string,
      staffId: staffId as string,
      status: status as string,
    })
    res.json({ code: 200, data: { list: tasks } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/tasks/my - 获取当前员工任务 (必须在 /tasks/:id 前面)
router.get('/tasks/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffId = req.user!.staffId
    if (!staffId) return res.status(400).json({ code: 400, message: 'staffId required' })
    const { date } = req.query
    const tasks = await HygieneService.getTasksByStaff(staffId, (date as string) || new Date().toISOString().split('T')[0])
    res.json({ code: 200, data: { list: tasks } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/tasks/pending
router.get('/tasks/pending', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { staffId } = req.query
    const tasks = await HygieneService.getPendingTasks(storeId, { staffId: staffId as string })
    res.json({ code: 200, data: { list: tasks } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/tasks/:id
router.get('/tasks/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const task = await HygieneService.getTaskById(req.params.id)
    if (!task) return res.status(404).json({ code: 404, message: 'Task not found' })
    res.json({ code: 200, data: task })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})
router.get('/tasks/pending', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { staffId } = req.query
    const tasks = await HygieneService.getPendingTasks(storeId, { staffId: staffId as string })
    res.json({ code: 200, data: { list: tasks } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// POST /api/hygiene/tasks/generate - 手动生成任务
router.post('/tasks/generate', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { date } = req.body
    const storeId = req.body.storeId || req.user!.storeId
    if (!date) return res.status(400).json({ code: 400, message: 'date required (YYYY-MM-DD)' })

    const count = await HygieneService.generateDailyTasks(storeId, date)
    res.status(201).json({ code: 201, message: `Generated ${count} tasks`, data: { count } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/tasks/:id/start - 开始执行任务
router.put('/tasks/:id/start', authenticate, async (req: AuthRequest, res) => {
  try {
    const task = await HygieneService.startTask(req.params.id, req.user!.staffId || '')
    res.json({ code: 200, data: task })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/tasks/:id/complete - 完成提交任务
router.put('/tasks/:id/complete', authenticate, async (req: AuthRequest, res) => {
  try {
    const { photoUrl, signatureUrl, note, checklistResults } = req.body
    // Get staff name from staffId
    const staffName = req.user!.staffId ? await getStaffName(req.user!.staffId) : 'Unknown'
    const task = await HygieneService.completeTask(req.params.id, req.user!.staffId || '', staffName, {
      photoUrl,
      signatureUrl,
      note,
      checklistResults,
    })
    res.json({ code: 200, data: task })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/tasks/:id/approve - 主管审核
router.put('/tasks/:id/approve', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { qualityScore, note, reject, rejectReason } = req.body
    const approverName = req.user!.staffId ? await getStaffName(req.user!.staffId) : 'Unknown'
    const task = await HygieneService.approveTask(req.params.id, req.user!.staffId || '', approverName, {
      qualityScore,
      note,
      reject,
      rejectReason,
    })
    res.json({ code: 200, data: task })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/tasks/:id/skip - 跳过任务
router.put('/tasks/:id/skip', authenticate, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body
    const staffName = req.user!.staffId ? await getStaffName(req.user!.staffId) : 'Unknown'
    const task = await HygieneService.skipTask(req.params.id, req.user!.staffId || '', staffName, reason)
    res.json({ code: 200, data: task })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/tasks/:id/issue - 上报问题
router.put('/tasks/:id/issue', authenticate, async (req: AuthRequest, res) => {
  try {
    const { description, photoUrl } = req.body
    const staffName = req.user!.staffId ? await getStaffName(req.user!.staffId) : 'Unknown'
    const task = await HygieneService.reportIssue(req.params.id, req.user!.staffId || '', staffName, {
      description,
      photoUrl,
    })
    res.json({ code: 200, data: task })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// ============================================
// 日志
// ============================================

// GET /api/hygiene/tasks/:id/logs
router.get('/tasks/:id/logs', authenticate, async (req: AuthRequest, res) => {
  try {
    const logs = await HygieneService.getTaskLogs(req.params.id)
    res.json({ code: 200, data: { list: logs } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// ============================================
// 统计
// ============================================

// GET /api/hygiene/stats
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ code: 400, message: 'date required (YYYY-MM-DD)' })
    const stats = await HygieneService.getStats(req.user!.storeId, date as string)
    res.json({ code: 200, data: stats })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/stats/range
router.get('/stats/range', authenticate, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return res.status(400).json({ code: 400, message: 'startDate and endDate required' })
    }
    const stats = await HygieneService.getStatsByRange(req.user!.storeId, startDate as string, endDate as string)
    res.json({ code: 200, data: stats })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/stats/staff
router.get('/stats/staff', authenticate, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return res.status(400).json({ code: 400, message: 'startDate and endDate required' })
    }
    const stats = await HygieneService.getStaffPerformance(req.user!.storeId, startDate as string, endDate as string)
    res.json({ code: 200, data: { list: stats } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// ============================================
// 预设数据
// ============================================

// GET /api/hygiene/categories - 获取任务分类（用户配置优先，回退到预设）
router.get('/categories', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.CATEGORIES)
    res.json({ code: 200, data })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/priorities - 获取优先级（用户配置优先，回退到预设）
router.get('/priorities', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.PRIORITIES)
    res.json({ code: 200, data })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/shifts - 获取班次（用户配置优先，回退到预设）
router.get('/shifts', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.SHIFTS)
    res.json({ code: 200, data })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/evidence-types - 获取证据类型（用户配置优先，回退到预设）
router.get('/evidence-types', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.EVIDENCE_TYPES)
    res.json({ code: 200, data })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/weekdays - 获取工作日（用户配置优先，回退到预设）
router.get('/weekdays', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.WEEKDAYS)
    res.json({ code: 200, data })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/frequencies - 获取执行频率（用户配置优先，回退到预设）
router.get('/frequencies', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.FREQUENCIES)
    res.json({ code: 200, data })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/assigned-types - 获取分配方式（用户配置优先，回退到预设）
router.get('/assigned-types', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = await HygieneService.getHygieneConfig(storeId, HygieneService.HYGIENE_CONFIG_KEYS.ASSIGNED_TYPES)
    res.json({ code: 200, data })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/areas/preset - 获取预设区域
router.get('/areas/preset', authenticate, async (req: AuthRequest, res) => {
  res.json({ code: 200, data: HygieneService.DEFAULT_AREAS })
})

// ============================================
// 配置管理（用户可自定义）
// ============================================

// GET /api/hygiene/config - 获取所有配置
router.get('/config', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const configs = await HygieneService.getAllHygieneConfigs(storeId)
    res.json({ code: 200, data: configs })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/hygiene/config/:key - 获取单个配置
router.get('/config/:key', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const config = await HygieneService.getHygieneConfig(storeId, req.params.key)
    res.json({ code: 200, data: config })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// PUT /api/hygiene/config/:key - 保存配置
router.put('/config/:key', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const config = await HygieneService.setHygieneConfig(storeId, req.params.key, req.body)
    res.json({ code: 200, data: config })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// ============================================
// 辅助函数
// ============================================

async function getStaffName(staffId: string): Promise<string> {
  const prisma = require('../config/database').default
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { name: true },
  })
  return staff?.name || 'Unknown'
}

export { router as hygieneRouter }
