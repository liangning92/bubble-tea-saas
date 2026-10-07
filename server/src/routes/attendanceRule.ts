import { z } from 'zod'
import { validateBody } from '../utils/validation'
import prisma from '../config/database'
import { requireResourceStore } from '../middlewares/resourceStore'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import {
  getAttendanceRules,
  getDefaultAttendanceRule,
  createAttendanceRule,
  updateAttendanceRule,
  deleteAttendanceRule
} from '../services/AttendanceRuleService'

const router = Router()
const scope = requireResourceStore(req => prisma.attendanceRule.findUnique({ where: { id: req.params.id }, select: { storeId: true } }))
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const money = z.number().int().nonnegative().nullable().optional()
const ratio = z.number().min(0).max(1).nullable().optional()
const ruleSchema = z.object({ name: z.string().trim().min(1), workStartTime: time, workEndTime: time, gracePeriod: z.number().int().min(0).max(120).optional(), lateDeductionType: z.enum(['none', 'fixed', 'daily_rate']).default('none'), lateDeductionFixed: money, lateDeductionDailyRate: ratio, absenceDeductionType: z.enum(['none', 'fixed', 'daily_rate']).default('none'), absenceDeductionFixed: money, absenceDeductionDailyRate: ratio, earlyLeaveDeductionType: z.enum(['none', 'fixed', 'daily_rate']).default('none'), earlyLeaveDeductionFixed: money, earlyLeaveDeductionDailyRate: ratio, sickLeaveDeductionType: z.enum(['none', 'fixed', 'daily_rate']).default('none'), sickLeaveDeductionFixed: money, sickLeaveDeductionDailyRate: ratio, overtimeRate: z.number().min(0).max(10).optional(), overtimeMinHours: z.number().int().min(0).max(24).optional(), isDefault: z.boolean().optional(), isActive: z.boolean().optional() })

// GET /api/attendance-rules - Get attendance rules for store
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const rules = await getAttendanceRules(req.user!.storeId)
    res.json({ code: 200, data: rules, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get attendance rules error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get attendance rules' })
  }
})

// GET /api/attendance-rules/default - Get default rule for store
router.get('/default', authenticate, async (req: AuthRequest, res) => {
  try {
    const rule = await getDefaultAttendanceRule(req.user!.storeId)
    res.json({ code: 200, data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get default attendance rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get default attendance rule' })
  }
})

// POST /api/attendance-rules - Create attendance rule
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(ruleSchema), async (req: AuthRequest, res) => {
  try {
    const result = await createAttendanceRule({
      ...req.body,
      storeId: req.user!.storeId
    })
    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create attendance rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create attendance rule' })
  }
})

// PUT /api/attendance-rules/:id - Update attendance rule
router.put('/:id', authenticate, authorize('admin', 'manager'), scope, validateBody(ruleSchema.partial()), async (req: AuthRequest, res) => {
  try {
    const result = await updateAttendanceRule(req.params.id, req.body)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update attendance rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update attendance rule' })
  }
})

// DELETE /api/attendance-rules/:id - Delete attendance rule
router.delete('/:id', authenticate, authorize('admin', 'manager'), scope, async (req: AuthRequest, res) => {
  try {
    await deleteAttendanceRule(req.params.id)
    res.json({ code: 200, message: 'Attendance rule deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete attendance rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete attendance rule' })
  }
})

export { router as attendanceRuleRouter }