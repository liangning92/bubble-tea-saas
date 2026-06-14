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
router.post('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
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
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await updateAttendanceRule(req.params.id, req.body)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update attendance rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update attendance rule' })
  }
})

// DELETE /api/attendance-rules/:id - Delete attendance rule
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    await deleteAttendanceRule(req.params.id)
    res.json({ code: 200, message: 'Attendance rule deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete attendance rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete attendance rule' })
  }
})

export { router as attendanceRuleRouter }